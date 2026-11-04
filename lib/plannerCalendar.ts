import type { PlanTask } from "./planTasks";
import type { PlannerColumn, PlannerEntry } from "./plannerColumns";
import { hasActiveColumn } from "./plannerColumns";
import type { UWorldBlock } from "./uworldBlocks";

// Pure UTC date-string arithmetic - never touches the browser/server's local
// timezone.
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export type DayStatus =
  | "completed"
  | "partial"
  | "missed"
  | "today"
  | "upcoming-planned"
  | "upcoming"
  | "no-plan";

export const DAY_STATUS_COLOR: Record<DayStatus, { bg: string; text: string; label: string }> = {
  completed: { bg: "bg-green-800", text: "text-green-300", label: "Completed" },
  partial: { bg: "bg-amber-800", text: "text-amber-300", label: "Partially completed" },
  missed: { bg: "bg-red-800", text: "text-red-300", label: "Missed" },
  today: { bg: "bg-brand-500", text: "text-white", label: "Today" },
  "upcoming-planned": { bg: "bg-brand-900/60", text: "text-brand-600", label: "Planned" },
  upcoming: { bg: "bg-slate-800", text: "text-slate-500", label: "Upcoming" },
  "no-plan": { bg: "bg-slate-900", text: "text-slate-500", label: "No plan set" },
};

/**
 * Single day's calendar status - based on mentor_plan_tasks ("Assignments")
 * plus whatever UWorld Blocks the student logged that day.
 *
 * A day only counts as "missed" (red) when NEITHER any Assignment was
 * checked off NOR any Block was logged with a real question count.
 *
 * A day is fully "completed" (green) when every Assignment is checked off
 * AND the journal sections the mentor turned on - Today's Biggest Issue
 * (including "No issue") and Resources Used - are filled in AND any Block
 * the student started is fully filled in. Student Notes are OPTIONAL and
 * never block green. Daily Reflection and Mood are not required either.
 *
 * "today" always wins. Future days with Assignments are "upcoming-planned".
 * A past day with no tasks and no Blocks is "no-plan"; with a logged Block
 * but no tasks it is "partial".
 */
export function computeDayStatus(
  dayTasks: PlanTask[],
  date: string,
  todayIso: string,
  entry?: PlannerEntry,
  _mainColumns: PlannerColumn[] = [],
  journalColumns: PlannerColumn[] = [],
  dayBlocks: UWorldBlock[] = []
): DayStatus {
  const hasTasks = dayTasks.length > 0;
  const hasLoggedBlock = dayBlocks.some((b) => b.questions !== null && b.questions !== undefined);

  if (date === todayIso) return "today";
  if (date > todayIso) return hasTasks ? "upcoming-planned" : "upcoming";
  if (!hasTasks) return hasLoggedBlock ? "partial" : "no-plan";

  const anyTaskDone = dayTasks.some((t) => t.completed);
  const allTasksDone = dayTasks.every((t) => t.completed);

  if (!anyTaskDone && !hasLoggedBlock) return "missed";
  if (!allTasksDone) return "partial";

  const v = entry?.field_values ?? {};
  const issueOk = !hasActiveColumn(journalColumns, "study_issue") || !!v["study_issue"];
  const resourcesOk =
    !hasActiveColumn(journalColumns, "resources_used") ||
    (typeof v["resources_used"] === "string" && v["resources_used"].trim() !== "");
  const blocksOk = dayBlocks.every((b) => b.questions !== null && b.questions !== undefined);

  return issueOk && resourcesOk && blocksOk ? "completed" : "partial";
}

export interface CalendarDay {
  date: string;
  status: DayStatus;
  completedCount: number;
  totalCount: number;
}

/** Every day from `start` through `end` (inclusive), with its status - used
 *  to render both the month calendar grid and the weekly view. */
export function buildCalendarRange(
  tasksByDate: Record<string, PlanTask[]>,
  start: string,
  end: string,
  todayIso: string,
  entriesByDate: Record<string, PlannerEntry> = {},
  activeColumns: PlannerColumn[] = [],
  journalColumns: PlannerColumn[] = [],
  blocksByDate: Record<string, UWorldBlock[]> = {}
): CalendarDay[] {
  const days: CalendarDay[] = [];
  let cursor = start;
  let guard = 0;
  while (cursor <= end && guard < 400) {
    const dayTasks = tasksByDate[cursor] ?? [];
    days.push({
      date: cursor,
      status: computeDayStatus(
        dayTasks,
        cursor,
        todayIso,
        entriesByDate[cursor],
        activeColumns,
        journalColumns,
        blocksByDate[cursor] ?? []
      ),
      completedCount: dayTasks.filter((t) => t.completed).length,
      totalCount: dayTasks.length,
    });
    cursor = addDays(cursor, 1);
    guard++;
  }
  return days;
}

/**
 * Rough "ahead of / behind schedule" signal for the dashboard header. Each
 * past day since the plan start date that is missed or partial counts -1;
 * future days already fully completed (worked ahead) count +1 in a
 * consecutive run from tomorrow. Returns 0 if there's no start date yet.
 */
export function computeSchedulePaceDays(
  tasksByDate: Record<string, PlanTask[]>,
  startDate: string | null,
  todayIso: string,
  entriesByDate: Record<string, PlannerEntry> = {},
  activeColumns: PlannerColumn[] = [],
  journalColumns: PlannerColumn[] = [],
  blocksByDate: Record<string, UWorldBlock[]> = {}
): number {
  if (!startDate || startDate > todayIso) return 0;
  let pace = 0;
  let cursor = startDate;
  let guard = 0;
  while (cursor < todayIso && guard < 400) {
    const status = computeDayStatus(
      tasksByDate[cursor] ?? [],
      cursor,
      todayIso,
      entriesByDate[cursor],
      activeColumns,
      journalColumns,
      blocksByDate[cursor] ?? []
    );
    if (status === "missed" || status === "partial") pace -= 1;
    cursor = addDays(cursor, 1);
    guard++;
  }
  cursor = addDays(todayIso, 1);
  guard = 0;
  while (guard < 400) {
    const dayTasks = tasksByDate[cursor];
    const tasksFullyDone = !!dayTasks && dayTasks.length > 0 && dayTasks.every((t) => t.completed);
    if (!tasksFullyDone) break;
    pace += 1;
    cursor = addDays(cursor, 1);
    guard++;
  }
  return pace;
}

/** Calendar-month grid helper - the Monday on/before the 1st of the month
 *  containing `anyDateInMonth`. */
export function monthGridStart(anyDateInMonth: string): string {
  const [y, m] = anyDateInMonth.split("-").map(Number);
  const firstOfMonth = `${y}-${String(m).padStart(2, "0")}-01`;
  const dow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  return addDays(firstOfMonth, diffToMonday);
}

export function monthGridEnd(anyDateInMonth: string): string {
  const start = monthGridStart(anyDateInMonth);
  return addDays(start, 41); // 6 full weeks, always covers the month
}

export function addDaysIso(date: string, n: number): string {
  return addDays(date, n);
}

/** Monday ("YYYY-MM-DD") on/before the given date. */
export function weekStartMonday(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  return addDays(date, diffToMonday);
}

/** Which week of the plan a date falls in (week 1 = the 7 days starting at
 *  the plan start date), or null if there's no start date yet. */
export function weekNumberInPlan(date: string, startDate: string | null): number | null {
  if (!startDate) return null;
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [dy, dm, dd] = date.split("-").map(Number);
  const diffDays = Math.round(
    (Date.UTC(dy, dm - 1, dd) - Date.UTC(sy, sm - 1, sd)) / (1000 * 60 * 60 * 24)
  );
  return diffDays >= 0 ? Math.floor(diffDays / 7) + 1 : null;
}

export interface MonthStats {
  completedDays: number;
  missedDays: number;
  partialDays: number;
  studyHours: number;
}

/** Aggregate stats over an already-built set of calendar days. */
export function computeMonthStats(days: CalendarDay[], entries: PlannerEntry[]): MonthStats {
  const dateSet = new Set(days.map((d) => d.date));
  const studyHours = entries
    .filter((e) => dateSet.has(e.log_date))
    .reduce((sum, e) => sum + (Number(e.field_values?.["hours"]) || 0), 0);
  return {
    completedDays: days.filter((d) => d.status === "completed").length,
    missedDays: days.filter((d) => d.status === "missed").length,
    partialDays: days.filter((d) => d.status === "partial").length,
    studyHours: Math.round(studyHours * 10) / 10,
  };
}
