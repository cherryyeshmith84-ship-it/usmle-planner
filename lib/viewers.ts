// A "viewer" is a read-only-access account that is NOT a mentor - it never
// shows up in the mentors table, never gets availability/sessions/booking,
// and never appears in the Mentorship directory. It exists purely so an
// admin can hand someone (a parent, a colleague, anyone who isn't actually
// mentoring) read-only visibility into specific students, from their own
// roster and their own portal (/viewer/signup, /viewer/login, /viewer) -
// completely separate from how a "viewer mentor" (an existing mentor
// granted read-only access to someone else's student, see
// components/ViewerMentorsEditor.tsx) works. See migration
// create_viewers_and_student_viewers for the table/RLS side of this.
export interface Viewer {
  id: string;
  name: string;
  email: string;
  active: boolean;
  created_by?: string | null;
  created_at?: string;
}

/** Checks (case-insensitively) whether an email belongs to an active viewer. */
export function findViewerByEmail(viewers: Viewer[], email: string | null | undefined): Viewer | null {
  if (!email) return null;
  const lower = email.toLowerCase();
  return viewers.find((v) => v.email.toLowerCase() === lower) ?? null;
}
