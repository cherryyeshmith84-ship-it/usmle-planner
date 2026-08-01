export interface StudentPlannerSettings {
  student_id: string;
  start_date: string;
  updated_at: string;
}

function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Works out what date range the planner grid should default to on load.
 *
 * Without a mentor-set start date, this is the old behavior: a week back
 * from today (or further back if entries already exist earlier than that)
 * through a week ahead - centered on "today" every time the page loads.
 *
 * With a mentor-set start date, that date is authoritative: the grid starts
 * exactly there - not pulled earlier even if older entries exist from before
 * the mentor set it (that old data is still in the database, just not part
 * of the default view - "Show earlier week" can still reach it) - and keeps
 * growing forward from whatever's been logged since, so it never resets
 * back to being centered on "today": the visible range always reaches at
 * least a week past today AND a week past the latest saved entry, whichever
 * is further out, so there's always room to keep going from where the
 * student/mentor left off.
 */
export function computeInitialPlannerRange(
  startDate: string | null,
  today: string,
  entryDates: string[]
): { rangeStart: string; rangeEnd: string } {
  const earliestEntry = entryDates.length > 0 ? entryDates.reduce((min, d) => (d < min ? d : min)) : null;
  const latestEntry = entryDates.length > 0 ? entryDates.reduce((max, d) => (d > max ? d : max)) : null;

  if (startDate) {
    const rangeStart = startDate;

    let rangeEnd = today > startDate ? today : startDate;
    if (latestEntry && latestEntry > rangeEnd) rangeEnd = latestEntry;
    rangeEnd = addDays(rangeEnd, 7);
    const minimumEnd = addDays(startDate, 13);
    if (rangeEnd < minimumEnd) rangeEnd = minimumEnd;

    return { rangeStart, rangeEnd };
  }

  const fallbackStart = addDays(today, -7);
  const rangeStart = earliestEntry && earliestEntry < fallbackStart ? earliestEntry : fallbackStart;
  const rangeEnd = addDays(today, 7);
  return { rangeStart, rangeEnd };
}
