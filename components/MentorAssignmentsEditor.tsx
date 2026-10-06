"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PlanTask } from "@/lib/planTasks";

// Common Step 1 study resources - lets a mentor pick from a list instead of
// retyping the same handful of resource names on every assignment (and
// keeps spelling/capitalization consistent, e.g. always "BNB" not
// sometimes "Boards and Beyond"). "Other" falls through to a free-text box
// for anything not on this list.
const RESOURCE_OPTIONS = [
  "BNB",
  "FIRST AID",
  "PATHOMA",
  "SKETCHY MEDICAL",
  "SKETCHY PHARM",
  "UWORLD",
  "AMBOSS",
  "PHYSEO",
  "DIVINE INTERVENTION PHARM",
  "PIXORIZE",
  "OSMOSIS",
  "USMLE RX",
  "NBME / FREE 120",
  "UWSA",
];

// Every organ system/subject a mentor would organize a Step 1 assignment
// under. Same "Other" fallback as resources above. Also doubles as the
// fixed list of planner-template categories below - a template is just
// "this mentor's saved multi-day plan for this system."
const SYSTEM_OPTIONS = [
  "CARDIOVASCULAR",
  "RESPIRATORY/PULMONARY",
  "RENAL/GENITOURINARY",
  "GASTROINTESTINAL",
  "ENDOCRINE",
  "REPRODUCTIVE",
  "HEMATOLOGY/ONCOLOGY",
  "MUSCULOSKELETAL/RHEUMATOLOGY",
  "NEUROLOGY",
  "PSYCHIATRY/BEHAVIORAL SCIENCE",
  "DERMATOLOGY",
  "IMMUNOLOGY",
  "MICROBIOLOGY",
  "BIOCHEMISTRY",
  "PHARMACOLOGY",
  "GENERAL PRINCIPLES/PATHOLOGY",
  "BIOSTATISTICS/EPIDEMIOLOGY",
  "ETHICS",
];

const CUSTOM_OPTION = "__custom__";

interface DraftTask {
  key: string; // real id for existing rows, "new-N" for freshly added ones
  id: string | null;
  title: string;
  isOptional: boolean;
  completed: boolean;
  // How many days total this assignment should cover, counting the day
  // currently open as day 1 - 1 means "just this day" (the old, only
  // behavior). Entered once per assignment instead of making a mentor
  // reopen the calendar and retype the same title on every day of a
  // multi-day block (e.g. "40 Cardiology Questions" for a 10-day system).
  repeatDays: number;
}

// A mentor's own reusable, multi-day plan for one system (e.g.
// "CARDIOVASCULAR" -> Day 1: Pathoma 2.1-2.4 + 40 UWorld Qs, Day 2: Sketchy
// Cardio + 40 more Qs, ...) - built once in the "Manage templates" view
// below, then dropped onto any day for any student in one click, with Day 1
// landing on whichever date is currently open and Day 2, Day 3, etc.
// landing on the following calendar days. Entirely mentor-scoped
// (mentor_planner_templates.mentor_id), never tied to one particular
// student. `name` is normally one of SYSTEM_OPTIONS, but a mentor can also
// create a "custom category" template for something outside that list
// (e.g. "NBME Review Week").
interface TemplateItem {
  id: string;
  title: string;
  detail: string | null;
  isOptional: boolean;
  sortOrder: number;
}
interface TemplateDay {
  id: string;
  dayNumber: number;
  // Free-text "what should be done this day" - shown both while building
  // the template (Manage templates) and in the apply preview, above that
  // day's individual items.
  notes: string | null;
  items: TemplateItem[];
}
interface Template {
  id: string;
  name: string;
  days: TemplateDay[]; // sorted by dayNumber ascending
}

function toDraft(t: PlanTask): DraftTask {
  return {
    key: t.id,
    id: t.id,
    title: t.title,
    isOptional: t.is_optional,
    completed: t.completed,
    repeatDays: 1,
  };
}

// Pure UTC date-string arithmetic, same approach used everywhere else in the
// planner (see lib/plannerCalendar.ts's addDays) - never touches the
// browser's local timezone, so "10 days starting today" always lands on the
// same calendar dates no matter where the mentor is sitting.
function addDaysIso(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * "Mentor Assignments" (Study Planner v1 item 6) - the mentor's side, on
 * the student-progress page. Lets a mentor set the checklist of tasks a
 * student sees (and checks off) for one specific day.
 *
 * Deliberately diffs against the original list on save (update changed
 * titles, insert new rows, delete removed ones) instead of the "delete
 * everything then reinsert" approach UWorldBlockTracker uses - a student
 * may have already checked some of these off, and blowing away every row
 * would silently wipe that completed/completed_at state every time a
 * mentor tweaks the list.
 *
 * Each assignment also has a "Repeat for N days" field: a mentor planning a
 * 10-day block (e.g. "40 Cardiology Questions" every day of a system) types
 * it once on the first day and sets Repeat to 10, instead of opening all 10
 * days on the calendar and retyping the same title into each one. On save,
 * this creates one independent mentor_plan_tasks row per day (date, date+1,
 * ... date+9) - each is its own row a student can check off separately, not
 * a single linked "recurring" record, so editing/removing it later still
 * only ever affects whichever single day is currently open (same as any
 * other assignment).
 *
 * After a successful save, `drafts` is reset from a fresh read of this
 * day's rows (not just left as-is) - a plain `router.refresh()` re-fetches
 * the SERVER-rendered `initialTasks` prop, but since this component reads
 * that prop into state via `useState(() => ...)` (which only runs once, on
 * mount), the local `drafts` array previously stayed stale after a save:
 * every newly-inserted draft kept `id: null` in memory even though it now
 * had a real row in the database. Clicking Save again on the same day
 * (without navigating away first) then re-inserted every one of those as a
 * brand-new duplicate row - and for any assignment with "Repeat for N
 * days" set, re-copied it onto all those future days again too. Explicitly
 * re-syncing `drafts` from the database here closes that gap: a second
 * Save with no further edits now has nothing left to (re)insert.
 *
 * "+ Use Template" (mentor_planner_templates -> mentor_planner_template_days
 * -> mentor_planner_template_items, all RLS-scoped to this mentor by
 * mentors.email = auth.jwt() email) lets a mentor build one reusable,
 * MULTI-DAY plan per system - the same 18 systems as the "Add From Resource
 * List" dialog's System dropdown above. Each day in the plan has its own
 * free-text "what should be done" notes box plus as many individual
 * assignment items (title + optional extra detail) as that day needs.
 * Applying a template writes every checked item straight to the database
 * (no separate Save click needed) with Day 1 landing on whichever date is
 * currently open and Day 2, Day 3, etc. landing on the following calendar
 * days - never onto an already-passed day, same rule "Repeat for" already
 * follows above. Every system always shows up in the picker even before a
 * mentor has added anything to it (nothing is created in the database
 * until the first day/item is saved), so the structure matches "one
 * permanent, day-by-day planner per system" rather than a mentor having to
 * remember to create each one first. A mentor can also add a "custom
 * category" template for something that doesn't fit the 18 systems. The
 * same dialog doubles as the template manager (add/remove days and items,
 * delete a template) so there's no separate settings page to find.
 * Templates are loaded lazily (only once the dialog is first opened) since
 * they're mentor-wide, not specific to this student or day.
 */
export default function MentorAssignmentsEditor({
  studentId,
  mentorId,
  date,
  initialTasks,
  todayIso,
}: {
  studentId: string;
  mentorId: string;
  date: string;
  initialTasks: PlanTask[];
  // Today's date (Eastern Time, same as everywhere else in the planner) -
  // once `date` is before this, the day has already happened and the whole
  // list below becomes read-only: no adding, no editing text, no removing.
  // Only today or an upcoming day can be changed.
  todayIso: string;
}) {
  const router = useRouter();
  const isPastDay = date < todayIso;
  const [drafts, setDrafts] = useState<DraftTask[]>(() => initialTasks.map(toDraft));
  const [nextNewId, setNextNewId] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // "Add from list" dialog - lets a mentor build an assignment by picking a
  // Resource and a System from dropdowns instead of typing "BNB/ENDOCRINE"
  // out by hand every time, with an optional free-text Topic (e.g.
  // "Thyroid") tacked on as a third segment. Either dropdown can be set to
  // "Other" to reveal a plain text box for something not on the list.
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [dialogResource, setDialogResource] = useState(RESOURCE_OPTIONS[0]);
  const [dialogResourceCustom, setDialogResourceCustom] = useState("");
  const [dialogSystem, setDialogSystem] = useState(SYSTEM_OPTIONS[0]);
  const [dialogSystemCustom, setDialogSystemCustom] = useState("");
  const [dialogTopic, setDialogTopic] = useState("");
  const [dialogOptional, setDialogOptional] = useState(false);
  const [dialogRepeatDays, setDialogRepeatDays] = useState(1);
  const [dialogError, setDialogError] = useState<string | null>(null);

  // "Use Template" dialog - see doc comment above for what this does.
  // `templates === null` means "never loaded yet"; an empty array means
  // "loaded, mentor just hasn't saved anything to any system yet" - used to
  // tell those two cases apart (only the first one needs a DB round trip).
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  // Selection is tracked by SYSTEM name (not a database id) since most
  // systems have no template row yet until a mentor adds their first day -
  // see findTemplateByName below. Shared between the apply view and the
  // manage view, so switching systems in one carries over to the other.
  const [selectedSystemName, setSelectedSystemName] = useState<string>(SYSTEM_OPTIONS[0]);
  const [templateItemChecks, setTemplateItemChecks] = useState<Record<string, boolean>>({});
  const [manageMode, setManageMode] = useState(false);
  const [customCategoryName, setCustomCategoryName] = useState("");
  // Draft text for the "add item to this day" mini-form, keyed by
  // "<system>::<dayNumber>" so every day's box (including the always-present
  // "next day" placeholder) keeps its own in-progress text.
  const [itemDraftByDay, setItemDraftByDay] = useState<Record<string, { title: string; detail: string }>>({});
  const [manageSaving, setManageSaving] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  function findTemplateByName(name: string): Template | null {
    return (templates ?? []).find((t) => t.name.toLowerCase() === name.toLowerCase()) ?? null;
  }

  // Any template a mentor created that ISN'T one of the 18 fixed systems
  // above (e.g. "NBME Review Week") - shown as its own section in both the
  // apply and manage pickers.
  const customTemplates = (templates ?? [])
    .filter((t) => !SYSTEM_OPTIONS.some((s) => s.toLowerCase() === t.name.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  function updateDraft(key: string, patch: Partial<DraftTask>) {
    if (isPastDay) return;
    setSaveMessage(null);
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  // Unchanged - adds a blank free-text row, for one-off assignments that
  // don't fit the Resource/System pattern (e.g. "40 Cardiology Questions").
  function addAssignment() {
    if (isPastDay) return;
    setSaveMessage(null);
    const key = `new-${nextNewId}`;
    setNextNewId((n) => n + 1);
    setDrafts((prev) => [...prev, { key, id: null, title: "", isOptional: false, completed: false, repeatDays: 1 }]);
  }

  function openAddDialog() {
    if (isPastDay) return;
    setSaveMessage(null);
    setDialogResource(RESOURCE_OPTIONS[0]);
    setDialogResourceCustom("");
    setDialogSystem(SYSTEM_OPTIONS[0]);
    setDialogSystemCustom("");
    setDialogTopic("");
    setDialogOptional(false);
    setDialogRepeatDays(1);
    setDialogError(null);
    setShowAddDialog(true);
  }

  function addAssignmentFromDialog() {
    const resource = dialogResource === CUSTOM_OPTION ? dialogResourceCustom.trim() : dialogResource;
    const system = dialogSystem === CUSTOM_OPTION ? dialogSystemCustom.trim() : dialogSystem;
    if (!resource || !system) {
      setDialogError("Pick (or type) both a resource and a system.");
      return;
    }
    const topic = dialogTopic.trim();
    const title = [resource, system, topic].filter(Boolean).join("/").toUpperCase();
    setSaveMessage(null);
    const key = `new-${nextNewId}`;
    setNextNewId((n) => n + 1);
    setDrafts((prev) => [
      ...prev,
      {
        key,
        id: null,
        title,
        isOptional: dialogOptional,
        completed: false,
        repeatDays: Math.max(1, Math.min(90, Math.round(dialogRepeatDays) || 1)),
      },
    ]);
    setShowAddDialog(false);
  }

  function removeAssignment(key: string) {
    if (isPastDay) return;
    setSaveMessage(null);
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  }

  async function loadTemplates() {
    setTemplatesLoading(true);
    setTemplatesError(null);
    const supabase = createClient();

    const { data: templateRows, error: templateError } = await supabase
      .from("mentor_planner_templates")
      .select("id, name")
      .eq("mentor_id", mentorId)
      .order("name", { ascending: true });
    if (templateError) {
      setTemplatesLoading(false);
      setTemplatesError(templateError.message);
      return;
    }

    const templateIds = (templateRows ?? []).map((t) => t.id as string);
    let dayRows: { id: string; template_id: string; day_number: number; notes: string | null }[] = [];
    if (templateIds.length > 0) {
      const { data, error } = await supabase
        .from("mentor_planner_template_days")
        .select("id, template_id, day_number, notes")
        .in("template_id", templateIds)
        .order("day_number", { ascending: true });
      if (error) {
        setTemplatesLoading(false);
        setTemplatesError(error.message);
        return;
      }
      dayRows = data ?? [];
    }

    const dayIds = dayRows.map((d) => d.id);
    let itemRows: { id: string; template_day_id: string; title: string; detail: string | null; is_optional: boolean; sort_order: number }[] = [];
    if (dayIds.length > 0) {
      const { data, error } = await supabase
        .from("mentor_planner_template_items")
        .select("id, template_day_id, title, detail, is_optional, sort_order")
        .in("template_day_id", dayIds)
        .order("sort_order", { ascending: true });
      if (error) {
        setTemplatesLoading(false);
        setTemplatesError(error.message);
        return;
      }
      itemRows = data ?? [];
    }

    const grouped: Template[] = (templateRows ?? []).map((t) => ({
      id: t.id as string,
      name: t.name as string,
      days: dayRows
        .filter((d) => d.template_id === t.id)
        .map((d) => ({
          id: d.id,
          dayNumber: d.day_number,
          notes: d.notes,
          items: itemRows
            .filter((i) => i.template_day_id === d.id)
            .map((i) => ({ id: i.id, title: i.title, detail: i.detail, isOptional: i.is_optional, sortOrder: i.sort_order })),
        })),
    }));

    setTemplates(grouped);
    setTemplatesLoading(false);

    const current = grouped.find((t) => t.name.toLowerCase() === selectedSystemName.toLowerCase());
    const allItemIds = (current?.days ?? []).flatMap((d) => d.items.map((i) => i.id));
    setTemplateItemChecks(Object.fromEntries(allItemIds.map((id) => [id, true])));
  }

  function openTemplateDialog() {
    if (isPastDay) return;
    setSaveMessage(null);
    setManageMode(false);
    setTemplatesError(null);
    setShowTemplateDialog(true);
    if (templates === null) {
      loadTemplates();
    } else {
      const current = findTemplateByName(selectedSystemName);
      const allItemIds = (current?.days ?? []).flatMap((d) => d.items.map((i) => i.id));
      setTemplateItemChecks(Object.fromEntries(allItemIds.map((id) => [id, true])));
    }
  }

  function selectTemplate(name: string) {
    setSelectedSystemName(name);
    setTemplatesError(null);
    const t = findTemplateByName(name);
    const allItemIds = (t?.days ?? []).flatMap((d) => d.items.map((i) => i.id));
    setTemplateItemChecks(Object.fromEntries(allItemIds.map((id) => [id, true])));
  }

  // Creates the template row for `name` if it doesn't exist yet, returning
  // its id either way. Every system is shown in the UI up front, but
  // nothing exists in the database for it until this runs.
  async function ensureTemplateId(name: string): Promise<string> {
    const existing = findTemplateByName(name);
    if (existing) return existing.id;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("mentor_planner_templates")
      .insert({ mentor_id: mentorId, name })
      .select("id, name")
      .single();
    if (error) throw new Error(error.message);
    setTemplates((prev) => [...(prev ?? []), { id: data.id, name: data.name, days: [] }]);
    return data.id as string;
  }

  // Creates the day row for (name, dayNumber) if `dayId` is null (the
  // "next day" placeholder a mentor just started typing into), returning a
  // real day id either way.
  async function ensureDay(name: string, dayId: string | null, dayNumber: number): Promise<string> {
    if (dayId) return dayId;
    const templateId = await ensureTemplateId(name);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("mentor_planner_template_days")
      .insert({ template_id: templateId, day_number: dayNumber })
      .select("id, template_id, day_number, notes")
      .single();
    if (error) throw new Error(error.message);
    setTemplates((prev) =>
      (prev ?? []).map((tpl) =>
        tpl.id === templateId
          ? { ...tpl, days: [...tpl.days, { id: data.id, dayNumber: data.day_number, notes: data.notes, items: [] }] }
          : tpl
      )
    );
    return data.id as string;
  }

  async function saveDayNotes(name: string, dayId: string | null, dayNumber: number, notes: string) {
    setManageSaving(true);
    setManageError(null);
    try {
      const realDayId = await ensureDay(name, dayId, dayNumber);
      const supabase = createClient();
      const trimmed = notes.trim() || null;
      const { error } = await supabase.from("mentor_planner_template_days").update({ notes: trimmed }).eq("id", realDayId);
      if (error) throw new Error(error.message);
      setTemplates((prev) =>
        (prev ?? []).map((tpl) => ({
          ...tpl,
          days: tpl.days.map((d) => (d.id === realDayId ? { ...d, notes: trimmed } : d)),
        }))
      );
    } catch (err) {
      setManageError(err instanceof Error ? err.message : "Failed to save notes.");
    } finally {
      setManageSaving(false);
    }
  }

  async function addItemToDay(name: string, dayId: string | null, dayNumber: number) {
    const draftKey = `${name}::${dayNumber}`;
    const draft = itemDraftByDay[draftKey] ?? { title: "", detail: "" };
    const title = draft.title.trim();
    if (!title) return;
    setManageSaving(true);
    setManageError(null);
    try {
      const realDayId = await ensureDay(name, dayId, dayNumber);
      const existingDay = (templates ?? []).flatMap((t) => t.days).find((d) => d.id === realDayId);
      const sortOrder = existingDay ? existingDay.items.length : 0;
      const supabase = createClient();
      const { data, error } = await supabase
        .from("mentor_planner_template_items")
        .insert({ template_day_id: realDayId, title, detail: draft.detail.trim() || null, sort_order: sortOrder })
        .select("id, title, detail, is_optional, sort_order")
        .single();
      if (error) throw new Error(error.message);
      setTemplates((prev) =>
        (prev ?? []).map((tpl) => ({
          ...tpl,
          days: tpl.days.map((d) =>
            d.id === realDayId
              ? {
                  ...d,
                  items: [
                    ...d.items,
                    { id: data.id, title: data.title, detail: data.detail, isOptional: data.is_optional, sortOrder: data.sort_order },
                  ],
                }
              : d
          ),
        }))
      );
      setItemDraftByDay((prev) => ({ ...prev, [draftKey]: { title: "", detail: "" } }));
    } catch (err) {
      setManageError(err instanceof Error ? err.message : "Failed to add item.");
    } finally {
      setManageSaving(false);
    }
  }

  async function deleteTemplateItem(itemId: string) {
    setManageSaving(true);
    setManageError(null);
    const supabase = createClient();
    const { error } = await supabase.from("mentor_planner_template_items").delete().eq("id", itemId);
    setManageSaving(false);
    if (error) {
      setManageError(error.message);
      return;
    }
    setTemplates((prev) =>
      (prev ?? []).map((tpl) => ({ ...tpl, days: tpl.days.map((d) => ({ ...d, items: d.items.filter((i) => i.id !== itemId) })) }))
    );
  }

  async function toggleTemplateItemOptional(itemId: string, value: boolean) {
    const supabase = createClient();
    const { error } = await supabase.from("mentor_planner_template_items").update({ is_optional: value }).eq("id", itemId);
    if (error) {
      setManageError(error.message);
      return;
    }
    setTemplates((prev) =>
      (prev ?? []).map((tpl) => ({
        ...tpl,
        days: tpl.days.map((d) => ({ ...d, items: d.items.map((i) => (i.id === itemId ? { ...i, isOptional: value } : i)) })),
      }))
    );
  }

  async function deleteDay(dayId: string) {
    if (!window.confirm("Delete this day and all its items? This can't be undone.")) return;
    setManageSaving(true);
    setManageError(null);
    const supabase = createClient();
    const { error } = await supabase.from("mentor_planner_template_days").delete().eq("id", dayId);
    setManageSaving(false);
    if (error) {
      setManageError(error.message);
      return;
    }
    setTemplates((prev) => (prev ?? []).map((tpl) => ({ ...tpl, days: tpl.days.filter((d) => d.id !== dayId) })));
  }

  async function deleteTemplate(templateId: string, name: string) {
    if (!window.confirm(`Delete the entire "${name}" template (every day and item in it)? This can't be undone.`)) return;
    setManageSaving(true);
    setManageError(null);
    const supabase = createClient();
    const { error } = await supabase.from("mentor_planner_templates").delete().eq("id", templateId);
    setManageSaving(false);
    if (error) {
      setManageError(error.message);
      return;
    }
    setTemplates((prev) => (prev ?? []).filter((t) => t.id !== templateId));
  }

  async function createCustomCategory() {
    const name = customCategoryName.trim();
    if (!name) return;
    setManageSaving(true);
    setManageError(null);
    try {
      await ensureTemplateId(name);
      setCustomCategoryName("");
      setSelectedSystemName(name);
    } catch (err) {
      setManageError(err instanceof Error ? err.message : "Failed to create category.");
    } finally {
      setManageSaving(false);
    }
  }

  // Writes every checked item straight to mentor_plan_tasks - Day 1 on
  // `date`, Day 2 on `date`+1, etc. - skipping any day that's already
  // passed (same rule the "Repeat for" field follows in save() below), then
  // refreshes the currently-open day's checklist so new items show up
  // immediately without a separate Save click.
  async function applyTemplateSequence() {
    const t = findTemplateByName(selectedSystemName);
    if (!t || t.days.length === 0) return;

    const checked: { item: TemplateItem; dayNumber: number }[] = [];
    for (const d of t.days) {
      for (const item of d.items) {
        if (templateItemChecks[item.id]) checked.push({ item, dayNumber: d.dayNumber });
      }
    }
    if (checked.length === 0) {
      setTemplatesError("Pick at least one item to add.");
      return;
    }
    setTemplatesError(null);
    setSaveMessage(null);
    setApplyingTemplate(true);
    const supabase = createClient();

    const rows: {
      student_id: string;
      mentor_id: string;
      task_date: string;
      title: string;
      detail: string | null;
      is_optional: boolean;
      sort_order: number;
      source: "mentor";
    }[] = [];
    let furthestDate = date;
    for (const { item, dayNumber } of checked) {
      const targetDate = addDaysIso(date, dayNumber - 1);
      if (targetDate < todayIso) continue;
      rows.push({
        student_id: studentId,
        mentor_id: mentorId,
        task_date: targetDate,
        title: item.title,
        detail: item.detail,
        is_optional: item.isOptional,
        sort_order: item.sortOrder,
        source: "mentor",
      });
      if (targetDate > furthestDate) furthestDate = targetDate;
    }

    if (rows.length === 0) {
      setApplyingTemplate(false);
      setTemplatesError("Nothing to add - every selected day has already passed.");
      return;
    }

    const { error } = await supabase.from("mentor_plan_tasks").insert(rows);
    if (error) {
      setApplyingTemplate(false);
      setTemplatesError(error.message);
      return;
    }

    const { data: freshTasks, error: refetchError } = await supabase
      .from("mentor_plan_tasks")
      .select("*")
      .eq("student_id", studentId)
      .eq("task_date", date)
      .order("sort_order", { ascending: true });
    setApplyingTemplate(false);
    if (!refetchError && freshTasks) {
      setDrafts((freshTasks as PlanTask[]).map(toDraft));
    }

    setShowTemplateDialog(false);
    setSaveMessage(furthestDate !== date ? `Template applied - saved through ${furthestDate}.` : "Template applied.");

    // Fire-and-forget in-app notification to the student - a failure here
    // shouldn't block the apply itself, which already succeeded above.
    fetch("/api/notifications/relationship-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mentorId,
        studentId,
        type: "task_update",
        title: "Your mentor updated your tasks",
        detail:
          furthestDate !== date
            ? `Tasks for ${date} through ${furthestDate} were added or changed.`
            : `Tasks for ${date} were added or changed.`,
        link: "/planner",
      }),
    }).catch(() => {});

    router.refresh();
  }

  async function save() {
    if (isPastDay) return;
    setSaving(true);
    setSaveError(null);
    const supabase = createClient();

    const originalIds = new Set(initialTasks.map((t) => t.id));
    const remainingIds = new Set(drafts.filter((d) => d.id).map((d) => d.id as string));
    const removedIds = [...originalIds].filter((id) => !remainingIds.has(id));

    if (removedIds.length > 0) {
      const { error } = await supabase.from("mentor_plan_tasks").delete().in("id", removedIds);
      if (error) {
        setSaving(false);
        setSaveError(error.message);
        return;
      }
    }

    // Extra rows for the repeated days (date+1 .. date+(repeatDays-1)) -
    // built up across every draft first so it's a single bulk insert instead
    // of one round trip per day per assignment. These are always brand-new
    // rows regardless of whether the assignment itself is new or already
    // existed on `date` - "repeat this for 10 days" just means "also copy
    // it onto the next 9 days," it never touches what's already on those
    // other days.
    const repeatedRows: {
      student_id: string;
      mentor_id: string;
      task_date: string;
      title: string;
      is_optional: boolean;
      sort_order: number;
      source: "mentor";
    }[] = [];
    let furthestRepeatedDate: string | null = null;

    for (const [i, d] of drafts.entries()) {
      if (!d.title.trim()) continue;
      if (d.id) {
        const { error } = await supabase
          .from("mentor_plan_tasks")
          .update({ title: d.title, is_optional: d.isOptional, sort_order: i })
          .eq("id", d.id);
        if (error) {
          setSaving(false);
          setSaveError(error.message);
          return;
        }
      } else {
        const { error } = await supabase.from("mentor_plan_tasks").insert({
          student_id: studentId,
          mentor_id: mentorId,
          task_date: date,
          title: d.title,
          is_optional: d.isOptional,
          sort_order: i,
          source: "mentor",
        });
        if (error) {
          setSaving(false);
          setSaveError(error.message);
          return;
        }
      }

      const repeatDays = Math.max(1, Math.min(90, Math.round(d.repeatDays) || 1));
      for (let offset = 1; offset < repeatDays; offset++) {
        const taskDate = addDaysIso(date, offset);
        // Same rule as adding a brand-new assignment: never create a row on
        // an already-passed day, even as a side effect of repeating an
        // assignment that started on a past day (only reachable by editing
        // "Repeat for" on an existing row - the Add buttons are already
        // hidden for past days above).
        if (taskDate < todayIso) continue;
        repeatedRows.push({
          student_id: studentId,
          mentor_id: mentorId,
          task_date: taskDate,
          title: d.title,
          is_optional: d.isOptional,
          sort_order: i,
          source: "mentor",
        });
        if (!furthestRepeatedDate || taskDate > furthestRepeatedDate) furthestRepeatedDate = taskDate;
      }
    }

    if (repeatedRows.length > 0) {
      const { error } = await supabase.from("mentor_plan_tasks").insert(repeatedRows);
      if (error) {
        setSaving(false);
        setSaveError(error.message);
        return;
      }
    }

    // Re-sync local state from the database instead of trusting the old
    // in-memory `drafts` to still be accurate - see the doc comment above
    // the component for why leaving it as-is caused duplicate rows on a
    // second Save click.
    const { data: freshTasks, error: refetchError } = await supabase
      .from("mentor_plan_tasks")
      .select("*")
      .eq("student_id", studentId)
      .eq("task_date", date)
      .order("sort_order", { ascending: true });
    setSaving(false);
    if (refetchError) {
      // The save itself already succeeded above - only the local refresh
      // failed, so this isn't fatal. router.refresh() below still fixes the
      // display on this load; a mentor just shouldn't click Save again
      // without reloading first until the next successful sync.
      setSaveError(refetchError.message);
    } else {
      setDrafts(((freshTasks ?? []) as PlanTask[]).map(toDraft));
    }

    setSaveMessage(
      furthestRepeatedDate ? `Assignments saved - repeated through ${furthestRepeatedDate}.` : "Assignments saved."
    );

    // Fire-and-forget in-app notification to the student - a failure here
    // shouldn't block the save itself, which already succeeded above.
    fetch("/api/notifications/relationship-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mentorId,
        studentId,
        type: "task_update",
        title: "Your mentor updated your tasks",
        detail: furthestRepeatedDate
          ? `Tasks for ${date} through ${furthestRepeatedDate} were added or changed.`
          : `Tasks for ${date} were added or changed.`,
        link: "/planner",
      }),
    }).catch(() => {});

    router.refresh();
  }

  const selectedTemplate = findTemplateByName(selectedSystemName);

  return (
    <div className="space-y-2">
      {drafts.length === 0 ? (
        <p className="text-xs text-slate-500">No assignments set for this day yet.</p>
      ) : (
        <div className="space-y-1.5">
          {drafts.map((d) => (
            <div key={d.key} className="flex items-center gap-2 flex-wrap">
              {d.completed && (
                <span className="text-xs text-green-400 shrink-0" title="Student has marked this completed">
                  ✓
                </span>
              )}
              <input
                type="text"
                value={d.title}
                onChange={(e) => updateDraft(d.key, { title: e.target.value })}
                readOnly={isPastDay}
                placeholder="Assignment (e.g. 40 Cardiology Questions)"
                className={`input text-xs py-1 px-2 flex-1 min-w-[160px] ${
                  isPastDay ? "opacity-60 cursor-not-allowed" : ""
                }`}
              />
              {!isPastDay && (
                <>
                  <label className="flex items-center gap-1 text-xs text-slate-500 shrink-0">
                    <input
                      type="checkbox"
                      checked={d.isOptional}
                      onChange={(e) => updateDraft(d.key, { isOptional: e.target.checked })}
                      className="w-3.5 h-3.5"
                    />
                    Optional
                  </label>
                  <label
                    className="flex items-center gap-1 text-xs text-slate-500 shrink-0"
                    title="Copies this exact assignment onto the next days too, so you don't have to reopen the calendar and retype it for each one."
                  >
                    Repeat for
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={d.repeatDays}
                      onChange={(e) => updateDraft(d.key, { repeatDays: Number(e.target.value) || 1 })}
                      className="input text-xs py-1 px-1.5 w-12 text-center"
                    />
                    day{d.repeatDays === 1 ? "" : "s"}
                  </label>
                  <button
                    type="button"
                    onClick={() => removeAssignment(d.key)}
                    className="text-xs text-red-400 hover:text-red-300 shrink-0"
                  >
                    Remove
                  </button>
                </>
              )}
              {isPastDay && d.isOptional && (
                <span className="text-[10px] font-semibold text-slate-500 shrink-0">Optional</span>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3 flex-wrap pt-1">
        {!isPastDay && (
          <>
            <button type="button" onClick={openAddDialog} className="btn-secondary text-xs">
              + Add From Resource List
            </button>
            <button type="button" onClick={addAssignment} className="btn-secondary text-xs">
              + Add Custom Assignment
            </button>
            <button type="button" onClick={openTemplateDialog} className="btn-secondary text-xs">
              + Use Template
            </button>
          </>
        )}
        {!isPastDay && (
          <button type="button" onClick={save} disabled={saving} className="btn-primary text-xs">
            {saving ? "Saving..." : "Save"}
          </button>
        )}
        {saveMessage && <p className="text-xs text-green-400">{saveMessage}</p>}
        {saveError && <p className="text-xs text-red-400">{saveError}</p>}
      </div>
      {isPastDay ? (
        <p className="text-[11px] text-amber-400 pt-0.5">
          This day has already passed - it's now read-only. Assignments can only be added, edited, or
          removed on today or upcoming days.
        </p>
      ) : (
        <p className="text-[11px] text-slate-500 pt-0.5">
          Tip: set "Repeat for" on an assignment (e.g. 10) to apply it to today plus the next 9 days in one
          save, instead of adding it separately on every day. Or build a reusable, day-by-day "Use Template"
          plan once per system and drop the whole sequence onto any student starting from whatever day
          you're viewing.
        </p>
      )}

      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4">
          <div className="card max-w-sm w-full space-y-3">
            <p className="text-sm font-semibold">Add from resource list</p>

            <div>
              <label className="label">Resource</label>
              <select
                className="input text-sm"
                value={dialogResource}
                onChange={(e) => setDialogResource(e.target.value)}
              >
                {RESOURCE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
                <option value={CUSTOM_OPTION}>Other...</option>
              </select>
              {dialogResource === CUSTOM_OPTION && (
                <input
                  type="text"
                  className="input text-sm mt-1.5"
                  placeholder="Type the resource name"
                  value={dialogResourceCustom}
                  onChange={(e) => setDialogResourceCustom(e.target.value)}
                />
              )}
            </div>

            <div>
              <label className="label">System</label>
              <select
                className="input text-sm"
                value={dialogSystem}
                onChange={(e) => setDialogSystem(e.target.value)}
              >
                {SYSTEM_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
                <option value={CUSTOM_OPTION}>Other...</option>
              </select>
              {dialogSystem === CUSTOM_OPTION && (
                <input
                  type="text"
                  className="input text-sm mt-1.5"
                  placeholder="Type the system name"
                  value={dialogSystemCustom}
                  onChange={(e) => setDialogSystemCustom(e.target.value)}
                />
              )}
            </div>

            <div>
              <label className="label">Specific topic (optional)</label>
              <input
                type="text"
                className="input text-sm"
                placeholder="e.g. Thyroid"
                value={dialogTopic}
                onChange={(e) => setDialogTopic(e.target.value)}
              />
            </div>

            <p className="text-xs text-slate-500">
              Will be added as:{" "}
              <span className="text-slate-300 font-medium">
                {[
                  dialogResource === CUSTOM_OPTION ? dialogResourceCustom.trim() || "..." : dialogResource,
                  dialogSystem === CUSTOM_OPTION ? dialogSystemCustom.trim() || "..." : dialogSystem,
                  dialogTopic.trim(),
                ]
                  .filter(Boolean)
                  .join("/")
                  .toUpperCase()}
              </span>
            </p>

            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={dialogOptional}
                  onChange={(e) => setDialogOptional(e.target.checked)}
                  className="w-3.5 h-3.5"
                />
                Optional
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                Repeat for
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={dialogRepeatDays}
                  onChange={(e) => setDialogRepeatDays(Number(e.target.value) || 1)}
                  className="input text-xs py-1 px-1.5 w-12 text-center"
                />
                day{dialogRepeatDays === 1 ? "" : "s"}
              </label>
            </div>

            {dialogError && <p className="text-xs text-red-400">{dialogError}</p>}

            <div className="flex items-center gap-3">
              <button type="button" onClick={addAssignmentFromDialog} className="btn-primary text-sm">
                Add
              </button>
              <button type="button" onClick={() => setShowAddDialog(false)} className="btn-secondary text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showTemplateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4">
          <div className="card max-w-lg w-full space-y-3 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{manageMode ? "Manage templates" : "Use a template"}</p>
              <button
                type="button"
                onClick={() => setManageMode((v) => !v)}
                className="text-xs text-brand-400 font-semibold hover:text-brand-300"
              >
                {manageMode ? "Back to apply" : "Manage templates"}
              </button>
            </div>

            {templatesLoading && <p className="text-xs text-slate-500">Loading templates...</p>}

            {!templatesLoading && (
              <div>
                <label className="label">System</label>
                <select
                  className="input text-sm"
                  value={selectedSystemName}
                  onChange={(e) => selectTemplate(e.target.value)}
                >
                  <optgroup label="By system">
                    {SYSTEM_OPTIONS.map((s) => {
                      const t = findTemplateByName(s);
                      const itemCount = (t?.days ?? []).reduce((sum, d) => sum + d.items.length, 0);
                      return (
                        <option key={s} value={s}>
                          {s} ({itemCount} item{itemCount === 1 ? "" : "s"})
                        </option>
                      );
                    })}
                  </optgroup>
                  {customTemplates.length > 0 && (
                    <optgroup label="Custom">
                      {customTemplates.map((t) => {
                        const itemCount = t.days.reduce((sum, d) => sum + d.items.length, 0);
                        return (
                          <option key={t.id} value={t.name}>
                            {t.name} ({itemCount} item{itemCount === 1 ? "" : "s"})
                          </option>
                        );
                      })}
                    </optgroup>
                  )}
                </select>
              </div>
            )}

            {!templatesLoading && !manageMode && (
              <>
                {(!selectedTemplate || selectedTemplate.days.length === 0) && (
                  <p className="text-xs text-slate-500">
                    No days saved for this system yet. Switch to "Manage templates" to build one.
                  </p>
                )}

                {selectedTemplate && selectedTemplate.days.length > 0 && (
                  <div className="space-y-2.5 max-h-72 overflow-y-auto border border-slate-800 rounded-md p-2.5">
                    {selectedTemplate.days.map((d) => (
                      <div key={d.id} className="space-y-1">
                        <p className="text-xs font-semibold text-slate-400">
                          Day {d.dayNumber} - lands on {addDaysIso(date, d.dayNumber - 1)}
                        </p>
                        {d.notes && <p className="text-[11px] text-slate-400 italic whitespace-pre-wrap pl-1">{d.notes}</p>}
                        {d.items.length === 0 ? (
                          <p className="text-[11px] text-slate-600 pl-1">No items on this day.</p>
                        ) : (
                          <div className="space-y-0.5">
                            {d.items.map((item) => (
                              <label key={item.id} className="flex items-start gap-2 text-xs text-slate-300 pl-1">
                                <input
                                  type="checkbox"
                                  checked={!!templateItemChecks[item.id]}
                                  onChange={(e) =>
                                    setTemplateItemChecks((prev) => ({ ...prev, [item.id]: e.target.checked }))
                                  }
                                  className="w-3.5 h-3.5 shrink-0 mt-0.5"
                                />
                                <span className="flex-1">
                                  {item.title}
                                  {item.detail && <span className="block text-slate-500">{item.detail}</span>}
                                </span>
                                {item.isOptional && (
                                  <span className="text-[10px] font-semibold text-slate-500 shrink-0">Optional</span>
                                )}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {templatesError && <p className="text-xs text-red-400">{templatesError}</p>}

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={applyTemplateSequence}
                    disabled={!selectedTemplate || selectedTemplate.days.length === 0 || applyingTemplate}
                    className="btn-primary text-sm"
                  >
                    {applyingTemplate ? "Applying..." : "Apply starting this day"}
                  </button>
                  <button type="button" onClick={() => setShowTemplateDialog(false)} className="btn-secondary text-sm">
                    Cancel
                  </button>
                </div>
                {selectedTemplate && selectedTemplate.days.length > 0 && (
                  <p className="text-[11px] text-slate-500">
                    Checked items save immediately (Day 1 on {date}
                    {selectedTemplate.days.length > 1
                      ? `, Day ${selectedTemplate.days[selectedTemplate.days.length - 1].dayNumber} on ${addDaysIso(
                          date,
                          selectedTemplate.days[selectedTemplate.days.length - 1].dayNumber - 1
                        )}`
                      : ""}
                    ) - no extra Save click needed.
                  </p>
                )}
              </>
            )}

            {!templatesLoading && manageMode && (
              <div className="space-y-4">
                {manageError && <p className="text-xs text-red-400">{manageError}</p>}

                {(() => {
                  const t = findTemplateByName(selectedSystemName);
                  const days = t?.days ?? [];
                  const nextDayNumber = days.length > 0 ? Math.max(...days.map((d) => d.dayNumber)) + 1 : 1;
                  const slots: { id: string | null; dayNumber: number; notes: string | null; items: TemplateItem[] }[] = [
                    ...days,
                    { id: null, dayNumber: nextDayNumber, notes: null, items: [] },
                  ];
                  return (
                    <div className="space-y-3">
                      {slots.map((d) => {
                        const draftKey = `${selectedSystemName}::${d.dayNumber}`;
                        const draft = itemDraftByDay[draftKey] ?? { title: "", detail: "" };
                        const isNew = d.id === null;
                        return (
                          <div key={d.dayNumber} className="border border-slate-800 rounded-md p-2.5 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold">
                                Day {d.dayNumber}
                                {isNew ? " (new)" : ""}
                              </p>
                              {!isNew && (
                                <button
                                  type="button"
                                  onClick={() => deleteDay(d.id as string)}
                                  className="text-xs text-red-400 hover:text-red-300"
                                >
                                  Delete day
                                </button>
                              )}
                            </div>

                            <div>
                              <label className="text-[11px] text-slate-500">What should be done this day</label>
                              <textarea
                                key={`${d.id ?? "new"}-${d.notes ?? ""}`}
                                defaultValue={d.notes ?? ""}
                                onBlur={(e) => {
                                  if (e.target.value !== (d.notes ?? "")) {
                                    saveDayNotes(selectedSystemName, d.id, d.dayNumber, e.target.value);
                                  }
                                }}
                                rows={2}
                                placeholder="e.g. Review Pathoma 2.1-2.4, watch Sketchy Heart Failure, light review day"
                                className="input text-xs py-1.5 px-2 w-full resize-y"
                              />
                            </div>

                            {d.items.length > 0 && (
                              <div className="space-y-1.5">
                                {d.items.map((item) => (
                                  <div
                                    key={item.id}
                                    className="flex items-start gap-2 text-xs text-slate-300 border-t border-slate-800/70 pt-1.5"
                                  >
                                    <div className="flex-1">
                                      <p>{item.title}</p>
                                      {item.detail && <p className="text-slate-500">{item.detail}</p>}
                                    </div>
                                    <label className="flex items-center gap-1 text-slate-500 shrink-0">
                                      <input
                                        type="checkbox"
                                        checked={item.isOptional}
                                        onChange={(e) => toggleTemplateItemOptional(item.id, e.target.checked)}
                                        className="w-3.5 h-3.5"
                                      />
                                      Optional
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => deleteTemplateItem(item.id)}
                                      className="text-red-400 hover:text-red-300 shrink-0"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="space-y-1.5 pt-1">
                              <input
                                type="text"
                                className="input text-xs py-1 px-2 w-full"
                                placeholder="Item title (e.g. 40 Cardiology Questions)"
                                value={draft.title}
                                onChange={(e) =>
                                  setItemDraftByDay((prev) => ({ ...prev, [draftKey]: { ...draft, title: e.target.value } }))
                                }
                              />
                              <textarea
                                className="input text-xs py-1 px-2 w-full resize-y"
                                placeholder="Extra detail for this item (optional)"
                                rows={1}
                                value={draft.detail}
                                onChange={(e) =>
                                  setItemDraftByDay((prev) => ({ ...prev, [draftKey]: { ...draft, detail: e.target.value } }))
                                }
                              />
                              <button
                                type="button"
                                onClick={() => addItemToDay(selectedSystemName, d.id, d.dayNumber)}
                                disabled={manageSaving || !draft.title.trim()}
                                className="btn-secondary text-xs"
                              >
                                + Add item to Day {d.dayNumber}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {selectedTemplate && !SYSTEM_OPTIONS.some((s) => s.toLowerCase() === selectedSystemName.toLowerCase()) && (
                  <button
                    type="button"
                    onClick={() => deleteTemplate(selectedTemplate.id, selectedTemplate.name)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Delete this custom category entirely
                  </button>
                )}

                <div className="pt-2 border-t border-slate-800">
                  <label className="label">Add a custom category</label>
                  <p className="text-[11px] text-slate-500 mb-1.5">
                    For something outside the 18 systems above, e.g. "NBME Review Week".
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      className="input text-sm flex-1"
                      placeholder="Category name"
                      value={customCategoryName}
                      onChange={(e) => setCustomCategoryName(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={createCustomCategory}
                      disabled={manageSaving || !customCategoryName.trim()}
                      className="btn-secondary text-xs shrink-0"
                    >
                      Create
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button type="button" onClick={() => setManageMode(false)} className="btn-primary text-sm">
                    Done
                  </button>
                  <button type="button" onClick={() => setShowTemplateDialog(false)} className="btn-secondary text-sm">
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
