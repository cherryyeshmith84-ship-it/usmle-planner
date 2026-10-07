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

// Pure, in-memory editing state for whichever system is currently selected
// - nothing here is written to the database until the mentor clicks Save
// (see saveTemplate below). No `id` fields at all: a line is just its text,
// a day is just its number and lines, matched up against the database only
// at save time.
interface DraftDay {
  dayNumber: number;
  lines: string[];
}

function toDraftDays(t: Template | null | undefined): DraftDay[] {
  if (!t || t.days.length === 0) return [];
  return [...t.days]
    .sort((a, b) => a.dayNumber - b.dayNumber)
    .map((d) => ({
      dayNumber: d.dayNumber,
      lines: [...d.items].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.title),
    }));
}

/**
 * Standalone "Planner Templates" page body (app/mentorship/templates/page.tsx)
 * - the mentor-wide home for building a reusable, day-by-day assignment plan
 * per system (e.g. a 9-day Cardiovascular sequence: Day 1 some videos and
 * question IDs, Day 2 more of the same, ...), which can then be dropped
 * onto any student's calendar as a real multi-day plan from the "+ Use
 * Template" button on their Study Planner day (MentorAssignmentsEditor.tsx).
 *
 * Editing here is all LOCAL/in-memory (the `draftDays` state) until the
 * mentor explicitly clicks "Save [SYSTEM] template" - typing across
 * several days in a row, adding extra lines, deleting a day, none of that
 * touches the database by itself. This replaced an earlier version that
 * auto-saved every box the instant it lost focus: that worked, but gave a
 * mentor typing through 9 days in a row no clear, deliberate "I'm done,
 * save this" moment, and - per explicit ask - needed a real Save control
 * instead. Saving itself wipes and reinserts this system's days/items in
 * one shot (mentor_planner_template_days/_items carry no completion state
 * the way mentor_plan_tasks does, so there's nothing to lose by replacing
 * everything at once instead of diffing row by row).
 *
 * One blank line per day by default, with a "+ Add another line" control
 * to add more (e.g. one line for videos, a second for question IDs) - see
 * updateLine/addLine below. A day is only actually kept once it has at
 * least one non-blank line; an always-present trailing "Day N (new)" box
 * past the last real day is how a mentor keeps extending the sequence
 * (type into it and it's promoted into a real draft day automatically -
 * see updateLine's "day doesn't exist yet" branch).
 *
 * Switching the System dropdown, or leaving the page, with unsaved changes
 * prompts a plain confirm() rather than silently discarding them.
 */
export default function MentorTemplatesManager({ mentorId }: { mentorId: string }) {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSystemName, setSelectedSystemName] = useState<string>(SYSTEM_OPTIONS[0]);
  const [draftDays, setDraftDays] = useState<DraftDay[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [customCategoryName, setCustomCategoryName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorId]);

  // Warn on an actual tab close/navigation-away, not just Next.js client
  // routing (which doesn't fire beforeunload) - same limitation as the
  // other "unsaved changes" warning elsewhere in the app
  // (UWorldBlockTracker.tsx).
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

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
    setDraftDays(toDraftDays(grouped.find((t) => t.name.toLowerCase() === selectedSystemName.toLowerCase())));
    setDirty(false);
  }

  function handleSystemChange(name: string) {
    if (dirty && !window.confirm(`You have unsaved changes for ${selectedSystemName} - discard them?`)) {
      return;
    }
    setSelectedSystemName(name);
    setError(null);
    setSaveStatus("idle");
    setDraftDays(toDraftDays(findTemplateByName(name)));
    setDirty(false);
  }

  function updateLine(dayNumber: number, lineIndex: number, text: string) {
    setDirty(true);
    setSaveStatus("idle");
    setDraftDays((prev) => {
      if (!prev.some((d) => d.dayNumber === dayNumber)) {
        // The always-present trailing "Day N (new)" box - first keystroke
        // promotes it into a real draft day.
        return [...prev, { dayNumber, lines: [text] }].sort((a, b) => a.dayNumber - b.dayNumber);
      }
      return prev.map((d) =>
        d.dayNumber === dayNumber ? { ...d, lines: d.lines.map((l, i) => (i === lineIndex ? text : l)) } : d
      );
    });
  }

  function addLine(dayNumber: number) {
    setDirty(true);
    setSaveStatus("idle");
    setDraftDays((prev) => prev.map((d) => (d.dayNumber === dayNumber ? { ...d, lines: [...d.lines, ""] } : d)));
  }

  function removeLine(dayNumber: number, lineIndex: number) {
    setDirty(true);
    setSaveStatus("idle");
    setDraftDays((prev) =>
      prev
        .map((d) => (d.dayNumber === dayNumber ? { ...d, lines: d.lines.filter((_, i) => i !== lineIndex) } : d))
        .filter((d) => d.lines.length > 0)
    );
  }

  function removeDay(dayNumber: number) {
    setDirty(true);
    setSaveStatus("idle");
    setDraftDays((prev) => prev.filter((d) => d.dayNumber !== dayNumber));
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

  // Wipes this system's existing days (cascades items) and reinserts
  // whatever's currently in `draftDays`, in one shot - see the component
  // doc comment for why a full replace is safe here.
  async function saveTemplate() {
    setSaveStatus("saving");
    setError(null);
    const supabase = createClient();
    try {
      const templateId = await ensureTemplateId(selectedSystemName);

      const { error: deleteError } = await supabase
        .from("mentor_planner_template_days")
        .delete()
        .eq("template_id", templateId);
      if (deleteError) throw new Error(deleteError.message);

      const cleanedDays = draftDays
        .map((d) => ({ dayNumber: d.dayNumber, lines: d.lines.map((l) => l.trim()).filter(Boolean) }))
        .filter((d) => d.lines.length > 0)
        .sort((a, b) => a.dayNumber - b.dayNumber);

      if (cleanedDays.length === 0) {
        setTemplates((prev) => (prev ?? []).map((t) => (t.id === templateId ? { ...t, days: [] } : t)));
        setDraftDays([]);
        setDirty(false);
        setSaveStatus("saved");
        return;
      }

      const { data: insertedDays, error: dayInsertError } = await supabase
        .from("mentor_planner_template_days")
        .insert(cleanedDays.map((d) => ({ template_id: templateId, day_number: d.dayNumber })))
        .select("id, day_number");
      if (dayInsertError) throw new Error(dayInsertError.message);

      const itemsToInsert: { template_day_id: string; title: string; sort_order: number }[] = [];
      for (const d of cleanedDays) {
        const dayRow = (insertedDays ?? []).find((r) => r.day_number === d.dayNumber);
        if (!dayRow) continue;
        d.lines.forEach((line, i) => {
          itemsToInsert.push({ template_day_id: dayRow.id, title: line, sort_order: i });
        });
      }

      let insertedItems: { id: string; template_day_id: string; title: string; is_optional: boolean; sort_order: number }[] = [];
      if (itemsToInsert.length > 0) {
        const { data, error: itemInsertError } = await supabase
          .from("mentor_planner_template_items")
          .insert(itemsToInsert)
          .select("id, template_day_id, title, is_optional, sort_order");
        if (itemInsertError) throw new Error(itemInsertError.message);
        insertedItems = data ?? [];
      }

      const freshDays: TemplateDay[] = (insertedDays ?? [])
        .map((r) => ({
          id: r.id as string,
          dayNumber: r.day_number as number,
          items: insertedItems
            .filter((i) => i.template_day_id === r.id)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((i) => ({ id: i.id, title: i.title, isOptional: i.is_optional, sortOrder: i.sort_order })),
        }))
        .sort((a, b) => a.dayNumber - b.dayNumber);

      setTemplates((prev) => (prev ?? []).map((t) => (t.id === templateId ? { ...t, days: freshDays } : t)));
      setDraftDays(toDraftDays({ id: templateId, name: selectedSystemName, days: freshDays }));
      setDirty(false);
      setSaveStatus("saved");
    } catch (err) {
      setSaveStatus("idle");
      setError(err instanceof Error ? err.message : "Failed to save.");
    }
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
    if (selectedSystemName.toLowerCase() === name.toLowerCase()) {
      setSelectedSystemName(SYSTEM_OPTIONS[0]);
      setDraftDays(toDraftDays(null));
      setDirty(false);
    }
  }

  async function createCustomCategory() {
    const name = customCategoryName.trim();
    if (!name) return;
    if (dirty && !window.confirm(`You have unsaved changes for ${selectedSystemName} - discard them?`)) return;
    setSaving(true);
    setError(null);
    try {
      await ensureTemplateId(name);
      setCustomCategoryName("");
      setSelectedSystemName(name);
      setDraftDays([]);
      setDirty(false);
      setSaveStatus("idle");
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
  const nextDayNumber = draftDays.length > 0 ? Math.max(...draftDays.map((d) => d.dayNumber)) + 1 : 1;
  const displayDays: DraftDay[] = [...draftDays, { dayNumber: nextDayNumber, lines: [""] }];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold mb-1">Planner Templates</h1>
        <p className="text-sm text-slate-400">
          Build a reusable, day-by-day assignment plan once per system (e.g. 9 days of Cardiovascular - Day
          1 some videos and question IDs, Day 2 more, and so on), then drop the whole sequence onto any
          student's calendar as a real multi-day plan from the "+ Use Template" button on their Study
          Planner day.
        </p>
      </div>

      <div className="card space-y-3">
        <div>
          <label className="label">System</label>
          <select
            className="input text-sm"
            value={selectedSystemName}
            onChange={(e) => handleSystemChange(e.target.value)}
          >
            <optgroup label="By system">
              {SYSTEM_OPTIONS.map((s) => {
                const st = findTemplateByName(s);
                const dayCount = st?.days.length ?? 0;
                return (
                  <option key={s} value={s}>
                    {s} ({dayCount} day{dayCount === 1 ? "" : "s"})
                  </option>
                );
              })}
            </optgroup>
            {customTemplates.length > 0 && (
              <optgroup label="Custom">
                {customTemplates.map((ct) => (
                  <option key={ct.id} value={ct.name}>
                    {ct.name} ({ct.days.length} day{ct.days.length === 1 ? "" : "s"})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <div className="flex items-center gap-3 pt-1 border-t border-slate-800">
          <button type="button" onClick={saveTemplate} disabled={saveStatus === "saving" || !dirty} className="btn-primary text-sm">
            {saveStatus === "saving" ? "Saving..." : `Save ${selectedSystemName} template`}
          </button>
          {dirty && saveStatus !== "saving" && <span className="text-xs text-amber-500">Unsaved changes</span>}
          {!dirty && saveStatus === "saved" && <span className="text-xs text-green-500">Saved</span>}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="space-y-3">
        {displayDays.map((d) => {
          const isNew = !draftDays.some((rd) => rd.dayNumber === d.dayNumber);
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
                    onClick={() => removeDay(d.dayNumber)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Delete day
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                {d.lines.map((line, i) => (
                  <div key={`${d.dayNumber}-${i}`} className="flex items-start gap-2">
                    <textarea
                      value={line}
                      onChange={(e) => updateLine(d.dayNumber, i, e.target.value)}
                      rows={2}
                      placeholder={
                        i === 0
                          ? "What should be done this day - e.g. 40 Cardiology Questions, review Pathoma 2.1-2.4"
                          : "Another assignment for this day"
                      }
                      className="input text-sm py-1.5 px-2 flex-1 resize-y"
                    />
                    {d.lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(d.dayNumber, i)}
                        className="text-xs text-red-400 hover:text-red-300 shrink-0 pt-2"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {!isNew && (
                <button
                  type="button"
                  onClick={() => addLine(d.dayNumber)}
                  className="text-xs text-brand-400 font-semibold hover:text-brand-300"
                >
                  + Add another line
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={saveTemplate} disabled={saveStatus === "saving" || !dirty} className="btn-primary text-sm">
          {saveStatus === "saving" ? "Saving..." : `Save ${selectedSystemName} template`}
        </button>
        {dirty && saveStatus !== "saving" && <span className="text-xs text-amber-500">Unsaved changes</span>}
        {!dirty && saveStatus === "saved" && <span className="text-xs text-green-500">Saved</span>}
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
