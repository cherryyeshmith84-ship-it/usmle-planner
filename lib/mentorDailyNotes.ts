export interface MentorDailyNote {
  id: string;
  student_id: string;
  mentor_id: string | null;
  note_date: string;
  content: string;
  created_at?: string;
  updated_at?: string;
}

/** Keys a flat list of notes by note_date for quick per-day lookup. */
export function groupNotesByDate(notes: MentorDailyNote[]): Record<string, MentorDailyNote> {
  const out: Record<string, MentorDailyNote> = {};
  for (const n of notes) out[n.note_date] = n;
  return out;
}
