import type { PlannerColumn, PlannerEntry } from "./plannerColumns";
import { hasActiveColumn } from "./plannerColumns";
import type { UWorldBlock } from "./uworldBlocks";
import type { PlanTask } from "./planTasks";

export interface TodayStatus {
  questionsCompleted: number;
  questionsPlanned: number;
  hours: number;
  assignmentsCompleted: number;
  assignmentsTotal: number;
  studyCompleted: boolean;
  hasEntry: boolean;
}

/**
 * "Planner Status" header (Study Planner v1 item 13) - a single at-a-glance
 * strip for *today only*, sitting above the grid. Reuses the same
 * "blocks override q_solved when present" rule as DailySummary/WeeklyProgress
 * so the number shown here always matches what's in the expanded day panel -
 * no separate calculation path to drift out of sync. There's no stored
 * "hours target" anywhere in the app, so Hours is shown as a plain count
 * (not a pushed x/x ratio) rather than inventing a target that doesn't exist.
 */
export function computeTodayStatus(
  entries: PlannerEntry[],
  blocks: UWorldBlock[],
  planTasks: PlanTask[],
  todayIso: string,
  // This student's active journal columns (Mood, Today's Biggest Issue,
  // Resources Used, Student Notes, ...) - same list PlannerCalendar.tsx
  // passes as `columns`. Optional/defaults to [] so callers that don't pass
  // it still work, just with those checks skipped. See computeDayStatus in
  // lib/plannerCalendar.ts for the twin of this logic used on the calendar.
  journalColumns: PlannerColumn[] = []
): TodayStatus {
  const entry = entries.find((e) => e.log_date === todayIso) ?? null;
  const dayBlocks = blocks.filter((b) => b.log_date === todayIso);
  const dayTasks = planTasks.filter((t) => t.task_date === todayIso);
  const v = entry?.field_values ?? {};

  const questionsCompleted =
    dayBlocks.length > 0
      ? dayBlocks.reduce((sum, b) => sum + (b.questions ?? 0), 0)
      : Number(v["q_solved"] ?? 0) || 0;
  const assignmentsCompleted = dayTasks.filter((t) => t.completed).length;
  const assignmentsTotal = dayTasks.length;

  // Same rule as computeDayStatus: every Assignment checked off is
  // necessary but no longer sufficient on its own. Mood/Issue/Resources/
  // Notes (when that section is turned on for this student) must also be
  // filled in, and any Question Bank Block that was started must be fully
  // filled in - a half-filled block (added, no question count entered)
  // blocks "Completed" until it's finished. Daily Reflection is NOT
  // required.
  const moodOk = !hasActiveColumn(journalColumns, "mood") || !!v["mood"];
  const issueOk = !hasActiveColumn(journalColumns, "study_issue") || !!v["study_issue"];
  const resourcesOk =
    !hasActiveColumn(journalColumns, "resources_used") ||
    (typeof v["resources_used"] === "string" && v["resources_used"].trim() !== "");
  const notesOk =
    !hasActiveColumn(journalColumns, "student_notes") ||
    (typeof v["student_notes"] === "string" && v["student_notes"].trim() !== "");
  const blocksOk = dayBlocks.every((b) => b.questions !== null && b.questions !== undefined);

  return {
    questionsCompleted,
    questionsPlanned: Number(v["questions_planned"] ?? 0) || 0,
    hours: Number(v["hours"] ?? 0) || 0,
    assignmentsCompleted,
    assignmentsTotal,
    // A day with zero assigned tasks can never be "Completed", no matter
    // what else is filled in.
    studyCompleted:
      assignmentsTotal > 0 &&
      assignmentsCompleted === assignmentsTotal &&
      moodOk &&
      issueOk &&
      resourcesOk &&
      notesOk &&
      blocksOk,
    hasEntry: !!entry || dayBlocks.length > 0 || dayTasks.length > 0,
  };
}
