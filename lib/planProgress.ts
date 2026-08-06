import type { PlanTask } from "./planTasks";

function addDaysIso(date: string, n: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * A day only "counts" as complete if everything mentor-required for it is
 * done - no partial credit. Tasks the mentor marked Optional don't block
 * this (that's what "optional" means), unless literally every task that day
 * happens to be optional, in which case those still have to all be checked
 * off - otherwise a day where a mentor only assigned optional items would
 * count as automatically "done" with nothing actually completed.
 */
function isDayFullyCompleted(tasksForDay: PlanTask[]): boolean {
  if (tasksForDay.length === 0) return false;
  const required = tasksForDay.filter((t) => !t.is_optional);
  const graded = required.length > 0 ? required : tasksForDay;
  return graded.every((t) => t.completed);
}

export interface PlanProgressDay {
  date: string;
  totalTasks: number;
  completedTasks: number;
  done: boolean;
}

export interface PlanProgress {
  days: PlanProgressDay[];
  completedDays: number;
  totalDays: number;
  percent: number; // 0-100, rounded; 0 when there's nothing to track yet
  planStart: string | null;
  planHorizon: string | null; // latest date the mentor has assigned anything for, even if that's still in the future
}

/**
 * "Study Plan Progress" bar - how much of the mentor's plan the student has
 * actually completed, from whenever the mentor started assigning tasks
 * through today. Only mentor-sourced tasks count (source === "mentor"),
 * not the AI-default or student-added ones - this is specifically tracking
 * the mentor's plan, not the student's whole planner.
 *
 * Deliberately only counts days that have already arrived (task_date <=
 * today): a day the mentor already pre-planned for next week isn't
 * "missed" yet, it just hasn't happened. That's also what makes the bar
 * "readjust" as the mentor plans further ahead - a future day the mentor
 * just assigned doesn't touch the percentage at all until its date arrives,
 * at which point it joins the denominator like any other day.
 */
export function computeMentorPlanProgress(allPlanTasks: PlanTask[], todayIso: string): PlanProgress {
  const mentorTasks = allPlanTasks.filter((t) => t.source === "mentor");
  if (mentorTasks.length === 0) {
    return { days: [], completedDays: 0, totalDays: 0, percent: 0, planStart: null, planHorizon: null };
  }

  const byDate = new Map<string, PlanTask[]>();
  for (const t of mentorTasks) {
    const list = byDate.get(t.task_date) ?? [];
    list.push(t);
    byDate.set(t.task_date, list);
  }

  const allDates = [...byDate.keys()].sort();
  const planStart = allDates[0];
  const planHorizon = allDates[allDates.length - 1];
  const countedDates = allDates.filter((d) => d <= todayIso);

  const days: PlanProgressDay[] = countedDates.map((date) => {
    const tasks = byDate.get(date) ?? [];
    return {
      date,
      totalTasks: tasks.length,
      completedTasks: tasks.filter((t) => t.completed).length,
      done: isDayFullyCompleted(tasks),
    };
  });

  const completedDays = days.filter((d) => d.done).length;
  const totalDays = days.length;
  const percent = totalDays === 0 ? 0 : Math.round((completedDays / totalDays) * 100);

  return { days, completedDays, totalDays, percent, planStart, planHorizon };
}

export type DayBadge = "done" | "missed";

/**
 * Per-row done/missed badge for a locked (past) day - shown regardless of
 * whether the mentor assigned anything, so every locked day resolves to one
 * of the two, not a blank. Prefers the mentor-assignment signal (same
 * all-required-tasks-complete rule as the progress bar above); falls back
 * to the day's own "Study Status" checkbox (planner_entries.task_completed)
 * when the mentor didn't assign anything that day, so there's still a
 * meaningful answer instead of just always showing a red X on days the
 * mentor never touched.
 */
export function computeDayBadge(mentorTasksForDate: PlanTask[], entryTaskCompleted: boolean | undefined): DayBadge {
  if (mentorTasksForDate.length > 0) {
    return isDayFullyCompleted(mentorTasksForDate) ? "done" : "missed";
  }
  return entryTaskCompleted === true ? "done" : "missed";
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
