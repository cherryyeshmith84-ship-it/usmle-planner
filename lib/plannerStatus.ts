import type { PlannerEntry } from "./plannerColumns";
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
  todayIso: string
): TodayStatus {
  const entry = entries.find((e) => e.log_date === todayIso) ?? null;
  const dayBlocks = blocks.filter((b) => b.log_date === todayIso);
  const dayTasks = planTasks.filter((t) => t.task_date === todayIso);
  const v = entry?.field_values ?? {};

  const questionsCompleted =
    dayBlocks.length > 0
      ? dayBlocks.reduce((sum, b) => sum + (b.questions ?? 0), 0)
      : Number(v["q_solved"] ?? 0) || 0;

  return {
    questionsCompleted,
    questionsPlanned: Number(v["questions_planned"] ?? 0) || 0,
    hours: Number(v["hours"] ?? 0) || 0,
    assignmentsCompleted: dayTasks.filter((t) => t.completed).length,
    assignmentsTotal: dayTasks.length,
    studyCompleted: v["task_completed"] === true,
    hasEntry: !!entry || dayBlocks.length > 0 || dayTasks.length > 0,
  };
}
