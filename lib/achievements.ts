export interface Achievement {
  id: string;
  emoji: string;
  label: string;
  description: string;
  earned: boolean;
}

/**
 * Study Planner v2, phase 3 - "reward consistency, not perfection" per the
 * spec. Config-driven so a new badge is just one more entry in this list,
 * not a new component. Streak-based badges use LONGEST streak (not current)
 * so a badge earned once stays earned even after a streak later breaks -
 * these are meant to celebrate a milestone reached, not a live status (the
 * dashboard's pace/streak numbers already cover "how am I doing right now").
 * "Zero Missed Days" is the one exception - it's scoped to the current week
 * on purpose, so it resets each week rather than being permanently
 * unattainable after a single early miss.
 */
export function computeAchievements(params: {
  longestStreak: number;
  totalCompletedTasks: number;
  weekHasAnyTasks: boolean;
  weekMissedDays: number;
}): Achievement[] {
  const { longestStreak, totalCompletedTasks, weekHasAnyTasks, weekMissedDays } = params;

  return [
    {
      id: "streak-7",
      emoji: "🔥",
      label: "7 Day Streak",
      description: "Studied 7 days in a row.",
      earned: longestStreak >= 7,
    },
    {
      id: "tasks-100",
      emoji: "💯",
      label: "100 Tasks Finished",
      description: "Completed 100 assigned tasks.",
      earned: totalCompletedTasks >= 100,
    },
    {
      id: "streak-30",
      emoji: "📅",
      label: "One Month Consistent",
      description: "Studied 30 days in a row.",
      earned: longestStreak >= 30,
    },
    {
      id: "zero-missed-week",
      emoji: "⚡",
      label: "Zero Missed Days",
      description: "No missed days this week.",
      earned: weekHasAnyTasks && weekMissedDays === 0,
    },
  ];
}
