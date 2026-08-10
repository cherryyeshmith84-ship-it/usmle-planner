import type { PlanTask } from "./planTasks";

// Pure UTC date-string arithmetic - never touches the browser/server's local
// timezone (see the matching comment in PlannerGridClient.tsx's addDays for
// why the naive "parse local, round-trip through toISOString" version broke
// for anyone in a timezone ahead of UTC).
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export type DayStatus = "completed" | "partial" | "missed" | "today" | "upcoming" | "no-plan";

export const DAY_STATUS_COLOR: Record<DayStatus, { bg: string; text: string; label: string }> = {
  completed: { bg: "bg-green-900/40", text: "text-green-400", label: "Completed" },
  partial: { bg: "bg-amber-900/40", text: "text-amber-400", label: "Partially completed" },
  missed: { bg: "bg-red-900/40", text: "text-red-400", label: "Missed" },
  today: { bg: "bg-brand-900/40", text: "text-brand-400", label: "Today" },
  upcoming: { bg: "bg-slate-800", text: "text-slate-400", label: "Upcoming" },
  "no-plan": { bg: "bg-slate-900", text: "text-slate-600", label: "No plan set" },
};

/**
 * Single day's calendar status, from the mentor-assigned tasks for that day
 * (mentor_plan_tasks / PlanTask - the same "Assignments" data already shown
 * on the Home dashboard's Today's Plan card and the flat planner grid's
 * expanded-row Assignments section). "today" always wins regardless of
 * completion state - the blue/highlighted ring is about WHEN, not whether
 * it's done yet; a fully-logged today still counts toward the streak and
 * progress bar, just not toward "completed" calendar color until it's in
 * the past.
 */
export function computeDayStatus(dayTasks: PlanTask[], date: string, todayIso: string): DayStatus {
  if (date === todayIso) return "today";
  if (date > todayIso) return "upcoming";
  if (dayTasks.length === 0) return "no-plan";
  const completed = dayTasks.filter((t) => t.completed).length;
  if (completed === dayTasks.length) return "completed";
  if (completed === 0) return "missed";
  return "partial";
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
  todayIso: string
): CalendarDay[] {
  const days: CalendarDay[] = [];
  let cursor = start;
  let guard = 0;
  while (cursor <= end && guard < 400) {
    const dayTasks = tasksByDate[cursor] ?? [];
    days.push({
      date: cursor,
      status: computeDayStatus(dayTasks, cursor, todayIso),
      completedCount: dayTasks.filter((t) => t.completed).length,
      totalCount: dayTasks.length,
    });
    cursor = addDays(cursor, 1);
    guard++;
  }
  return days;
}

/**
 * Rough "ahead of / behind schedule" signal for the dashboard header - NOT a
 * precise academic metric, just a quick gut-check. Looks at every past day
 * since the mentor-set plan start date: each fully-completed day counts as
 * +0, each missed or partially-completed day counts as -1 (that's a day's
 * worth of work still owed). Any FUTURE day that's already been fully
 * completed (the student worked ahead) counts as +1. The sum is how many
 * days ahead (positive) or behind (negative) the student currently is.
 * Returns 0 if there's no start date set yet, or nothing's been logged.
 */
export function computeSchedulePaceDays(
  tasksByDate: Record<string, PlanTask[]>,
  startDate: string | null,
  todayIso: string
): number {
  if (!startDate || startDate > todayIso) return 0;
  let pace = 0;
  let cursor = startDate;
  let guard = 0;
  while (cursor < todayIso && guard < 400) {
    const status = computeDayStatus(tasksByDate[cursor] ?? [], cursor, todayIso);
    if (status === "missed" || status === "partial") pace -= 1;
    cursor = addDays(cursor, 1);
    guard++;
  }
  // Credit for future days already fully completed (worked ahead) - stop
  // looking once we hit the first day that ISN'T fully done, since "ahead"
  // should mean a consecutive run from today, not scattered future days.
  cursor = addDays(todayIso, 1);
  guard = 0;
  while (guard < 400) {
    const dayTasks = tasksByDate[cursor];
    if (!dayTasks || dayTasks.length === 0 || dayTasks.some((t) => !t.completed)) break;
    pace += 1;
    cursor = addDays(cursor, 1);
    guard++;
  }
  return pace;
}

/** Calendar-month grid helper - the Monday on/before the 1st of the month
 *  containing `anyDateInMonth`, so a 7-wide grid starting there always
 *  covers the whole month (plus a few leading/trailing days from neighboring
 *  months, same convention as the mockup's Mo-Su week rows). */
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
