import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { Mentor, MentorSlot, SessionNote, SessionFeedback } from "@/lib/mentors";
import { findMentorByEmail, mentorActsAs, mentorPhotoUrl } from "@/lib/mentors";
import { getContentPublished } from "@/lib/platformSettings";
import AppShell from "@/components/AppShell";
import SessionsListClient, { type SessionRow } from "@/components/SessionsListClient";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

type MyBooking = MentorSlot & {
  mentors?: { id: string; name: string; photo_path: string | null; role?: string | null } | null;
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

  // profile and mentors don't depend on each other - firing them together
  // instead of one after another roughly halves the time this page spends
  // just waiting on round trips before it can even figure out which branch
  // (mentor vs student) to take below. This page had been timing out
  // (FUNCTION_INVOCATION_TIMEOUT) even though every individual query here
  // runs in well under a second on its own - with up to 7 queries chained
  // one-after-another, a single slow/flaky round trip anywhere in that
  // chain delayed every query after it too. Running the independent ones
  // concurrently (here and in both branches below) means one slow request
  // no longer has a cascading effect on the rest of the page.
  const [profileRes, mentorsRes] = await Promise.all([
    supabase.from("profiles").select("is_admin, full_name").eq("id", user.id).single(),
    supabase.from("mentors").select("*").eq("active", true),
  ]);
  const profile = profileRes.data as Pick<Profile, "is_admin" | "full_name"> | null;
  const mentors = (mentorsRes.data ?? []) as Mentor[];
  const myMentorRecord = findMentorByEmail(mentors, user.email);
  const contentPublished = profile?.is_admin ? true : await getContentPublished(supabase);

  if (myMentorRecord) {
    // No end_time/is_booked-only cutoff here anymore (that used to hide
    // completed and cancelled sessions entirely) - every booked slot is
    // fetched and SessionsListClient buckets it into Upcoming vs Past based
    // on getSlotStatus(). These four queries are all independent of each
    // other (see comment above), so they run concurrently instead of
    // sequentially.
    const [sessionsRes, notesRes, feedbackRes, linksRes] = await Promise.all([
      supabase
        .from("mentor_slots")
        .select("*, booked_by_profile:booked_by(full_name, email)")
        .eq("mentor_id", myMentorRecord.id)
        .eq("is_booked", true)
        .order("start_time", { ascending: true }),
      // Every note this mentor has ever written, keyed by slot, so each
      // completed row can show "Add notes" vs "Edit notes" / the saved text
      // without a separate round trip per row.
      supabase.from("mentor_session_notes").select("*").eq("mentor_id", myMentorRecord.id),
      // Every rating this mentor has ever received, keyed by slot, so a
      // completed row can show "View student feedback" without a per-row
      // round trip. Mentors can only ever read these (RLS: "Mentor views
      // own session feedback") - never write them.
      supabase.from("mentor_session_feedback").select("*").eq("mentor_id", myMentorRecord.id),
      // Every meeting link this mentor has set, keyed by student - different
      // students can have different permanent links (mentor_meeting_links),
      // so this is never a single value shared across every row below.
      supabase.from("mentor_meeting_links").select("student_id, meeting_link").eq("mentor_id", myMentorRecord.id),
    ]);
    const sessions = (sessionsRes.data ?? []) as BookedByMe[];
    const notesBySlotId = new Map<string, SessionNote>((notesRes.data ?? []).map((n: any) => [n.slot_id, n]));
    const feedbackBySlotId = new Map<string, SessionFeedback>(
      (feedbackRes.data ?? []).map((f: any) => [f.slot_id, f])
    );
    const meetingLinkByStudent = new Map<string, string>(
      (linksRes.data ?? []).map((l: any) => [l.student_id, l.meeting_link])
    );

    const rows: SessionRow[] = sessions.map((s) => ({
      slot: s,
      title: s.booked_by_profile?.full_name || "A student",
      subtitle: s.booked_by_profile?.email ?? null,
      note: s.student_note,
      meetingLink: (s.booked_by && meetingLinkByStudent.get(s.booked_by)) ?? null,
      sessionNote: notesBySlotId.get(s.id) ?? null,
      studentId: s.booked_by,
      feedback: feedbackBySlotId.get(s.id) ?? null,
    }));

    return (
      <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
        <main className="flex-1 px-6 py-8 w-full">
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

  // Same fix as the mentor branch above - these four queries are all
  // independent (each scoped to this student's own id), so they run
  // concurrently instead of one after another.
  const [myBookingsRes, myMeetingLinkRes, myNotesRes, myFeedbackRes] = await Promise.all([
    supabase
      .from("mentor_slots")
      .select("*, mentors(id, name, photo_path, role)")
      .eq("booked_by", user.id)
      .order("start_time", { ascending: true }),
    // This student's own permanent meeting link (mentor_meeting_links) - the
    // table only ever holds one row total per student, so if this student
    // switched mentors, this row may still carry the OLD mentor's mentor_id
    // until their new mentor sets a fresh one. Selecting mentor_id too (not
    // just meeting_link) so each row below only shows it when it actually
    // matches that row's own mentor - never applied blindly to every row.
    supabase.from("mentor_meeting_links").select("mentor_id, meeting_link").eq("student_id", user.id).maybeSingle(),
    supabase.from("mentor_session_notes").select("*").eq("student_id", user.id),
    supabase.from("mentor_session_feedback").select("*").eq("student_id", user.id),
  ]);

  // Mentorship's own Upcoming Sessions only ever shows Mentor/Both bookings
  // - a booking with a pure Tutor (role === "tutor") shows up on the
  // separate /tutoring page instead, even though it's the exact same
  // mentor_slots row under the hood. A booking made before this role field
  // existed has role undefined, which mentorActsAs treats as "mentor".
  const myBookings = ((myBookingsRes.data ?? []) as MyBooking[]).filter((b) =>
    mentorActsAs({ role: (b.mentors?.role as any) ?? "mentor" }, "mentor")
  );
  const myMeetingLinkRow = myMeetingLinkRes.data as { mentor_id: string; meeting_link: string } | null;
  const myNotesBySlotId = new Map<string, SessionNote>((myNotesRes.data ?? []).map((n: any) => [n.slot_id, n]));
  const myFeedbackBySlotId = new Map<string, SessionFeedback>(
    (myFeedbackRes.data ?? []).map((f: any) => [f.slot_id, f])
  );

  const rows: SessionRow[] = myBookings.map((b) => ({
    slot: b,
    title: b.mentors?.name ?? "Mentor",
    photoUrl: mentorPhotoUrl(b.mentors?.photo_path ?? null, SUPABASE_URL),
    meetingLink: myMeetingLinkRow && b.mentors?.id === myMeetingLinkRow.mentor_id ? myMeetingLinkRow.meeting_link : null,
    rescheduleMentorId: b.mentors?.id ?? null,
    sessionNote: myNotesBySlotId.get(b.id) ?? null,
    feedback: myFeedbackBySlotId.get(b.id) ?? null,
  }));

  return (
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 px-6 py-8 w-full">
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
