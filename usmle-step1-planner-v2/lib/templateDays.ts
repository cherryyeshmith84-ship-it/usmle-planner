import type {
  BlockScore,
  ScheduleTemplate,
  StudyTask,
  TemplateDay,
  TemplateTask,
} from "./types";

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Reads a template's tasks safely whether it was saved in the old flat
 * format (TemplateTask[], one list repeating every day) or the newer
 * day-by-day format (TemplateDay[]). Always returns TemplateDay[].
 */
export function getTemplateDays(template: ScheduleTemplate | null | undefined): TemplateDay[] {
  if (!template || !template.tasks || (template.tasks as any[]).length === 0) return [];
  const raw = template.tasks as any[];
  if (raw[0] && typeof raw[0].day_number === "number" && Array.isArray(raw[0].tasks)) {
    return (raw as TemplateDay[]).slice().sort((a, b) => a.day_number - b.day_number);
  }
  // Legacy flat format - treat the whole thing as a single repeating day.
  return [{ day_number: 1, tasks: raw as TemplateTask[] }];
}

/** Which day number (1-indexed) of a sequence "today" falls on, given a start date. */
export function dayNumberFor(startDate: string, today: string): number {
  const start = new Date(startDate + "T00:00:00").getTime();
  const now = new Date(today + "T00:00:00").getTime();
  const diff = Math.round((now - start) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff + 1);
}

/**
 * Tasks for a given day number. If the sequence doesn't reach that far,
 * repeats the last day rather than leaving the student with nothing.
 */
export function tasksForDay(days: TemplateDay[], dayNumber: number): TemplateTask[] {
  if (days.length === 0) return [];
  const exact = days.find((d) => d.day_number === dayNumber);
  if (exact) return exact.tasks;
  if (dayNumber < days[0].day_number) return days[0].tasks;
  return days[days.length - 1].tasks;
}

export function templateTasksToStudyTasks(tasks: TemplateTask[]): StudyTask[] {
  return tasks.map((t) => ({
    id: newId(),
    title: t.title,
    resource: t.resource,
    target: t.target,
    status: "pending" as const,
  }));
}

export interface ResourceAverage {
  resource: string;
  totalQuestions: number;
  totalCorrect: number;
  averagePct: number;
}

/** Cumulative, question-weighted average % correct per resource across all logged blocks. */
export function computeResourceAverages(allBlockScores: BlockScore[]): ResourceAverage[] {
  const map = new Map<string, { q: number; c: number }>();
  for (const b of allBlockScores) {
    if (!b.resource || !b.question_count) continue;
    const cur = map.get(b.resource) ?? { q: 0, c: 0 };
    const correct = Math.round((b.percent_correct / 100) * b.question_count);
    cur.q += b.question_count;
    cur.c += correct;
    map.set(b.resource, cur);
  }
  return Array.from(map.entries())
    .map(([resource, v]) => ({
      resource,
      totalQuestions: v.q,
      totalCorrect: v.c,
      averagePct: v.q > 0 ? Math.round((v.c / v.q) * 100) : 0,
    }))
    .sort((a, b) => b.totalQuestions - a.totalQuestions);
}
