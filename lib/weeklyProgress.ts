import type { PlannerEntry } from "./plannerColumns";
import type { UWorldBlock } from "./uworldBlocks";
import type { PlanTask } from "./planTasks";

export interface WeeklyProgressSummary {
  questionsCompleted: number;
  questionsPlanned: number;
  hours: number;
  daysStudied: number;
  daysInWindow: number;
  assignmentsCompleted: number;
  assignmentsTotal: number;
  averageUWorldPercent: number | null;
}

// Pure UTC date-string arithmetic - never touches the browser's local
// timezone (see the matching comment in PlannerGridClient.tsx's addDays for
// why the old "parse local, round-trip through toISOString" version broke
// for anyone in a timezone ahead of UTC, e.g. returning the same date for
// every day in the loop instead of 7 distinct ones).
function last7Dates(endDateIso: string): string[] {
  const [y, m, d] = endDateIso.split("-").map(Number);
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) {
    out.push(new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * "Weekly Progress" (Study Planner v1 item 8) - a rolling 7-day summary
 * (today and the 6 days before it, not a fixed Mon-Sun calendar week) built
 * entirely from data the student/mentor already entered elsewhere - no new
 * fields, nothing extra to fill in. "Not to judge students - just to
 * summarize the week," per the spec, so this stays purely descriptive.
 */
export function computeWeeklyProgress(
  entries: PlannerEntry[],
  blocks: UWorldBlock[],
  planTasks: PlanTask[],
  endDateIso: string
): WeeklyProgressSummary {
  const dates = new Set(last7Dates(endDateIso));

  const entriesInWindow = entries.filter((e) => dates.has(e.log_date));
  const blocksInWindow = blocks.filter((b) => dates.has(b.log_date));
  const tasksInWindow = planTasks.filter((t) => dates.has(t.task_date));

  const blocksByDate = new Map<string, UWorldBlock[]>();
  for (const b of blocksInWindow) {
    const list = blocksByDate.get(b.log_date) ?? [];
    list.push(b);
    blocksByDate.set(b.log_date, list);
  }

  let questionsCompleted = 0;
  let questionsPlanned = 0;
  let hours = 0;
  let daysStudied = 0;

  for (const e of entriesInWindow) {
    const v = e.field_values ?? {};
    const dayBlocks = blocksByDate.get(e.log_date) ?? [];
    questionsCompleted +=
      dayBlocks.length > 0
        ? dayBlocks.reduce((sum, b) => sum + (b.questions ?? 0), 0)
        : Number(v["q_solved"] ?? 0) || 0;
    questionsPlanned += Number(v["questions_planned"] ?? 0) || 0;
    hours += Number(v["hours"] ?? 0) || 0;
    if (v["task_completed"] === true) daysStudied += 1;
  }

  // Blocks logged on a day with no planner_entries row yet still count toward
  // the question total (a student may log blocks before filling in the row).
  for (const [date, dayBlocks] of blocksByDate.entries()) {
    if (!entriesInWindow.some((e) => e.log_date === date)) {
      questionsCompleted += dayBlocks.reduce((sum, b) => sum + (b.questions ?? 0), 0);
    }
  }

  const percentValues = blocksInWindow.map((b) => b.percentage).filter((p): p is number => typeof p === "number");
  const averageUWorldPercent =
    percentValues.length === 0
      ? null
      : Math.round((percentValues.reduce((s, p) => s + p, 0) / percentValues.length) * 10) / 10;

  const assignmentsCompleted = tasksInWindow.filter((t) => t.completed).length;

  return {
    questionsCompleted,
    questionsPlanned,
    hours,
    daysStudied,
    daysInWindow: 7,
    assignmentsCompleted,
    assignmentsTotal: tasksInWindow.length,
    averageUWorldPercent,
  };
}
