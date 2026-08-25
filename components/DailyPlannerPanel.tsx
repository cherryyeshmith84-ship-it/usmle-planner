"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PlannerColumn, PlannerEntry, StudyResource } from "@/lib/plannerColumns";
import type { UWorldBlock } from "@/lib/uworldBlocks";
import type { MentorDailyNote, DayStatus } from "@/lib/mentorDailyNotes";
import { DAY_STATUS_LABEL } from "@/lib/mentorDailyNotes";
import type { PlanTask } from "@/lib/planTasks";
import UWorldBlockTracker from "./UWorldBlockTracker";
import AssignmentsChecklist from "./AssignmentsChecklist";
import MentorAssignmentsEditor from "./MentorAssignmentsEditor";
import MoodPicker from "./MoodPicker";
import StudyIssueSelector from "./StudyIssueSelector";
import ResourcesUsedChecklist from "./ResourcesUsedChecklist";
import DailyReflection from "./DailyReflection";
import MentorDailyNoteCell from "./MentorDailyNoteCell";

type CellValue = string | boolean;
type RowValues = Record<string, CellValue>;

const MENTOR_STATUS_BADGE: Record<DayStatus, string> = {
  completed: "bg-green-900/40 text-green-400",
  needs_improvement: "bg-yellow-900/40 text-yellow-400",
  missed: "bg-red-900/40 text-red-400",
  rescheduled: "bg-slate-700 text-slate-300",
};

/** Same coercion rules the old flat grid used (checkbox -> boolean, number ->
 *  Number, blank text dropped) - kept identical so a save from here never
 *  writes a differently-shaped value than the grid used to. */
function toFieldValues(row: RowValues, columns: PlannerColumn[]): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const col of columns) {
    const v = row[col.key];
    if (v === undefined) continue;
    if (col.field_type === "checkbox") {
      out[col.key] = !!v;
    } else if (col.field_type === "number") {
      if (v === "") continue;
      const n = Number(v);
      if (!Number.isNaN(n)) out[col.key] = n;
    } else if (v !== "") {
      out[col.key] = v as string;
    }
  }
  return out;
}

/**
 * The single per-day workspace, opened by clicking a day on the Study
 * Planner v2 calendar (PlannerCalendar.tsx). Replaces the old flat grid's
 * per-row "expand" panel (PlannerGridClient.tsx) as the one place to see
 * and manage a day - per the ask: "if they open the 10th they should see
 * what they have to do and checklist, after that if they complete those
 * they can mark." The old flat table (Planned System / First Aid Pages /
 * Questions Planned / etc. as freeform columns) is retired; any data a
 * mentor had already put there was migrated into Assignments tasks (see the
 * one-time migration marked `detail = 'migrated-from-grid'` on those rows).
 *
 * Everything else the old grid's expanded panel could do - UWorld blocks,
 * Mood, Study Issues, Resources Used, Tomorrow's Goal, Daily Reflection,
 * Student Notes, Mentor Notes - still lives here, just reached through the
 * calendar instead of a table row's ▸ arrow. Journal-style fields
 * (notes/mood/reflection/etc.) still live in planner_entries.field_values -
 * only the "Planned System"-style freeform plan columns were retired in
 * favor of Assignments tasks.
 */
export default function DailyPlannerPanel({
  targetUserId,
  date,
  columns,
  initialEntry,
  dayTasks,
  dayBlocks,
  mentorNote,
  studyResources,
  canEdit,
  locked,
  mentorId,
  todayIso,
}: {
  targetUserId: string;
  date: string;
  // All of this student's ACTIVE planner_columns (unfiltered) - only used
  // here to check which journal sections (Mood, Notes, Reflection, ...) a
  // mentor has turned on for this student via Planner Layout.
  columns: PlannerColumn[];
  initialEntry: PlannerEntry | undefined;
  dayTasks: PlanTask[];
  dayBlocks: UWorldBlock[];
  mentorNote: MentorDailyNote | undefined;
  studyResources: StudyResource[];
  canEdit: boolean;
  // True once this day has fallen outside the student's own edit window -
  // never true for a mentor/admin editing on a student's behalf.
  locked: boolean;
  // Present => viewing as this student's mentor: Assignments becomes a full
  // add/edit/remove editor instead of a read-only checkbox list, and Mentor
  // Notes becomes writable.
  mentorId: string | null;
  // Today's date (Eastern Time) - passed through to MentorAssignmentsEditor
  // so it can block adding NEW assignments to an already-passed day (a
  // mentor can still edit/remove what's already there).
  todayIso: string;
}) {
  const notesColumn = columns.find((c) => c.key === "student_notes") ?? null;
  const moodColumn = columns.find((c) => c.key === "mood") ?? null;
  const issueColumn = columns.find((c) => c.key === "study_issue") ?? null;
  const resourcesColumn = columns.find((c) => c.key === "resources_used") ?? null;
  const tomorrowGoalColumn = columns.find((c) => c.key === "tomorrow_goal") ?? null;
  const reflectionColumn = columns.find((c) => c.key === "reflection_went_well") ?? null;

  const [rowValues, setRowValues] = useState<RowValues>(() => {
    const row: RowValues = {};
    for (const [k, v] of Object.entries(initialEntry?.field_values ?? {})) {
      row[k] = typeof v === "boolean" ? v : v === null || v === undefined ? "" : String(v);
    }
    return row;
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  function setValue(key: string, value: CellValue) {
    setSaveMessage(null);
    setRowValues((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  /** Mood / Study Issue / Resources Used save immediately on click - same as
   *  the old grid, so a choice never silently vanishes if the student
   *  forgets to hit the journal's Save button below. */
  async function setValueAndSave(key: string, value: CellValue) {
    setSaveMessage(null);
    const nextRow = { ...rowValues, [key]: value };
    setRowValues(nextRow);
    if (!canEdit || locked) return;
    const supabase = createClient();
    await supabase.from("planner_entries").upsert(
      { user_id: targetUserId, log_date: date, field_values: toFieldValues(nextRow, columns) },
      { onConflict: "user_id,log_date" }
    );
  }

  async function saveJournal() {
    setSaving(true);
    setSaveError(null);
    const supabase = createClient();
    const { error } = await supabase.from("planner_entries").upsert(
      { user_id: targetUserId, log_date: date, field_values: toFieldValues(rowValues, columns) },
      { onConflict: "user_id,log_date" }
    );
    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    setDirty(false);
    setSaveMessage("Saved.");
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Assignments</p>
        {mentorId ? (
          <MentorAssignmentsEditor
            studentId={targetUserId}
            mentorId={mentorId}
            date={date}
            initialTasks={dayTasks}
            todayIso={todayIso}
          />
        ) : (
          <AssignmentsChecklist tasks={dayTasks} editable={canEdit && !locked} />
        )}
      </div>

      {moodColumn && (
        <div className="pt-3 border-t border-slate-800">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Daily Mood</p>
          <MoodPicker
            value={(rowValues["mood"] as string) ?? ""}
            disabled={!canEdit || !!mentorId || locked}
            onChange={(mood) => setValueAndSave("mood", mood)}
          />
        </div>
      )}

      {issueColumn && (
        <div className="pt-3 border-t border-slate-800">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Today&apos;s Biggest Issue</p>
          <StudyIssueSelector
            value={(rowValues["study_issue"] as string) ?? ""}
            disabled={!canEdit || !!mentorId || locked}
            onChange={(issue) => setValueAndSave("study_issue", issue)}
          />
        </div>
      )}

      {resourcesColumn && (
        <div className="pt-3 border-t border-slate-800">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Resources Used</p>
          <ResourcesUsedChecklist
            resources={studyResources}
            value={(rowValues["resources_used"] as string) ?? ""}
            disabled={!canEdit || !!mentorId || locked}
            onChange={(csv) => setValueAndSave("resources_used", csv)}
          />
        </div>
      )}

      <div className="pt-3 border-t border-slate-800">
        <UWorldBlockTracker
          targetUserId={targetUserId}
          date={date}
          initialBlocks={dayBlocks}
          canEdit={canEdit && !locked}
        />
      </div>

      {notesColumn && (
        <div className="pt-3 border-t border-slate-800">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Student Notes</p>
          <textarea
            value={(rowValues["student_notes"] as string) ?? ""}
            // Always read-only when a mentor is viewing - the student's own
            // journal, kept one-directional on purpose, same as before.
            disabled={!canEdit || !!mentorId || locked}
            onChange={(e) => setValue("student_notes", e.target.value)}
            rows={4}
            placeholder="Today's goals, what you struggled with, what to review tomorrow..."
            className="input text-sm py-2 px-2.5 w-full resize-y text-slate-100"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            {mentorId
              ? "The student's own journal - you can read it but can't edit it."
              : "Your study journal - your mentor can read this but can't edit it."}
          </p>
        </div>
      )}

      {reflectionColumn && (
        <div className="pt-3 border-t border-slate-800">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Daily Reflection</p>
          <DailyReflection
            wentWell={(rowValues["reflection_went_well"] as string) ?? ""}
            slowedDown={(rowValues["reflection_slowed_down"] as string) ?? ""}
            improve={(rowValues["reflection_improve"] as string) ?? ""}
            disabled={!canEdit || locked}
            onChangeWentWell={(v) => setValue("reflection_went_well", v)}
            onChangeSlowedDown={(v) => setValue("reflection_slowed_down", v)}
            onChangeImprove={(v) => setValue("reflection_improve", v)}
          />
        </div>
      )}

      {tomorrowGoalColumn && (
        <div className="pt-3 border-t border-slate-800">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Tomorrow&apos;s Goal</p>
          <textarea
            value={(rowValues["tomorrow_goal"] as string) ?? ""}
            disabled={!canEdit || locked}
            onChange={(e) => setValue("tomorrow_goal", e.target.value)}
            rows={2}
            placeholder="What's the plan for tomorrow?"
            className="input text-sm py-2 px-2.5 w-full resize-y text-slate-100"
          />
        </div>
      )}

      {(mentorId ||
        mentorNote?.content ||
        mentorNote?.status ||
        mentorNote?.reviewed ||
        mentorNote?.next_checkin_date ||
        mentorNote?.is_highlighted) && (
        <div className="pt-3 border-t border-slate-800">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Mentor Notes</p>
          {mentorId ? (
            <MentorDailyNoteCell
              studentId={targetUserId}
              mentorId={mentorId}
              date={date}
              initialContent={mentorNote?.content ?? ""}
              initialStatus={mentorNote?.status ?? null}
              initialReviewed={mentorNote?.reviewed ?? false}
              initialReviewedAt={mentorNote?.reviewed_at ?? null}
              initialNextCheckinDate={mentorNote?.next_checkin_date ?? null}
              initialHighlighted={mentorNote?.is_highlighted ?? false}
              initialHighlightLabel={mentorNote?.highlight_label ?? null}
            />
          ) : (
            <>
              <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                {mentorNote?.is_highlighted && (
                  <span className="inline-block text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-amber-900/40 text-amber-400">
                    ⭐ {mentorNote.highlight_label?.trim() || "Important day"}
                  </span>
                )}
                {mentorNote?.status && (
                  <span
                    className={`inline-block text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${MENTOR_STATUS_BADGE[mentorNote.status]}`}
                  >
                    {DAY_STATUS_LABEL[mentorNote.status]}
                  </span>
                )}
                {mentorNote?.reviewed && (
                  <span className="inline-block text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-brand-900/40 text-brand-400">
                    ✓ Reviewed
                    {mentorNote.reviewed_at ? ` ${new Date(mentorNote.reviewed_at).toLocaleDateString()}` : ""}
                  </span>
                )}
              </div>
              {mentorNote?.content && (
                <p className="text-sm text-slate-200 whitespace-pre-wrap">{mentorNote.content}</p>
              )}
              {mentorNote?.next_checkin_date && (
                <p className="text-[11px] text-slate-400 mt-1">Next check-in: {mentorNote.next_checkin_date}</p>
              )}
              <p className="text-[11px] text-slate-500 mt-1">From your mentor - you can read this but can't edit it.</p>
            </>
          )}
        </div>
      )}

      {canEdit && locked && (
        <p className="text-xs text-slate-500 pt-3 border-t border-slate-800">
          This day is locked - you can only update today's and yesterday's journal entries.
        </p>
      )}

      {canEdit && !locked && (notesColumn || reflectionColumn || tomorrowGoalColumn) && (
        <div className="flex items-center gap-3 pt-3 border-t border-slate-800">
          <button type="button" onClick={saveJournal} disabled={saving || !dirty} className="btn-primary text-xs">
            {saving ? "Saving..." : "Save journal"}
          </button>
          <p className="text-xs text-slate-500">Saves Student Notes, Reflection, and Tomorrow's Goal for this day.</p>
          {saveMessage && <p className="text-xs text-green-400">{saveMessage}</p>}
          {saveError && <p className="text-xs text-red-400">{saveError}</p>}
        </div>
      )}
    </div>
  );
}
