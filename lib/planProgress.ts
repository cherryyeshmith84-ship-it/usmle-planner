import type { PlannerColumn, PlannerEntry } from "./plannerColumns";

// Pure UTC date-string arithmetic - never touches the browser's local
// timezone (see the matching comment in PlannerGridClient.tsx's addDays for
// why the old "parse local, round-trip through toISOString" version broke
// for anyone in a timezone ahead of UTC).
function addDaysIso(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Whether a single grid cell counts as "filled in" - a checkbox has to be
 *  checked, a number/text field has to be non-blank. Exported so
 *  lib/plannerCalendar.ts can fold flat-grid days into the same
 *  completed/partial/missed calendar coloring as mentor_plan_tasks
 *  ("Assignments") - a mentor who only ever uses the Planned System/First
 *  Aid Pages grid (not the separate Assignments editor) still needs their
 *  plan to show up as something other than blank on the new calendar. */
export function isBoxFilled(column: PlannerColumn, raw: string | number | boolean | null | undefined): boolean {
  if (column.field_type === "checkbox") return raw === true;
  if (raw === null || raw === undefined) return false;
  if (typeof raw === "string") return raw.trim() !== "";
  return true; // a present number counts, including 0
}

/**
 * A day only "counts" as complete if every box in the grid row is filled in
 * - no partial credit for logging half the day. `columns` should already be
 * the active main grid columns (Planned System, Questions, Hours, etc.) -
 * the ones pulled into the expanded panel (Mood, Notes, Reflection...)
 * aren't part of this since those aren't "boxes" in the flat row.
 */
function isDayFullyLogged(entry: PlannerEntry | undefined, columns: PlannerColumn[]): boolean {
  if (columns.length === 0) return false;
  const values = entry?.field_values ?? {};
  return columns.every((col) => isBoxFilled(col, values[col.key]));
}

export interface PlanProgressDay {
  date: string;
  filledBoxes: number;
  totalBoxes: number;
  done: boolean;
}

export interface PlanProgress {
  days: PlanProgressDay[];
  completedDays: number;
  totalDays: number;
  percent: number; // 0-100, rounded; 0 when there's nothing to track yet
  planStart: string | null;
}

/**
 * "Study Plan Progress" bar - how many of the days the mentor has actually
 * planned out (student_planner_settings.start_date, set via
 * PlannerStartDateControl, through the LAST date the mentor gave the
 * student a plan for) have been fully logged. A day only counts once every
 * active grid column for it is filled in - matching what the mentor
 * actually laid out in the grid, not just some of it.
 *
 * The end of the range is NOT "today" - it's whatever the last date is that
 * has any planner_entries data on/after the start date. That means the
 * moment a mentor plans further ahead (even into the future), the bar's
 * total grows to match immediately - it doesn't wait for those days to
 * arrive. Future days just won't be "done" yet until they're actually
 * logged, so the percentage naturally dips until then.
 *
 * Renders nothing (totalDays: 0) until a mentor has both set a start date
 * AND entered at least one day of plan data on/after it.
 */
export function computeGridPlanProgress(
  entries: PlannerEntry[],
  activeColumns: PlannerColumn[],
  startDate: string | null,
  todayIso: string
): PlanProgress {
  if (!startDate || activeColumns.length === 0) {
    return { days: [], completedDays: 0, totalDays: 0, percent: 0, planStart: startDate };
  }

  // Last date on/after the start date that the mentor has actually put
  // something in the grid for - this is "until the day mentor gives
  // planner", not a fixed cutoff at today.
  let lastPlannedDate: string | null = null;
  for (const e of entries) {
    if (e.log_date < startDate) continue;
    const values = e.field_values ?? {};
    const hasAnything = activeColumns.some((col) => isBoxFilled(col, values[col.key]));
    if (hasAnything && (!lastPlannedDate || e.log_date > lastPlannedDate)) {
      lastPlannedDate = e.log_date;
    }
  }
  if (!lastPlannedDate) {
    return { days: [], completedDays: 0, totalDays: 0, percent: 0, planStart: startDate };
  }
  const endDate = lastPlannedDate;

  const entryByDate = new Map(entries.map((e) => [e.log_date, e]));
  const days: PlanProgressDay[] = [];
  let cursor = startDate;
  let guard = 0;
  while (cursor <= endDate && guard < 3000) {
    const entry = entryByDate.get(cursor);
    const values = entry?.field_values ?? {};
    const filledBoxes = activeColumns.filter((col) => isBoxFilled(col, values[col.key])).length;
    days.push({
      date: cursor,
      filledBoxes,
      totalBoxes: activeColumns.length,
      done: filledBoxes === activeColumns.length,
    });
    cursor = addDaysIso(cursor, 1);
    guard++;
  }

  const completedDays = days.filter((d) => d.done).length;
  const totalDays = days.length;
  const percent = totalDays === 0 ? 0 : Math.round((completedDays / totalDays) * 100);

  return { days, completedDays, totalDays, percent, planStart: startDate };
}

export type DayBadge = "done" | "missed";

/** Per-row done/missed badge for a locked (past) day - same all-boxes-filled
 *  rule as the progress bar above, so the badge and the bar always agree. */
export function computeDayBadge(activeColumns: PlannerColumn[], entry: PlannerEntry | undefined): DayBadge {
  return isDayFullyLogged(entry, activeColumns) ? "done" : "missed";
}

/**
 * Editable window for a student's own planner: today and yesterday only (a
 * rolling ~48-hour window) - everything older is locked read-only. Days in
 * the future stay editable (nothing to lock yet). Only applied when a page
 * explicitly opts in (see PlannerGridClient's enforceEditWindow prop) -
 * mentors/admins editing a student's grid on their behalf are never subject
 * to this, only the student editing their own.
 */
export function isDateEditable(date: string, todayIso: string): boolean {
  if (date >= todayIso) return true;
  const yesterday = addDaysIso(todayIso, -1);
  return date === yesterday;
}
