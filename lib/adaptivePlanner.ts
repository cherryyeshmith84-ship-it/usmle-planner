import type { PlanTask, PlanTaskCategory } from "./planTasks";

// Pure UTC date-string arithmetic - same approach as every other date helper
// in this app (see the timezone-bug comment in PlannerGridClient.tsx).
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * The "adaptive engine" (Study Planner v2, phase 4) - deliberately
 * "suggest, student confirms" for anything that touches the student's own
 * plan (catch-up pace, move-ahead), same design as the missed-day prompt.
 * The one exception is the skipped-subject flag, which doesn't change the
 * student's plan at all - it just tells their mentor, the same way marking
 * a day complete already does (see MarkDayCompleteButton.tsx).
 */

export interface CatchUpPlan {
  behindDays: number;
  windowDays: number;
  extraTasksPerDay: number;
  message: string;
}

/**
 * How to catch up, in plain terms - spreads the pace deficit (see
 * computeSchedulePaceDays in lib/plannerCalendar.ts) over a short window
 * instead of dumping it all on today. `windowDays` is capped at 7 (or fewer
 * days if the exam is closer than that) so the suggestion always stays
 * concrete and short-term, never "catch up eventually."
 */
export function computeCatchUpPlan(
  tasksByDate: Record<string, PlanTask[]>,
  todayIso: string,
  pace: number,
  daysUntilExam: number | null
): CatchUpPlan | null {
  if (pace >= 0) return null;
  const behindDays = -pace;

  let windowDays = 7;
  if (daysUntilExam !== null && daysUntilExam > 0) {
    windowDays = Math.min(windowDays, daysUntilExam);
  }
  windowDays = Math.max(windowDays, 1);

  // Average tasks/day from the last 14 planned days, as a stand-in for "a
  // normal day's workload" - falls back to 1 if there's no history yet, so
  // this never divides by zero or suggests "0 extra tasks."
  const recentCounts: number[] = [];
  let cursor = addDays(todayIso, -1);
  for (let i = 0; i < 14; i++) {
    const count = tasksByDate[cursor]?.length ?? 0;
    if (count > 0) recentCounts.push(count);
    cursor = addDays(cursor, -1);
  }
  const avgTasksPerDay =
    recentCounts.length > 0 ? recentCounts.reduce((a, b) => a + b, 0) / recentCounts.length : 1;

  const extraTasksPerDay = Math.max(1, Math.ceil((avgTasksPerDay * behindDays) / windowDays));

  return {
    behindDays,
    windowDays,
    extraTasksPerDay,
    message: `You're ${behindDays} day${behindDays === 1 ? "" : "s"} behind schedule. Finishing about ${extraTasksPerDay} extra task${extraTasksPerDay === 1 ? "" : "s"} a day for the next ${windowDays} days would get you caught up.`,
  };
}

export interface MoveAheadSuggestion {
  sourceDate: string;
  taskCount: number;
}

/**
 * Suggests pulling tomorrow's tasks into today - only once a student is
 * comfortably ahead (pace >= 2, not just barely), and only if tomorrow
 * actually has something planned to pull forward.
 */
export function computeMoveAheadSuggestion(
  pace: number,
  todayIso: string,
  tasksByDate: Record<string, PlanTask[]>
): MoveAheadSuggestion | null {
  if (pace < 2) return null;
  const tomorrow = addDays(todayIso, 1);
  const tomorrowTasks = tasksByDate[tomorrow] ?? [];
  if (tomorrowTasks.length === 0) return null;
  return { sourceDate: tomorrow, taskCount: tomorrowTasks.length };
}

export interface SkippedCategoryFlag {
  category: PlanTaskCategory;
  missedCount: number;
  lookbackDays: number;
}

const CATEGORY_LABEL: Record<PlanTaskCategory, string> = {
  question_block: "Question Blocks",
  reading: "Reading",
  review: "Review",
  video: "Video",
  other: "Other",
};

export function categoryLabel(category: PlanTaskCategory): string {
  return CATEGORY_LABEL[category] ?? category;
}

/**
 * Categories a student has consistently skipped (assigned, past-due, never
 * checked off) over the trailing window - flagged for mentor review once 3+
 * misses pile up in the same category, since one or two skipped days is
 * normal but a repeated pattern in one subject is worth a mentor's eyes.
 */
export function computeSkippedCategories(
  planTasks: PlanTask[],
  todayIso: string,
  lookbackDays = 14,
  missThreshold = 3
): SkippedCategoryFlag[] {
  const cutoff = addDays(todayIso, -lookbackDays);
  const counts = new Map<PlanTaskCategory, number>();
  for (const t of planTasks) {
    if (t.completed) continue;
    if (t.task_date < cutoff || t.task_date >= todayIso) continue;
    counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count >= missThreshold)
    .map(([category, missedCount]) => ({ category, missedCount, lookbackDays }))
    .sort((a, b) => b.missedCount - a.missedCount);
}
