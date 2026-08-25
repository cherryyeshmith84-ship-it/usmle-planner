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
// under. Same "Other" fallback as resources above.
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

    setSaving(false);
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
          save, instead of adding it separately on every day.
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
    </div>
  );
}
