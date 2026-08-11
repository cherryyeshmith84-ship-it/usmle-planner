export type PlannerFieldType = "text" | "number" | "textarea" | "checkbox";

export interface PlannerColumn {
  id: string;
  key: string;
  label: string;
  field_type: PlannerFieldType;
  sort_order: number;
  active: boolean;
  // null = a global default column (admin-managed, shown to every student
  // who hasn't been customized). Set to a student's id once their mentor
  // has customized their planner - see resolvePlannerColumns below.
  student_id?: string | null;
}

export interface PlannerEntry {
  id: string;
  user_id: string;
  log_date: string;
  field_values: Record<string, string | number | boolean | null>;
}

export interface StudyResource {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
}

/** Turns a column label into a stable, unique-ish storage key ("Q solved" -> "q_solved"). */
export function slugifyColumnKey(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || `field_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Resolves which planner_columns rows apply to a given student out of
 * everything fetched (global defaults + every student's customizations,
 * typically queried as `.or("student_id.is.null,student_id.eq." + studentId)`).
 * A mentor customizing a student's planner is all-or-nothing per student:
 * if that student has ANY student_id-scoped rows, those entirely replace
 * the global defaults for them (not merged) - "customize" always starts by
 * seeding a copy of the defaults (see MentorPlannerColumnsEditor), so this
 * never leaves a student with a half-empty grid.
 */
export function resolvePlannerColumns(all: PlannerColumn[], studentId: string): PlannerColumn[] {
  const own = all.filter((c) => c.student_id === studentId);
  if (own.length > 0) return own;
  return all.filter((c) => !c.student_id);
}

// Keys pulled out of the flat grid and rendered specially in each day's
// expanded panel (Student Notes, Daily Mood, Today's Biggest Issue,
// Resources Used, Tomorrow's Goal, Daily Reflection) instead of as a plain
// grid column - see PlannerGridClient.tsx's own mainColumns. Journal-style
// fields like these aren't part of "did the mentor plan this day / did the
// student log it," so they're excluded from that concept everywhere it's
// computed (the progress bar, and the Study Planner v2 calendar's
// completed/missed/partial coloring).
const NON_GRID_KEYS = new Set([
  "student_notes",
  "mood",
  "study_issue",
  "resources_used",
  "tomorrow_goal",
  "reflection_went_well",
  "reflection_slowed_down",
  "reflection_improve",
]);

/** Active columns that actually belong in the flat grid row (excludes the
 *  journal-style fields above) - the shared definition of "a day's plan"
 *  used by the progress bar and the calendar's day-status coloring, kept in
 *  one place so they can never quietly disagree with each other. */
export function mainPlannerColumns(columns: PlannerColumn[]): PlannerColumn[] {
  return columns.filter((c) => c.active && !NON_GRID_KEYS.has(c.key));
}

/** Reads a single field value out of a (possibly missing) planner entry, typed per column. */
export function readField(
  entry: PlannerEntry | undefined,
  column: PlannerColumn
): string | number | boolean {
  const raw = entry?.field_values?.[column.key];
  if (column.field_type === "checkbox") return !!raw;
  if (column.field_type === "number") return typeof raw === "number" ? raw : raw === "" || raw == null ? "" : raw;
  return (raw as string) ?? "";
}
