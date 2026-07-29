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
