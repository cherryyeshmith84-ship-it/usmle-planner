export type PlannerFieldType = "text" | "number" | "textarea" | "checkbox";

export interface PlannerColumn {
  id: string;
  key: string;
  label: string;
  field_type: PlannerFieldType;
  sort_order: number;
  active: boolean;
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
