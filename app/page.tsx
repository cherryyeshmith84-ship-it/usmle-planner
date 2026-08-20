import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { Mentor, MentorSlot, SessionNote, SessionFeedback } from "@/lib/mentors";
import {
  averageRating,
  findMentorByEmail,
  isExistingStudentOf,
  mentorActsAs,
  mentorPhotoUrl,
  slotVisibleToStudent,
} from "@/lib/mentors";
import { getContentPublished } from "@/lib/platformSettings";
import AppShell from "@/components/AppShell";
import MentorBrowseClient from "@/components/MentorBrowseClient";
import SessionsListClient, { type SessionRow } from "@/components/SessionsListClient";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

type MyBooking = MentorSlot & {
  mentors?: { id: string; name: string; photo_path: string | null; role?: string | null } | null;
};

/**
 * Student-facing Tutoring home - same booking engine as Mentorship
 * (mentor_slots, notes, feedback, join tracking, all of it shared), just
 * scoped to mentors rows tagged role tutor/both instead of mentor/both
 * (see lib/mentors.ts's mentorActsAs). Shows the student's upcoming
 * tutoring sessions right on this page - not tucked behind a separate
 * link the way Mentorship's Upcoming Sessions is - plus a directory of
 * tutors to book below.
 *
 * A signed-in mentor/tutor never sees a page here - they manage everything
 * (including their tutoring students) through their one existing dashboard
 * at /mentorship, so this redirects them there instead of duplicating it.
 */
export default async function TutoringPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("is_admin, full_name, mentor_email")
    .eq("id", user.id)
    .single();
  const profile = profileData as Pick<Profile, "is_admin" | "full_name" | "mentor_email"> | null;
  const contentPublished = profile?.is_admin ? true : await getContentPublished(supabase);

  const { data: mentorsData } = await supabase
    .from("mentors")
    .select("*")
    .eq("active", true)
    .order("name", { ascending: true });
  const mentors = (mentorsData ?? []) as Mentor[];

  const myMentorRecord = findMentorByEmail(mentors, user.email);
  if (myMentorRecord) redirect("/mentorship");

  const tutorsForDirectory = mentors.filter((m) => mentorActsAs(m, "tutor"));

  // My upcoming (and past) tutoring sessions - same shape/query as
  // Mentorship's Upcoming Sessions page, just filtered to tutor/both rows
  // instead of mentor/both, so a booking never shows up on both pages.
  const { data: myBookingsData } = await supabase
    .from("mentor_slots")
    .select("*, mentors(id, name, photo_path, role)")
    .eq("booked_by", user.id)
    .order("start_time", { ascending: true });
  const myBookings = ((myBookingsData ?? []) as MyBooking[]).filter((b) =>
    mentorActsAs({ role: (b.mentors?.role as any) ?? "mentor" }, "tutor")
  );

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

  const sessionRows: SessionRow[] = myBookings.map((b) => ({
    slot: b,
    title: b.mentors?.name ?? "Tutor",
    photoUrl: mentorPhotoUrl(b.mentors?.photo_path ?? null, SUPABASE_URL),
    meetingLink:
      myMeetingLinkRow && b.mentors?.id === myMeetingLinkRow.mentor_id ? myMeetingLinkRow.meeting_link : null,
    rescheduleMentorId: b.mentors?.id ?? null,
    sessionNote: myNotesBySlotId.get(b.id) ?? null,
    feedback: myFeedbackBySlotId.get(b.id) ?? null,
  }));

  // Same per-tutor summary stats as Mentorship's own directory (helped
  // count, available this week, ratings) - scoped to tutorsForDirectory
  // instead. See app/mentorship/page.tsx for the mentor-side version this
  // mirrors.
  const now = new Date().toISOString();
  const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const tutorIds = tutorsForDirectory.map((m) => m.id);

  const helpedCountByTutor = new Map<string, Set<string>>();
  if (tutorIds.length > 0) {
    const { data: pastBookedRows } = await supabase
      .from("mentor_slots")
      .select("mentor_id, booked_by")
      .in("mentor_id", tutorIds)
      .eq("is_booked", true)
      .lt("end_time", now);
    for (const row of (pastBookedRows ?? []) as any[]) {
      if (!row.booked_by) continue;
      const set = helpedCountByTutor.get(row.mentor_id) ?? new Set<string>();
      set.add(row.booked_by);
      helpedCountByTutor.set(row.mentor_id, set);
    }
  }

  const availableThisWeekTutorIds = new Set<string>();
  if (tutorIds.length > 0) {
    const { data: upcomingOpenRows } = await supabase
      .from("mentor_slots")
      .select("mentor_id, audience")
      .in("mentor_id", tutorIds)
      .eq("is_booked", false)
      .gte("end_time", now)
      .lt("start_time", weekFromNow);
    for (const row of (upcomingOpenRows ?? []) as any[]) {
      const rowTutor = tutorsForDirectory.find((m) => m.id === row.mentor_id);
      if (!rowTutor) continue;
      const viewerIsExisting = isExistingStudentOf(profile?.mentor_email, rowTutor.email);
      if (slotVisibleToStudent(row, viewerIsExisting)) {
        availableThisWeekTutorIds.add(row.mentor_id);
      }
    }
  }

  const ratingsByTutor = new Map<string, number[]>();
  if (tutorIds.length > 0) {
    const { data: feedbackRows } = await supabase
      .from("mentor_session_feedback")
      .select("mentor_id, rating")
      .in("mentor_id", tutorIds);
    for (const row of (feedbackRows ?? []) as any[]) {
      const arr = ratingsByTutor.get(row.mentor_id) ?? [];
      arr.push(row.rating);
      ratingsByTutor.set(row.mentor_id, arr);
    }
  }

  const tutorCards = tutorsForDirectory.map((m) => {
    const ratings = ratingsByTutor.get(m.id) ?? [];
    return {
      ...m,
      helpedCount: helpedCountByTutor.get(m.id)?.size ?? 0,
      availableThisWeek: availableThisWeekTutorIds.has(m.id),
      avgRating: averageRating(ratings.map((rating) => ({ rating }))),
      ratingCount: ratings.length,
    };
  });

  return (
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 px-6 py-8 w-full">
        <h1 className="text-xl font-bold mb-1">Tutoring</h1>
        <p className="text-sm text-slate-400 mb-6">
          Your upcoming tutoring sessions, plus a directory of tutors you can book.
        </p>

        {sessionRows.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-bold mb-3">Your tutoring sessions</h2>
            <SessionsListClient rows={sessionRows} role="student" />
          </div>
        )}

        <h2 className="text-lg font-bold mb-3">Find a tutor</h2>
        <MentorBrowseClient mentors={tutorCards} emptyLabel="No tutors are listed yet." showSessionsLink={false} />
      </main>
    </AppShell>
  );
}
