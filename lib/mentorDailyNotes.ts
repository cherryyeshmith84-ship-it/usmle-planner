export type DayStatus = "completed" | "needs_improvement" | "missed" | "rescheduled";

export const DAY_STATUS_LABEL: Record<DayStatus, string> = {
  completed: "Completed",
  needs_improvement: "Needs Improvement",
  missed: "Missed",
  rescheduled: "Rescheduled",
};

export interface MentorDailyNote {
  id: string;
  student_id: string;
  mentor_id: string | null;
  note_date: string;
  content: string;
  // Mentor Checklist (Study Planner v1 item 7) - the mentor's day rating,
  // separate from the free-text note above. Null until a mentor sets it.
  status: DayStatus | null;
  // Mentor Review status (Study Planner v1 item 14) - a separate signal from
  // the day rating above: has the mentor actually looked at this day yet,
  // and when's the next planned check-in. reviewed_at is set automatically
  // the moment a mentor checks "Reviewed", not hand-entered.
  reviewed: boolean;
  reviewed_at: string | null;
  next_checkin_date: string | null;
  // Mentor-flagged "important day" (exam day, NBME day, etc.) - a star the
  // mentor turns on for a specific date, with a short free-text label. Shown
  // to the student on the Study Planner calendar and, if upcoming, on Home.
  is_highlighted: boolean;
  highlight_label: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Keys a flat list of notes by note_date for quick per-day lookup. */
export function groupNotesByDate(notes: MentorDailyNote[]): Record<string, MentorDailyNote> {
  const out: Record<string, MentorDailyNote> = {};
  for (const n of notes) out[n.note_date] = n;
  return out;
}

export interface HighlightedDay {
  date: string;
  label: string | null;
}

/** Every mentor-starred day, soonest first - used for the calendar overlay. */
export function allHighlights(notes: MentorDailyNote[]): HighlightedDay[] {
  return notes
    .filter((n) => n.is_highlighted)
    .map((n) => ({ date: n.note_date, label: n.highlight_label }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Nearest upcoming (today or later) mentor-starred day, if any - for the Home "Important Day" card. */
export function nextUpcomingHighlight(notes: MentorDailyNote[], todayIso: string): HighlightedDay | null {
  const upcoming = allHighlights(notes).filter((h) => h.date >= todayIso);
  return upcoming[0] ?? null;
}
