export interface StreakSummary {
  current: number;
  longest: number;
}

function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Consecutive-day study streak for the Home dashboard - purely derived from
 * whatever calendar dates the student has *something* logged for (a
 * planner_entries row or a UWorld block), passed in as a flat list of dates
 * (duplicates fine). No separate "streak" table, so it can never drift out
 * of sync with the planner itself.
 */
export function computeStreaks(activeDates: string[], todayIso: string): StreakSummary {
  const uniqueDates = Array.from(new Set(activeDates)).sort();
  if (uniqueDates.length === 0) return { current: 0, longest: 0 };

  const dateSet = new Set(uniqueDates);

  // Counts backward from today, or from yesterday if today hasn't been
  // logged yet - a student shouldn't lose their streak just because it's
  // morning and they haven't opened the planner yet.
  let cursor = dateSet.has(todayIso) ? todayIso : addDays(todayIso, -1);
  let current = 0;
  while (dateSet.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  // Longest streak ever - one pass over the sorted unique dates, resetting
  // the running count whenever there's a gap of more than one day.
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of uniqueDates) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }

  return { current, longest: Math.max(longest, current) };
}
