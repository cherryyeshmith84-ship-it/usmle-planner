import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { Mentor, MentorSlot, SessionNote, SessionFeedback } from "@/lib/mentors";
import { findMentorByEmail, mentorPhotoUrl } from "@/lib/mentors";
import { getContentPublished } from "@/lib/platformSettings";
import AppShell from "@/components/AppShell";
import SessionsListClient, { type SessionRow } from "@/components/SessionsListClient";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

type MyBooking = MentorSlot & {
  mentors?: { id: string; name: string; photo_path: string | null } | null;
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

    // Every rating this mentor has ever received, keyed by slot, so a
    // completed row can show "View student feedback" without a per-row
    // round trip. Mentors can only ever read these (RLS: "Mentor views own
    // session feedback") - never write them.
    const { data: feedbackData } = await supabase
      .from("mentor_session_feedback")
      .select("*")
      .eq("mentor_id", myMentorRecord.id);
    const feedbackBySlotId = new Map<string, SessionFeedback>(
      (feedbackData ?? []).map((f: any) => [f.slot_id, f])
    );

    // Every meeting link this mentor has set, keyed by student - different
    // students can have different permanent links (mentor_meeting_links),
    // so this is never a single value shared across every row below.
    const { data: linksData } = await supabase
      .from("mentor_meeting_links")
      .select("student_id, meeting_link")
      .eq("mentor_id", myMentorRecord.id);
    const meetingLinkByStudent = new Map<string, string>(
      (linksData ?? []).map((l: any) => [l.student_id, l.meeting_link])
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

  const { data: myBookingsData } = await supabase
    .from("mentor_slots")
    .select("*, mentors(id, name, photo_path)")
    .eq("booked_by", user.id)
    .order("start_time", { ascending: true });
  const myBookings = (myBookingsData ?? []) as MyBooking[];

  // This student's own permanent meeting link (mentor_meeting_links) - the
  // table only ever holds one row total per student, so if this student
  // switched mentors, this row may still carry the OLD mentor's mentor_id
  // until their new mentor sets a fresh one. Selecting mentor_id too (not
  // just meeting_link) so each row below only shows it when it actually
  // matches that row's own mentor - never applied blindly to every row.
  const { data: myMeetingLinkData } = await supabase
    .from("mentor_meeting_links")
    .select("mentor_id, meeting_link")
    .eq("student_id", user.id)
    .maybeSingle();
  const myMeetingLinkRow = myMeetingLinkData as { mentor_id: string; meeting_link: string } | null;

  const { data: myNotesData } = await supabase
    .from("mentor_session_notes")
    .select("*")
    .eq("student_id", user.id);
  const myNotesBySlotId = new Map<string, SessionNote>((myNotesData ?? []).map((n: any) => [n.slot_id, n]));

  const { data: myFeedbackData } = await supabase
    .from("mentor_session_feedback")
    .select("*")
    .eq("student_id", user.id);
  const myFeedbackBySlotId = new Map<string, SessionFeedback>(
    (myFeedbackData ?? []).map((f: any) => [f.slot_id, f])
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
