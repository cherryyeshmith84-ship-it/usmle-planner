import type { PlanTask } from "./planTasks";
import type { PlannerColumn, PlannerEntry } from "./plannerColumns";

// Pure UTC date-string arithmetic - never touches the browser/server's local
// timezone (see the matching comment in PlannerGridClient.tsx's addDays for
// why the naive "parse local, round-trip through toISOString" version broke
// for anyone in a timezone ahead of UTC).
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

// Note on these specific shades: tailwind.config.ts reverses the green/red/
// amber/slate scales so every existing bg-X-900/text-X-400 class (written
// for the app's original dark theme) keeps working after the switch to a
// light one - X-900 is now the PALEST end of each scale, not the darkest.
// That reversal is correct for most of the app, but this map used to pair
// X-900 with a low opacity (e.g. "bg-green-900/40") - fine on a dark page
// (a translucent dark wash), but on a white card that's an already-pale
// color at 40% opacity, which reads as barely-there off-white. Dropping the
// opacity and moving one step down the (reversed) scale to X-800 gives a
// clearly-colored, solid pastel background instead, with a darker X-300 for
// the label text so it stays readable against it.
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
 * Single day's calendar status - based on mentor_plan_tasks ("Assignments",
 * the checklist a mentor sets and a student checks off).
 *
 * `gridEntry`/`activeColumns` are accepted for backward compatibility with
 * existing callers but are NO LONGER factored into the status. They used to
 * represent the flat planner_columns grid (Planned System, First Aid Pages,
 * etc.) as an alternate source of "the plan" for mentors who didn't use
 * Assignments. That grid is retired - MentorPlannerColumnsEditor (the only
 * UI that could ever fill most of those columns) was removed as dead
 * clutter, so a handful of the globally-active planner_columns
 * (planned_system, q_solved, q_reviewed, first_aid_pages, questions_planned,
 * task_completed) now have NO way to be filled in from any current UI. The
 * few columns DailyPlannerPanel still writes (mood, notes, reflections,
 * tomorrow's goal) are journal entries ABOUT the day, not a checklist of
 * what was planned - but counting them as "grid activity" meant a day with
 * just a mood/notes entry, and zero real Assignments, got treated as having
 * a plan that could mathematically never reach 100% (since those other
 * columns are permanently unfillable) - stuck on "partial" (yellow) forever,
 * even after a student finished every single Assignment for that day. This
 * was the root cause of "I completed everything but it's still showing
 * yellow," reported across multiple students. Assignments are the only real
 * source of "what was planned for this day" now.
 *
 * "today" always wins regardless of completion state. Future days with
 * Assignments get a distinct "upcoming-planned" tint instead of plain gray
 * "upcoming" - visible, immediate confirmation that a plan actually reached
 * the system, without claiming it's "done" before it's even arrived.
 */
export function computeDayStatus(
  dayTasks: PlanTask[],
  date: string,
  todayIso: string,
  _gridEntry?: PlannerEntry,
  _activeColumns: PlannerColumn[] = []
): DayStatus {
  const hasTasks = dayTasks.length > 0;

  if (date === todayIso) return "today";
  if (date > todayIso) return hasTasks ? "upcoming-planned" : "upcoming";
  if (!hasTasks) return "no-plan";

  if (dayTasks.every((t) => t.completed)) return "completed";
  if (dayTasks.every((t) => !t.completed)) return "missed";
  return "partial";
}

export interface CalendarDay {
  date: string;
  status: DayStatus;
  completedCount: number;
  totalCount: number;
}

/** Every day from `start` through `end` (inclusive), with its status - used
 *  to render both the month calendar grid and the weekly view.
 *  `entriesByDate`/`activeColumns` are optional so a caller that genuinely
 *  only cares about Assignments can omit them (they'll just default to no
 *  grid signal); every real page passes them so grid-only mentors' plans
 *  show up too (see computeDayStatus). */
export function buildCalendarRange(
  tasksByDate: Record<string, PlanTask[]>,
  start: string,
  end: string,
  todayIso: string,
  entriesByDate: Record<string, PlannerEntry> = {},
  activeColumns: PlannerColumn[] = []
): CalendarDay[] {
  const days: CalendarDay[] = [];
  let cursor = start;
  let guard = 0;
  while (cursor <= end && guard < 400) {
    const dayTasks = tasksByDate[cursor] ?? [];
    days.push({
      date: cursor,
      status: computeDayStatus(dayTasks, cursor, todayIso, entriesByDate[cursor], activeColumns),
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
 * Counts a day as done/missed/partial from EITHER Assignments or the flat
 * grid (see computeDayStatus) - `entriesByDate`/`activeColumns` default to
 * empty so callers that only track Assignments still work unchanged.
 */
export function computeSchedulePaceDays(
  tasksByDate: Record<string, PlanTask[]>,
  startDate: string | null,
  todayIso: string,
  entriesByDate: Record<string, PlannerEntry> = {},
  activeColumns: PlannerColumn[] = []
): number {
  if (!startDate || startDate > todayIso) return 0;
  let pace = 0;
  let cursor = startDate;
  let guard = 0;
  while (cursor < todayIso && guard < 400) {
    const status = computeDayStatus(tasksByDate[cursor] ?? [], cursor, todayIso, entriesByDate[cursor], activeColumns);
    if (status === "missed" || status === "partial") pace -= 1;
    cursor = addDays(cursor, 1);
    guard++;
  }
  // Credit for future days already fully completed (worked ahead) - stop
  // looking once we hit the first day that ISN'T fully done, since "ahead"
  // should mean a consecutive run from today, not scattered future days.
  // Same fix as computeDayStatus above: judged purely on Assignments now,
  // not the retired flat grid (entriesByDate/activeColumns kept as params
  // for compatibility but no longer consulted here).
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

/** Monday ("YYYY-MM-DD") on/before the given date - the start of that
 *  calendar week for the Weekly View strip. Pure UTC day-of-week math, same
 *  approach as monthGridStart above. */
export function weekStartMonday(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  return addDays(date, diffToMonday);
}

/** Which week of the plan a date falls in (week 1 = the 7 days starting at
 *  the mentor-set start date), or null if there's no start date yet. */
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

/** Aggregate stats over an already-built set of calendar days (see
 *  buildCalendarRange) - pass in just the days you want counted (e.g. the
 *  days that actually fall within the target month, not the padded
 *  leading/trailing days from monthGridStart/End). Study hours are pulled
 *  from planner_entries' "hours" column (the flat grid), not from
 *  mentor_plan_tasks - hours studied isn't tracked per-task. */
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
