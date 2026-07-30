import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { Mentor, MentorSlot, SessionNote } from "@/lib/mentors";
import { findMentorByEmail, mentorPhotoUrl } from "@/lib/mentors";
import { getContentPublished } from "@/lib/platformSettings";
import AppShell from "@/components/AppShell";
import SessionsListClient, { type SessionRow } from "@/components/SessionsListClient";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

type MyBooking = MentorSlot & {
  mentors?: { id: string; name: string; photo_path: string | null; meeting_link: string | null } | null;
};
type BookedByMe = MentorSlot & {
  booked_by_profile?: { full_name: string | null; email: string | null } | null;
};

/**
 * Dedicated "Upcoming sessions" page under the Mentorship nav group - now
 * split into Upcoming / Past (Completed or Cancelled) via SessionsListClient,
 * with Join Meeting / Reschedule / Cancel actions on upcoming rows. Same
 * mentor-vs-student branching as app/mentorship/page.tsx: a mentor sees who's
 * booked time with them, a student sees every session they've booked across
 * every mentor.
 */
export default async function UpcomingSessionsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("is_admin, full_name")
    .eq("id", user.id)
    .single();
  const profile = profileData as Pick<Profile, "is_admin" | "full_name"> | null;
  const contentPublished = profile?.is_admin ? true : await getContentPublished(supabase);

  const { data: mentorsData } = await supabase.from("mentors").select("*").eq("active", true);
  const mentors = (mentorsData ?? []) as Mentor[];
  const myMentorRecord = findMentorByEmail(mentors, user.email);

  if (myMentorRecord) {
    // No end_time/is_booked-only cutoff here anymore (that used to hide
    // completed and cancelled sessions entirely) - every booked slot is
    // fetched and SessionsListClient buckets it into Upcoming vs Past based
    // on getSlotStatus().
    const { data } = await supabase
      .from("mentor_slots")
      .select("*, booked_by_profile:booked_by(full_name, email)")
      .eq("mentor_id", myMentorRecord.id)
      .eq("is_booked", true)
      .order("start_time", { ascending: true });
    const sessions = (data ?? []) as BookedByMe[];

    // Pull every note this mentor has ever written, keyed by slot, so each
    // completed row can show "Add notes" vs "Edit notes" / the saved text
    // without a separate round trip per row.
    const { data: notesData } = await supabase
      .from("mentor_session_notes")
      .select("*")
      .eq("mentor_id", myMentorRecord.id);
    const notesBySlotId = new Map<string, SessionNote>((notesData ?? []).map((n: any) => [n.slot_id, n]));

    const rows: SessionRow[] = sessions.map((s) => ({
      slot: s,
      title: s.booked_by_profile?.full_name || "A student",
      subtitle: s.booked_by_profile?.email ?? null,
      note: s.student_note,
      meetingLink: myMentorRecord.meeting_link ?? null,
      sessionNote: notesBySlotId.get(s.id) ?? null,
      studentId: s.booked_by,
    }));

    return (
      <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
        <main className="flex-1 max-w-3xl mx-auto px-6 py-8 w-full">
          <h1 className="text-xl font-bold mb-1">Upcoming sessions</h1>
          <p className="text-sm text-slate-400 mb-6">
            Students who&apos;ve booked a slot with you, soonest first. Once a session is marked
            Completed, you can add notes for the student to see anytime.
          </p>
          <SessionsListClient rows={rows} role="mentor" />
        </main>
      </AppShell>
    );
  }

  const { data: myBookingsData } = await supabase
    .from("mentor_slots")
    .select("*, mentors(id, name, photo_path, meeting_link)")
    .eq("booked_by", user.id)
    .order("start_time", { ascending: true });
  const myBookings = (myBookingsData ?? []) as MyBooking[];

  const { data: myNotesData } = await supabase
    .from("mentor_session_notes")
    .select("*")
    .eq("student_id", user.id);
  const myNotesBySlotId = new Map<string, SessionNote>((myNotesData ?? []).map((n: any) => [n.slot_id, n]));

  const rows: SessionRow[] = myBookings.map((b) => ({
    slot: b,
    title: b.mentors?.name ?? "Mentor",
    photoUrl: mentorPhotoUrl(b.mentors?.photo_path ?? null, SUPABASE_URL),
    meetingLink: b.mentors?.meeting_link ?? null,
    rescheduleMentorId: b.mentors?.id ?? null,
    sessionNote: myNotesBySlotId.get(b.id) ?? null,
  }));

  return (
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8 w-full">
        <h1 className="text-xl font-bold mb-1">Upcoming sessions</h1>
        <p className="text-sm text-slate-400 mb-6">
          Every mentorship session you&apos;ve booked, soonest first. Your mentor&apos;s notes from
          completed sessions show up there too.
        </p>
        <SessionsListClient rows={rows} role="student" />
      </main>
    </AppShell>
  );
}

