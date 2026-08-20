import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { Mentor, MentorSlot, SessionNote, SessionFeedback } from "@/lib/mentors";
import {
  averageRating,
  findMentorByEmail,
  formatSlotDate,
  formatSlotTime,
  getSlotStatus,
  groupSlotsByDate,
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
 * Tutoring home. Three possible views depending on who's signed in:
 *   - A pure mentor (role "mentor", no tutor duties) -> redirected to
 *     /mentorship. Tutoring has nothing for them.
 *   - A tutor or mentor+tutor (role "tutor"/"both") -> a dashboard here,
 *     mirroring the mentor dashboard on /mentorship (stats, today, this
 *     week, students, feedback). Note: since a "both" person only has ONE
 *     mentors row and ONE set of slots (mentor_slots isn't split by
 *     mentor-vs-tutor per booking), this shows the exact same underlying
 *     sessions as their /mentorship dashboard - there's no per-session
 *     mentor/tutor tag in the data model, only a per-person role tag.
 *   - A student (no mentors row at all) -> directory of tutors + their own
 *     upcoming tutoring bookings, same as before.
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

  // Pure mentor (not also a tutor) - nothing for them here, send them back
  // to their one real dashboard.
  if (myMentorRecord && !mentorActsAs(myMentorRecord, "tutor")) {
    redirect("/mentorship");
  }

  if (myMentorRecord) {
    // Tutor (or mentor+tutor) dashboard - same shape as the mentor
    // dashboard on /mentorship, scoped to this same mentors row (see
    // header comment: there's only one set of slots per person).
    const { data: slotsData } = await supabase
      .from("mentor_slots")
      .select("*, booked_by_profile:booked_by(full_name, email)")
      .eq("mentor_id", myMentorRecord.id)
      .order("start_time", { ascending: true });
    const allSlots = (slotsData ?? []) as (MentorSlot & {
      booked_by_profile?: { full_name: string | null; email: string | null } | null;
    })[];
    const bookedSlots = allSlots.filter((s) => s.is_booked);

    const { data: notesData } = await supabase
      .from("mentor_session_notes")
      .select("slot_id")
      .eq("mentor_id", myMentorRecord.id);
    const slotIdsWithNotes = new Set((notesData ?? []).map((n: any) => n.slot_id as string));

    const { data: feedbackData } = await supabase
      .from("mentor_session_feedback")
      .select("*")
      .eq("mentor_id", myMentorRecord.id)
      .order("created_at", { ascending: false });
    const feedback = (feedbackData ?? []) as SessionFeedback[];
    const avgRating = averageRating(feedback);

    const { data: linkedStudentsData } = await supabase
      .from("profiles")
      .select("id, full_name, email, status_update, status_updated_at")
      .not("mentor_email", "is", null)
      .order("full_name", { ascending: true });
    const linkedStudents = (linkedStudentsData ?? []) as Pick<
      Profile,
      "id" | "full_name" | "email" | "status_update" | "status_updated_at"
    >[];

    const todayLabel = formatSlotDate(new Date().toISOString());
    const nonCancelled = bookedSlots.filter((s) => !s.cancelled_at);
    const todaysSessions = nonCancelled.filter((s) => formatSlotDate(s.start_time) === todayLabel);
    const upcoming = nonCancelled.filter((s) => getSlotStatus(s) === "upcoming" && formatSlotDate(s.start_time) !== todayLabel);
    const completed = nonCancelled.filter((s) => getSlotStatus(s) === "completed");
    const needsNotes = completed.filter((s) => !slotIdsWithNotes.has(s.id));
    const helpedCount = new Set(bookedSlots.map((s) => s.booked_by).filter(Boolean)).size;
    const openUpcomingCount = allSlots.filter((s) => !s.is_booked && getSlotStatus(s) === "upcoming").length;

    const weekOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const thisWeek = upcoming.filter((s) => s.start_time < weekOut);
    const thisWeekByDate = groupSlotsByDate(thisWeek);

    function studentName(s: MentorSlot & { booked_by_profile?: { full_name: string | null; email: string | null } | null }) {
      return s.booked_by_profile?.full_name || s.booked_by_profile?.email || "A student";
    }

    return (
      <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
        <main className="flex-1 px-6 py-8 w-full">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-xl font-bold mb-1">Your tutoring dashboard</h1>
              <p className="text-sm text-slate-400">Everything about your tutoring, at a glance.</p>
            </div>
            <a href="/mentorship/availability" className="btn-secondary text-xs shrink-0">
              Manage availability &amp; profile
            </a>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <div className="card py-3 text-center">
              <p className="text-2xl font-bold text-brand-300">{helpedCount}</p>
              <p className="text-xs text-slate-500">Students helped</p>
            </div>
            <div className="card py-3 text-center">
              <p className="text-2xl font-bold text-brand-300">{avgRating != null ? `${avgRating}★` : "—"}</p>
              <p className="text-xs text-slate-500">Avg rating ({feedback.length})</p>
            </div>
            <div className="card py-3 text-center">
              <p className="text-2xl font-bold text-brand-300">
                {nonCancelled.filter((s) => getSlotStatus(s) === "upcoming").length}
              </p>
              <p className="text-xs text-slate-500">Upcoming sessions</p>
            </div>
            <div className="card py-3 text-center">
              <p className="text-2xl font-bold text-brand-300">{openUpcomingCount}</p>
              <p className="text-xs text-slate-500">Open slots</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-lg font-bold mb-3">My students</h2>
            {linkedStudents.length === 0 ? (
              <p className="text-sm text-slate-500">
                No students have linked your email yet - once a student adds your email under their
                Settings, they&apos;ll show up here.
              </p>
            ) : (
              <div className="space-y-2">
                {linkedStudents.map((s) => (
                  <div key={s.id} className="card py-2.5 flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p>
                        <span className="font-semibold">{s.full_name || "A student"}</span>{" "}
                        <span className="text-slate-500">&middot; {s.email}</span>
                      </p>
                      {s.status_update && (
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                          &ldquo;{s.status_update}&rdquo;
                        </p>
                      )}
                    </div>
                    <a
                      href={`/mentorship/student/${s.id}`}
                      className="text-xs text-brand-400 hover:text-brand-300 shrink-0"
                    >
                      Open planner →
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          {needsNotes.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-bold mb-3">Needs attention</h2>
              <div className="space-y-2">
                {needsNotes.map((s) => (
                  <div key={s.id} className="card py-2.5 flex items-center justify-between text-sm">
                    <span>
                      Add notes for <span className="font-semibold">{studentName(s)}</span> -{" "}
                      {formatSlotDate(s.start_time)}
                    </span>
                    <a href="/mentorship/sessions" className="text-xs text-brand-400 hover:text-brand-300 shrink-0">
                      Add notes →
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mb-8">
            <h2 className="text-lg font-bold mb-3">Today</h2>
            {todaysSessions.length === 0 ? (
              <p className="text-sm text-slate-500">No sessions today.</p>
            ) : (
              <div className="space-y-2">
                {todaysSessions.map((s) => (
                  <div key={s.id} className="card py-2.5 flex items-center justify-between text-sm">
                    <div>
                      <span className="font-semibold">{studentName(s)}</span>{" "}
                      <span className="text-slate-500">
                        &middot; {formatSlotTime(s.start_time)}–{formatSlotTime(s.end_time)}
                      </span>
                    </div>
                    {s.booked_by && (
                      <a href={`/mentorship/student/${s.booked_by}`} className="text-xs text-brand-400 hover:text-brand-300 shrink-0">
                        View progress →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mb-8">
            <h2 className="text-lg font-bold mb-3">This week</h2>
            {thisWeekByDate.length === 0 ? (
              <p className="text-sm text-slate-500">No other sessions in the next 7 days.</p>
            ) : (
              <div className="space-y-4">
                {thisWeekByDate.map((group) => (
                  <div key={group.date}>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{group.date}</p>
                    <div className="space-y-2">
                      {group.slots.map((s) => (
                        <div key={s.id} className="card py-2.5 flex items-center justify-between text-sm">
                          <div>
                            <span className="font-semibold">{studentName(s)}</span>{" "}
                            <span className="text-slate-500">
                              &middot; {formatSlotTime(s.start_time)}–{formatSlotTime(s.end_time)}
                            </span>
                          </div>
                          {s.booked_by && (
                            <a href={`/mentorship/student/${s.booked_by}`} className="text-xs text-brand-400 hover:text-brand-300 shrink-0">
                              View progress →
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-lg font-bold mb-3">Recent feedback</h2>
            {feedback.length === 0 ? (
              <p className="text-sm text-slate-500">No feedback yet.</p>
            ) : (
              <div className="space-y-2">
                {feedback.slice(0, 5).map((f) => (
                  <div key={f.id} className="card py-2.5 text-sm">
                    <p>
                      {"★".repeat(f.rating)}
                      {"☆".repeat(5 - f.rating)}
                      {f.helpful != null && (
                        <span className="text-slate-500"> &middot; Would recommend: {f.helpful ? "Yes" : "No"}</span>
                      )}
                    </p>
                    {f.comment && <p className="text-slate-400 mt-1 italic">&ldquo;{f.comment}&rdquo;</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </AppShell>
    );
  }

  // Student view - directory of tutors + this student's own upcoming
  // tutoring bookings.
  const tutorsForDirectory = mentors.filter((m) => mentorActsAs(m, "tutor"));

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
