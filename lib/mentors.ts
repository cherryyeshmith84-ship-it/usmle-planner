import { EASTERN_TZ } from "./timezone";

// A "mentors" row can act as a Mentor, a Tutor, or both - one shared roster
// and one shared booking engine (mentor_slots, notes, feedback, join
// tracking, all of it) rather than a separate parallel table/system for
// Tutoring. "mentor" is the default so every row created before this field
// existed keeps behaving exactly as it did (visible only in Mentorship).
export type MentorRole = "mentor" | "tutor" | "both";

export interface Mentor {
  id: string;
  name: string;
  email: string;
  bio: string | null;
  photo_path: string | null;
  active: boolean;
  created_by?: string | null;
  created_at?: string;
  // Richer profile fields - all self-editable by the mentor (see
  // MentorAvailabilityClient's "Edit profile" card).
  languages?: string[] | null;
  med_school?: string | null;
  step1_experience?: string | null;
  why_mentor?: string | null;
  help_areas?: string[] | null;
  meeting_link?: string | null;
  response_time_note?: string | null;
  role?: MentorRole;
  // Free-text specialties a Tutor/Mentor+Tutor fills in themselves (e.g.
  // "Neuro", "Epi") - not a fixed dropdown list, since different tutors
  // describe their focus differently. Drives the subject-grouped sections
  // on the student-facing Tutoring directory (app/tutoring/page.tsx). Only
  // ever edited from the tutor's own Tutoring dashboard - never shown or
  // editable anywhere on the Mentorship side.
  specialties?: string[] | null;
}

/** Whether a mentors row should show up wherever a given role is being
 *  listed - "both" counts for either. Centralized here so the Mentorship
 *  directory, the Tutoring directory, and each one's "Upcoming Sessions"
 *  filtering all agree on the exact same rule. */
export function mentorActsAs(mentor: Pick<Mentor, "role">, wanted: "mentor" | "tutor"): boolean {
  const role = mentor.role ?? "mentor";
  return role === wanted || role === "both";
}

export interface MentorSlot {
  id: string;
  mentor_id: string;
  start_time: string;
  end_time: string;
  is_booked: boolean;
  booked_by: string | null;
  booked_at: string | null;
  student_note: string | null;
  created_at?: string;
  // Structured pre-booking questionnaire (replaces the old packed
  // "Stage: X | Currently: Y" string in student_note).
  current_stage?: string | null;
  current_nbme?: string | null;
  target_exam_date?: string | null;
  biggest_challenge?: string | null;
  // Cancellation - kept separate from is_booked so a cancelled session
  // stays distinguishable from a slot that was simply never booked.
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  // Who this open slot is for: "existing" = only students already linked to
  // this mentor (via their Settings "mentor's email" field), "new" = only
  // students who aren't linked to this mentor yet, null/undefined = open to
  // everyone (the default for every slot created before this existed).
  audience?: "existing" | "new" | null;
  // Set the moment each side clicks "Join Meeting" (see SessionsListClient's
  // MeetingJoinControls) - drives the Live/Waiting badge below. Each row is
  // one specific one-off session, so these never get reused across
  // different meetings the way a recurring link would.
  mentor_joined_at?: string | null;
  student_joined_at?: string | null;
}

/** Whether a student counts as an "existing student" of a given mentor -
 *  same definition used for the mentor dashboard's "My students" list: the
 *  student has linked this mentor's email under their own Settings. Shared
 *  here so slot-visibility filtering (existing vs new audience) always
 *  agrees with that list. */
export function isExistingStudentOf(studentMentorEmail: string | null | undefined, mentorEmail: string): boolean {
  if (!studentMentorEmail) return false;
  return studentMentorEmail.trim().toLowerCase() === mentorEmail.trim().toLowerCase();
}

/** Whether a given slot should be visible/bookable by a student, based on
 *  its audience setting and whether that student is already linked to the
 *  mentor. A null/undefined audience (every slot created before this
 *  feature existed) stays open to everyone. */
export function slotVisibleToStudent(slot: Pick<MentorSlot, "audience">, isExistingStudent: boolean): boolean {
  if (!slot.audience) return true;
  return slot.audience === "existing" ? isExistingStudent : !isExistingStudent;
}

/** Fixed options for the pre-booking questionnaire and mentor "help areas"
 *  checklist - single source of truth so the booking form, mentor profile
 *  editor, and any future admin UI all offer the exact same choices. */
export const PREP_STAGE_OPTIONS = ["Beginning", "Dedicated", "Final Revision", "Repeat Test Taker"] as const;

export const BIGGEST_CHALLENGE_OPTIONS = [
  "Staying consistent",
  "Low NBME",
  "Burnout",
  "Study plan",
  "Unsure if ready",
  "Other",
] as const;

export const HELP_AREA_OPTIONS = [
  "Study planning",
  "Accountability",
  "Weekly check-ins",
  "NBME strategy",
  "Motivation",
  "Exam readiness",
  "Resource selection",
] as const;

/** A mentor's write-up after a completed session - always readable by the
 *  student it's about, so they never have to re-explain their situation
 *  next time (see mentor_session_notes table + its RLS policies). One row
 *  per slot, upserted on slot_id. */
export interface SessionNote {
  id?: string;
  slot_id: string;
  mentor_id: string;
  student_id: string;
  discussion: string | null;
  strengths: string | null;
  weaknesses: string | null;
  study_plan: string | null;
  goals: string | null;
  created_at?: string;
  updated_at?: string;
}

/** A student's rating of a completed session - always writable only by the
 *  student it belongs to (see mentor_session_feedback RLS: "Student manages
 *  own feedback"), always readable by the mentor it's about ("Mentor views
 *  own session feedback"). One row per slot, upserted on slot_id. */
export interface SessionFeedback {
  id?: string;
  slot_id: string;
  mentor_id: string;
  student_id: string;
  rating: number; // 1-5
  helpful: boolean | null;
  comment: string | null;
  created_at?: string;
}

/** Rounds to 1 decimal place, e.g. [5,5,4] -> 4.7. Returns null for an empty
 *  list so callers can show "No ratings yet" instead of "0★". Shared by the
 *  mentor's own dashboard, the public profile page, and the directory card
 *  grid so the "X★ (Y reviews)" number is computed identically everywhere. */
export function averageRating(feedback: { rating: number }[]): number | null {
  if (feedback.length === 0) return null;
  return Math.round((feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length) * 10) / 10;
}

export type SlotStatus = "upcoming" | "completed" | "cancelled";

/** A session's lifecycle status, derived rather than stored: cancelled
 *  always wins, otherwise it's completed once the end time has passed. */
export function getSlotStatus(slot: Pick<MentorSlot, "end_time" | "cancelled_at">): SlotStatus {
  if (slot.cancelled_at) return "cancelled";
  return slot.end_time < new Date().toISOString() ? "completed" : "upcoming";
}

export type MeetingLiveStatus = "not_yet" | "waiting" | "live" | "ended";

// Shows the badge starting a few minutes early, so a mentor/student who
// clicks Join Meeting slightly ahead of time doesn't just see nothing.
const MEETING_GRACE_MS = 10 * 60 * 1000;

/** Whether a booked session's meeting room counts as "Live" right now.
 *  "live" only once BOTH the mentor and the student have clicked Join
 *  Meeting - one side alone shows "waiting". Only meaningful within the
 *  slot's own scheduled window (plus a short grace period beforehand);
 *  well before or after the actual time, no badge is shown at all so
 *  nothing implies a meeting is supposed to be happening yet. Each
 *  mentor_slots row is one specific one-off session, so a join timestamp
 *  from a past meeting is never mistaken for this one. */
export function meetingLiveStatus(
  slot: Pick<MentorSlot, "start_time" | "end_time" | "mentor_joined_at" | "student_joined_at">
): MeetingLiveStatus {
  const now = Date.now();
  const start = new Date(slot.start_time).getTime();
  const end = new Date(slot.end_time).getTime();
  if (now < start - MEETING_GRACE_MS) return "not_yet";
  if (now > end) return "ended";
  return slot.mentor_joined_at && slot.student_joined_at ? "live" : "waiting";
}

/** Public URL for a photo stored in the mentor-photos bucket (bucket is public - no signing needed). */
export function mentorPhotoUrl(photoPath: string | null, supabaseUrl: string): string | null {
  if (!photoPath) return null;
  return `${supabaseUrl}/storage/v1/object/public/mentor-photos/${photoPath}`;
}

/** Checks (case-insensitively) whether an email belongs to an active mentor. */
export function findMentorByEmail(mentors: Mentor[], email: string | null | undefined): Mentor | null {
  if (!email) return null;
  const lower = email.toLowerCase();
  return mentors.find((m) => m.email.toLowerCase() === lower) ?? null;
}

/** Lowercased set of every mentor email (active or not) - a deactivated
 *  mentor's account is still a mentor account, not a student, so exclusion
 *  from student listings shouldn't depend on active status the way
 *  assignment eligibility does. Build once per page load, then check
 *  membership with isMentorProfile below for every profile row. */
export function mentorEmailSet(mentors: { email: string }[]): Set<string> {
  return new Set(mentors.map((m) => m.email.trim().toLowerCase()));
}

/** Whether a profiles row belongs to a mentor account. Mentors sign up
 *  through the exact same public /signup (and now /mentor/signup) form as
 *  students, so their row lives in the same profiles table - without this
 *  check, a mentor who's signed up shows up mixed into admin "Students"
 *  listings right alongside real students. */
export function isMentorProfile(profileEmail: string | null | undefined, mentorEmails: Set<string>): boolean {
  if (!profileEmail) return false;
  return mentorEmails.has(profileEmail.trim().toLowerCase());
}

// Mentorship times are always shown in Eastern Time, regardless of the
// viewer's own device/browser timezone - a mentor in one timezone and a
// student in another need to look at the exact same slot and agree on when
// it is. timeZoneName: "short" makes that explicit right on the label
// (e.g. "2:30 PM EDT") instead of leaving people to guess or assume it's
// their own local time.
const DATE_FMT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: EASTERN_TZ,
};
const TIME_FMT: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
  timeZone: EASTERN_TZ,
  timeZoneName: "short",
};

export function formatSlotDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", DATE_FMT);
}

export function formatSlotTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", TIME_FMT);
}

/** Groups slots by calendar date (local time) for a day-by-day list view. Generic so callers
 *  that pass an extended slot type (e.g. with a joined booker profile) don't lose that typing. */
export function groupSlotsByDate<T extends MentorSlot>(slots: T[]): { date: string; slots: T[] }[] {
  const map = new Map<string, T[]>();
  for (const s of slots) {
    const key = formatSlotDate(s.start_time);
    const list = map.get(key) ?? [];
    list.push(s);
    map.set(key, list);
  }
  return Array.from(map.entries())
    .map(([date, slots]) => ({
      date,
      slots: slots.sort((a, b) => a.start_time.localeCompare(b.start_time)),
    }))
    .sort((a, b) => a.slots[0].start_time.localeCompare(b.slots[0].start_time));
}
