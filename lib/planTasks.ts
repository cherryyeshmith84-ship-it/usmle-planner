export type PlanTaskCategory = "question_block" | "reading" | "review" | "video" | "other";
export type PlanTaskSource = "mentor" | "ai_default" | "student";

export interface PlanTask {
  id: string;
  student_id: string;
  mentor_id: string | null;
  task_date: string;
  title: string;
  detail: string | null;
  category: PlanTaskCategory;
  is_optional: boolean;
  estimated_minutes: number | null;
  sort_order: number;
  source: PlanTaskSource;
  completed: boolean;
  completed_at: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Today's date as YYYY-MM-DD, matching how task_date/taken_date are stored elsewhere in this app. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface TaskProgress {
  completedCount: number;
  totalCount: number;
  percent: number; // 0-100, rounded. 0 when there are no tasks.
}

export function computeTaskProgress(tasks: PlanTask[]): TaskProgress {
  const totalCount = tasks.length;
  const completedCount = tasks.filter((t) => t.completed).length;
  const percent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
  return { completedCount, totalCount, percent };
}

/** Sum of estimated_minutes across tasks, formatted like "6 Hours" / "45 Min" / "1.5 Hours". */
export function formatEstimatedTime(tasks: PlanTask[]): string | null {
  const minutes = tasks.reduce((sum, t) => sum + (t.estimated_minutes ?? 0), 0);
  if (minutes <= 0) return null;
  if (minutes < 60) return `${minutes} Min`;
  const hours = minutes / 60;
  const rounded = Number.isInteger(hours) ? hours : Math.round(hours * 10) / 10;
  return `${rounded} Hour${rounded === 1 ? "" : "s"}`;
}

/** Who assigned a given day's tasks, for the "Assigned By" line - a mentor row wins
 *  over an ai_default one if (in theory) both are ever present for the same day. */
export function assignedByLabel(tasks: PlanTask[]): "Mentor" | "AI" | null {
  if (tasks.length === 0) return null;
  return tasks.some((t) => t.source === "mentor") ? "Mentor" : "AI";
}

export function sortTasks(tasks: PlanTask[]): PlanTask[] {
  return [...tasks].sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));
}

/** Groups a flat list of tasks (as fetched for a whole date range) by task_date, each sorted. */
export function groupTasksByDate(tasks: PlanTask[]): Record<string, PlanTask[]> {
  const out: Record<string, PlanTask[]> = {};
  for (const t of tasks) {
    (out[t.task_date] ??= []).push(t);
  }
  for (const date of Object.keys(out)) {
    out[date] = sortTasks(out[date]);
  }
  return out;
}
