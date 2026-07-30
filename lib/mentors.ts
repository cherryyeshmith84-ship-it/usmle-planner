import { EASTERN_TZ } from "./timezone";

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

export type SlotStatus = "upcoming" | "completed" | "cancelled";

/** A session's lifecycle status, derived rather than stored: cancelled
 *  always wins, otherwise it's completed once the end time has passed. */
export function getSlotStatus(slot: Pick<MentorSlot, "end_time" | "cancelled_at">): SlotStatus {
  if (slot.cancelled_at) return "cancelled";
  return slot.end_time < new Date().toISOString() ? "completed" : "upcoming";
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
