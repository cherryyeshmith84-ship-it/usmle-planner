"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Every organ system/subject a mentor would organize a Step 1 assignment
// under - identical list to the one in UWorldBlockTracker.tsx / Mentor
// AssignmentsEditor.tsx's "Add From Resource List" System dropdown, kept
// in sync by hand across the three (no shared constants file exists yet
// for it) since all three need to agree on exactly the same 18 names for
// a template built here to line up with what a mentor sees when applying
// it from a student's day.
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

interface TemplateItem {
  id: string;
  title: string;
  isOptional: boolean;
  sortOrder: number;
}
interface TemplateDay {
  id: string;
  dayNumber: number;
  items: TemplateItem[];
}
interface Template {
  id: string;
  name: string;
  days: TemplateDay[];
}

/**
 * Standalone "Planner Templates" page body (app/mentorship/templates/page.tsx)
 * - the mentor-wide home for building reusable, day-by-day assignment plans
 * per system (mentor_planner_templates -> mentor_planner_template_days ->
 * mentor_planner_template_items, all RLS-scoped to this mentor by
 * mentors.email = auth.jwt() email).
 *
 * Used to live inline inside MentorAssignmentsEditor.tsx's "+ Use Template"
 * popup as a "Manage templates" mode, but templates were never actually
 * tied to any one student (mentor_id only) - managing them from inside one
 * specific student's day view was just a convenience, and made for a
 * cramped place to build out an 18-system, multi-day curriculum. Moved
 * here instead: MentorAssignmentsEditor's popup is apply-only now (pick a
 * system, check items, apply starting the day you're viewing), with a
 * "Manage templates" link that comes straight to this page.
 *
 * ONE plain text box per day by default - not a separate "day notes" field
 * plus a structured "item title + detail" sub-form (what this page used to
 * have). That split meant a mentor had to fill in two different things,
 * and whatever they put in the notes box never actually became a real
 * assignment when the template was applied (only items did) - writing
 * "what should be done" there and nothing else silently produced an empty
 * apply. Now there's no day-level notes field at all: a brand-new day
 * shows exactly one blank box, and whatever's typed into it IS the day's
 * (first) assignment the moment it's saved - no separate "Add" click
 * required just to make that first line count. "+ Add another line" only
 * shows up once a day already has at least one saved line, for the rare
 * case a day needs more than one separately-checkable assignment (e.g.
 * "40 UWorld questions" AND "Review Pathoma 2.1" as two distinct items a
 * student can tick off independently) - clicking it reveals exactly one
 * more blank box, which collapses back into the saved list the moment it's
 * typed into and saved, ready to click again if a third is ever needed.
 *
 * Same "always show all 18 systems, create nothing in the database until
 * the first day/line is actually saved" approach as before, plus a custom
 * category section for anything outside the 18 (e.g. "NBME Review Week").
 */
export default function MentorTemplatesManager({ mentorId }: { mentorId: string }) {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSystemName, setSelectedSystemName] = useState<string>(SYSTEM_OPTIONS[0]);
  const [customCategoryName, setCustomCategoryName] = useState("");
  // The single in-progress blank box's text, keyed by "<system>::<dayNumber>"
  // - used both for a brand-new day's first (only) box, and for the one
  // extra box "+ Add another line" reveals on a day that already has items.
  const [draftByDay, setDraftByDay] = useState<Record<string, string>>({});
  // Whether the "+ Add another line" box is currently open for a day that
  // already has at least one saved line - keyed the same way as draftByDay.
  // Not needed for a brand-new day (its one box is always open).
  const [addingLineFor, setAddingLineFor] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorId]);

  function findTemplateByName(name: string): Template | null {
    return (templates ?? []).find((t) => t.name.toLowerCase() === name.toLowerCase()) ?? null;
  }

  const customTemplates = (templates ?? [])
    .filter((t) => !SYSTEM_OPTIONS.some((s) => s.toLowerCase() === t.name.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  async function loadTemplates() {
    setLoading(true);
    setLoadError(null);
    const supabase = createClient();

    const { data: templateRows, error: templateError } = await supabase
      .from("mentor_planner_templates")
      .select("id, name")
      .eq("mentor_id", mentorId)
      .order("name", { ascending: true });
    if (templateError) {
      setLoading(false);
      setLoadError(templateError.message);
      return;
    }

    const templateIds = (templateRows ?? []).map((t) => t.id as string);
    let dayRows: { id: string; template_id: string; day_number: number }[] = [];
    if (templateIds.length > 0) {
      const { data, error: dayError } = await supabase
        .from("mentor_planner_template_days")
        .select("id, template_id, day_number")
        .in("template_id", templateIds)
        .order("day_number", { ascending: true });
      if (dayError) {
        setLoading(false);
        setLoadError(dayError.message);
        return;
      }
      dayRows = data ?? [];
    }

    const dayIds = dayRows.map((d) => d.id);
    let itemRows: { id: string; template_day_id: string; title: string; is_optional: boolean; sort_order: number }[] = [];
    if (dayIds.length > 0) {
      const { data, error: itemError } = await supabase
        .from("mentor_planner_template_items")
        .select("id, template_day_id, title, is_optional, sort_order")
        .in("template_day_id", dayIds)
        .order("sort_order", { ascending: true });
      if (itemError) {
        setLoading(false);
        setLoadError(itemError.message);
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
          items: itemRows
            .filter((i) => i.template_day_id === d.id)
            .map((i) => ({ id: i.id, title: i.title, isOptional: i.is_optional, sortOrder: i.sort_order })),
        })),
    }));

    setTemplates(grouped);
    setLoading(false);
  }

  async function ensureTemplateId(name: string): Promise<string> {
    const existing = findTemplateByName(name);
    if (existing) return existing.id;
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("mentor_planner_templates")
      .insert({ mentor_id: mentorId, name })
      .select("id, name")
      .single();
    if (insertError) throw new Error(insertError.message);
    setTemplates((prev) => [...(prev ?? []), { id: data.id, name: data.name, days: [] }]);
    return data.id as string;
  }

  async function ensureDay(name: string, dayId: string | null, dayNumber: number): Promise<string> {
    if (dayId) return dayId;
    const templateId = await ensureTemplateId(name);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("mentor_planner_template_days")
      .insert({ template_id: templateId, day_number: dayNumber })
      .select("id, template_id, day_number")
      .single();
    if (insertError) throw new Error(insertError.message);
    setTemplates((prev) =>
      (prev ?? []).map((tpl) =>
        tpl.id === templateId
          ? { ...tpl, days: [...tpl.days, { id: data.id, dayNumber: data.day_number, items: [] }] }
          : tpl
      )
    );
    return data.id as string;
  }

  // Saves whatever's in a day's blank box as a new line the moment it has
  // real text and loses focus - no separate "Add" button click needed for
  // this to count (see the component doc comment for why).
  async function saveLine(name: string, dayId: string | null, dayNumber: number) {
    const draftKey = `${name}::${dayNumber}`;
    const title = (draftByDay[draftKey] ?? "").trim();
    if (!title) return;
    setSaving(true);
    setError(null);
    try {
      const realDayId = await ensureDay(name, dayId, dayNumber);
      const existingDay = (templates ?? []).flatMap((t) => t.days).find((d) => d.id === realDayId);
      const sortOrder = existingDay ? existingDay.items.length : 0;
      const supabase = createClient();
      const { data, error: insertError } = await supabase
        .from("mentor_planner_template_items")
        .insert({ template_day_id: realDayId, title, sort_order: sortOrder })
        .select("id, title, is_optional, sort_order")
        .single();
      if (insertError) throw new Error(insertError.message);
      setTemplates((prev) =>
        (prev ?? []).map((tpl) => ({
          ...tpl,
          days: tpl.days.map((d) =>
            d.id === realDayId
              ? { ...d, items: [...d.items, { id: data.id, title: data.title, isOptional: data.is_optional, sortOrder: data.sort_order }] }
              : d
          ),
        }))
      );
      setDraftByDay((prev) => ({ ...prev, [draftKey]: "" }));
      setAddingLineFor((prev) => ({ ...prev, [draftKey]: false }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function updateItemTitle(itemId: string, title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.from("mentor_planner_template_items").update({ title: trimmed }).eq("id", itemId);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setTemplates((prev) =>
      (prev ?? []).map((tpl) => ({
        ...tpl,
        days: tpl.days.map((d) => ({ ...d, items: d.items.map((i) => (i.id === itemId ? { ...i, title: trimmed } : i)) })),
      }))
    );
  }

  async function deleteTemplateItem(itemId: string) {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("mentor_planner_template_items").delete().eq("id", itemId);
    setSaving(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setTemplates((prev) =>
      (prev ?? []).map((tpl) => ({ ...tpl, days: tpl.days.map((d) => ({ ...d, items: d.items.filter((i) => i.id !== itemId) })) }))
    );
  }

  async function toggleTemplateItemOptional(itemId: string, value: boolean) {
    const supabase = createClient();
    const { error: updateError } = await supabase.from("mentor_planner_template_items").update({ is_optional: value }).eq("id", itemId);
    if (updateError) {
      setError(updateError.message);
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
    if (!window.confirm("Delete this day and everything in it? This can't be undone.")) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("mentor_planner_template_days").delete().eq("id", dayId);
    setSaving(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setTemplates((prev) => (prev ?? []).map((tpl) => ({ ...tpl, days: tpl.days.filter((d) => d.id !== dayId) })));
  }

  async function deleteTemplate(templateId: string, name: string) {
    if (!window.confirm(`Delete the entire "${name}" template (every day in it)? This can't be undone.`)) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("mentor_planner_templates").delete().eq("id", templateId);
    setSaving(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setTemplates((prev) => (prev ?? []).filter((t) => t.id !== templateId));
    if (selectedSystemName.toLowerCase() === name.toLowerCase()) setSelectedSystemName(SYSTEM_OPTIONS[0]);
  }

  async function createCustomCategory() {
    const name = customCategoryName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      await ensureTemplateId(name);
      setCustomCategoryName("");
      setSelectedSystemName(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create category.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading your templates...</p>;
  }

  if (loadError) {
    return <p className="text-sm text-red-400">{loadError}</p>;
  }

  const t = findTemplateByName(selectedSystemName);
  const days = t?.days ?? [];
  const nextDayNumber = days.length > 0 ? Math.max(...days.map((d) => d.dayNumber)) + 1 : 1;
  const slots: { id: string | null; dayNumber: number; items: TemplateItem[] }[] = [
    ...days,
    { id: null, dayNumber: nextDayNumber, items: [] },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold mb-1">Planner Templates</h1>
        <p className="text-sm text-slate-400">
          Build a reusable, day-by-day assignment plan once per system, then drop the whole sequence onto
          any student's calendar from the "+ Use Template" button on their Study Planner day.
        </p>
      </div>

      <div className="card">
        <label className="label">System</label>
        <select
          className="input text-sm"
          value={selectedSystemName}
          onChange={(e) => setSelectedSystemName(e.target.value)}
        >
          <optgroup label="By system">
            {SYSTEM_OPTIONS.map((s) => {
              const st = findTemplateByName(s);
              const itemCount = (st?.days ?? []).reduce((sum, d) => sum + d.items.length, 0);
              return (
                <option key={s} value={s}>
                  {s} ({itemCount} item{itemCount === 1 ? "" : "s"})
                </option>
              );
            })}
          </optgroup>
          {customTemplates.length > 0 && (
            <optgroup label="Custom">
              {customTemplates.map((ct) => {
                const itemCount = ct.days.reduce((sum, d) => sum + d.items.length, 0);
                return (
                  <option key={ct.id} value={ct.name}>
                    {ct.name} ({itemCount} item{itemCount === 1 ? "" : "s"})
                  </option>
                );
              })}
            </optgroup>
          )}
        </select>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="space-y-3">
        {slots.map((d) => {
          const draftKey = `${selectedSystemName}::${d.dayNumber}`;
          const isNew = d.id === null;
          const showAddBox = d.items.length === 0 || addingLineFor[draftKey];
          return (
            <div key={d.dayNumber} className="card space-y-2">
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

              {d.items.length > 0 && (
                <div className="space-y-1.5">
                  {d.items.map((item) => (
                    <div key={item.id} className="flex items-start gap-2">
                      <textarea
                        key={`${item.id}-${item.title}`}
                        defaultValue={item.title}
                        onBlur={(e) => {
                          if (e.target.value.trim() && e.target.value !== item.title) {
                            updateItemTitle(item.id, e.target.value);
                          }
                        }}
                        rows={2}
                        className="input text-sm py-1.5 px-2 flex-1 resize-y"
                      />
                      <label className="flex items-center gap-1 text-xs text-slate-500 shrink-0 pt-2">
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
                        className="text-xs text-red-400 hover:text-red-300 shrink-0 pt-2"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {showAddBox && (
                <textarea
                  key={`draft-${draftKey}`}
                  value={draftByDay[draftKey] ?? ""}
                  onChange={(e) => setDraftByDay((prev) => ({ ...prev, [draftKey]: e.target.value }))}
                  onBlur={() => saveLine(selectedSystemName, d.id, d.dayNumber)}
                  rows={2}
                  placeholder={
                    d.items.length === 0
                      ? "What should be done this day - e.g. 40 Cardiology Questions, review Pathoma 2.1-2.4"
                      : "Another assignment for this day"
                  }
                  className="input text-sm py-1.5 px-2 w-full resize-y"
                />
              )}

              {d.items.length > 0 && !addingLineFor[draftKey] && (
                <button
                  type="button"
                  onClick={() => setAddingLineFor((prev) => ({ ...prev, [draftKey]: true }))}
                  className="text-xs text-brand-400 font-semibold hover:text-brand-300"
                >
                  + Add another line
                </button>
              )}
            </div>
          );
        })}
      </div>

      {t && !SYSTEM_OPTIONS.some((s) => s.toLowerCase() === selectedSystemName.toLowerCase()) && (
        <button
          type="button"
          onClick={() => deleteTemplate(t.id, t.name)}
          className="text-xs text-red-400 hover:text-red-300"
        >
          Delete this custom category entirely
        </button>
      )}

      <div className="card">
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
            disabled={saving || !customCategoryName.trim()}
            className="btn-secondary text-xs shrink-0"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
