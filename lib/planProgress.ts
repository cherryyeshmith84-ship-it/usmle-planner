import type { PlannerColumn, PlannerEntry } from "./plannerColumns";

function addDaysIso(date: string, n: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whether a single grid cell counts as "filled in" - a checkbox has to be
 *  checked, a number/text field has to be non-blank. */
function isBoxFilled(column: PlannerColumn, raw: string | number | boolean | null | undefined): boolean {
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
 * "Study Plan Progress" bar - how many of the days since the mentor set a
 * plan start date (student_planner_settings.start_date, set via
 * PlannerStartDateControl) have been fully logged, from that start date
 * through today. A day only counts once every active grid column for it is
 * filled in - matching what the mentor actually laid out in the grid, not
 * just some of it.
 *
 * The denominator grows on its own every day that passes (today keeps
 * moving forward) and readjusts immediately if the mentor moves the start
 * date or changes which columns are active - there's no separate "end
 * date" to track, this always runs through today.
 *
 * Renders nothing (totalDays: 0) until a mentor has actually set a start
 * date - before that there's no "plan" to measure against yet.
 */
export function computeGridPlanProgress(
  entries: PlannerEntry[],
  activeColumns: PlannerColumn[],
  startDate: string | null,
  todayIso: string
): PlanProgress {
  if (!startDate || activeColumns.length === 0 || startDate > todayIso) {
    return { days: [], completedDays: 0, totalDays: 0, percent: 0, planStart: startDate };
  }

  const entryByDate = new Map(entries.map((e) => [e.log_date, e]));
  const days: PlanProgressDay[] = [];
  let cursor = startDate;
  let guard = 0;
  while (cursor <= todayIso && guard < 3000) {
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
