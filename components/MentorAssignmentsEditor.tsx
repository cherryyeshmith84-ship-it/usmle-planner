"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PlanTask } from "@/lib/planTasks";

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
}: {
  studentId: string;
  mentorId: string;
  date: string;
  initialTasks: PlanTask[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<DraftTask[]>(() => initialTasks.map(toDraft));
  const [nextNewId, setNextNewId] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  function updateDraft(key: string, patch: Partial<DraftTask>) {
    setSaveMessage(null);
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function addAssignment() {
    setSaveMessage(null);
    const key = `new-${nextNewId}`;
    setNextNewId((n) => n + 1);
    setDrafts((prev) => [...prev, { key, id: null, title: "", isOptional: false, completed: false, repeatDays: 1 }]);
  }

  function removeAssignment(key: string) {
    setSaveMessage(null);
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  }

  async function save() {
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
                placeholder="Assignment (e.g. 40 Cardiology Questions)"
                className="input text-xs py-1 px-2 flex-1 min-w-[160px]"
              />
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
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3 flex-wrap pt-1">
        <button type="button" onClick={addAssignment} className="btn-secondary text-xs">
          + Add Assignment
        </button>
        <button type="button" onClick={save} disabled={saving} className="btn-primary text-xs">
          {saving ? "Saving..." : "Save"}
        </button>
        {saveMessage && <p className="text-xs text-green-400">{saveMessage}</p>}
        {saveError && <p className="text-xs text-red-400">{saveError}</p>}
      </div>
      <p className="text-[11px] text-slate-500 pt-0.5">
        Tip: set "Repeat for" on an assignment (e.g. 10) to apply it to today plus the next 9 days in one
        save, instead of adding it separately on every day.
      </p>
    </div>
  );
}
