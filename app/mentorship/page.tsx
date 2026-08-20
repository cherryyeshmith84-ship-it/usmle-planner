import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { Mentor, MentorSlot, SessionFeedback } from "@/lib/mentors";
import {
  averageRating,
  findMentorByEmail,
  formatSlotDate,
  formatSlotTime,
  getSlotStatus,
  groupSlotsByDate,
  isExistingStudentOf,
  mentorActsAs,
  slotVisibleToStudent,
} from "@/lib/mentors";
import { getContentPublished } from "@/lib/platformSettings";
import AppShell from "@/components/AppShell";
import MentorBrowseClient from "@/components/MentorBrowseClient";

export const dynamic = "force-dynamic";

/**
 * Single "Mentorship" nav destination for everyone - which view renders
 * depends on whether the signed-in user's email matches a mentors row:
 *   - Matches -> a dashboard: today's sessions, this week's schedule, quick
 *     stats, recent feedback, and anything needing attention (completed
 *     sessions still missing notes). Day-to-day slot management moved to
 *     its own page (/mentorship/availability) - see that file's header
 *     comment for why.
 *   - Doesn't match (students, admin) -> MentorBrowseClient (directory +
 *     booking + "my upcoming sessions").
 * A mentor never needs a separate account type/invite flow - they just
 * sign up at the normal /signup page with the email the admin entered for
 * them in /admin/mentors.
 */
export default async function MentorshipPage() {
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

  if (myMentorRecord) {
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

    // Students who linked this mentor's email directly (Settings/onboarding
    // "Your mentor's email" field) - RLS ("Mentors can view profiles of
    // students who linked their email") already restricts this to exactly
    // this mentor's matches, so no client-side filtering needed. This is a
    // separate roster from bookedSlots above: a student can appear here
    // with zero sessions booked yet and the mentor can still open their
    // planner immediately.
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

    // "This week" (calendar-style, day by day) - the next 7 days of upcoming
    // sessions, grouped by date via groupSlotsByDate. Today's own sessions
    // already get their own section above, so they're excluded here.
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
              <h1 className="text-xl font-bold mb-1">Your mentor dashboard</h1>
              <p className="text-sm text-slate-400">Everything about your mentorship, at a glance.</p>
            </div>
            <a href="/mentorship/availability" className="btn-secondary text-xs shrink-0">
              Manage availability &amp; profile
            </a>
          </div>

          {/* Quick stats */}
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
              {/* Was upcoming.length + todaysSessions.length - todaysSessions
                  only checks the CALENDAR DATE, not whether the session has
                  actually happened yet, so a session earlier today that
                  already ended still counted here even though it correctly
                  drops out of the Upcoming Sessions page's Upcoming bucket
                  (which filters on getSlotStatus === "upcoming"). Counting
                  the same way here keeps this number and that page in
                  agreement. */}
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

          {/* My Students - directly linked via mentor email, not tied to a
              booked session. Their planner (and everything else on
              /mentorship/student/[id]) is reachable immediately. */}
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

          {/* Needs attention */}
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

          {/* Today */}
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

          {/* This week (calendar) */}
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

          {/* Recent feedback */}
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

  // Not a mentor - browse the directory. Compute two per-mentor summary
  // stats up front with two batch queries (rather than one query per
  // mentor): how many distinct students each mentor has already had a
  // completed session with ("helped X students"), and whether each mentor
  // has at least one open slot in the next 7 days ("Available this week").
  // Mentorship's directory only ever shows Mentor/Both rows - a pure Tutor
  // (role === "tutor") belongs on the separate /tutoring directory instead,
  // even though they're stored in this same mentors table.
  const mentorsForDirectory = mentors.filter((m) => mentorActsAs(m, "mentor"));

  const now = new Date().toISOString();
  const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const mentorIds = mentorsForDirectory.map((m) => m.id);

  const helpedCountByMentor = new Map<string, Set<string>>();
  if (mentorIds.length > 0) {
    const { data: pastBookedRows } = await supabase
      .from("mentor_slots")
      .select("mentor_id, booked_by")
      .in("mentor_id", mentorIds)
      .eq("is_booked", true)
      .lt("end_time", now);
    for (const row of (pastBookedRows ?? []) as any[]) {
      if (!row.booked_by) continue;
      const set = helpedCountByMentor.get(row.mentor_id) ?? new Set<string>();
      set.add(row.booked_by);
      helpedCountByMentor.set(row.mentor_id, set);
    }
  }

  const availableThisWeekMentorIds = new Set<string>();
  if (mentorIds.length > 0) {
    // audience is included (and checked below via slotVisibleToStudent) so
    // this badge agrees with the per-mentor profile page - a slot reserved
    // for a mentor's existing students shouldn't make that mentor show
    // "Available this week" to a student who isn't linked to them yet (and
    // vice versa for "new students only" slots), since they'd land on the
    // profile page and find nothing bookable. isExistingStudentOf is
    // per-mentor (the same viewer can be an existing student of one mentor
    // and a stranger to another), so this has to be checked per-row, not
    // once for the whole batch.
    const { data: upcomingOpenRows } = await supabase
      .from("mentor_slots")
      .select("mentor_id, audience")
      .in("mentor_id", mentorIds)
      .eq("is_booked", false)
      .gte("end_time", now)
      .lt("start_time", weekFromNow);
    for (const row of (upcomingOpenRows ?? []) as any[]) {
      const rowMentor = mentorsForDirectory.find((m) => m.id === row.mentor_id);
      if (!rowMentor) continue;
      const viewerIsExisting = isExistingStudentOf(profile?.mentor_email, rowMentor.email);
      if (slotVisibleToStudent(row, viewerIsExisting)) {
        availableThisWeekMentorIds.add(row.mentor_id);
      }
    }
  }

  // One batch query for every mentor's ratings, rather than N+1 - same
  // pattern as helpedCountByMentor/availableThisWeekMentorIds above. Needs
  // the "Authenticated can view mentor feedback" RLS policy (see migration
  // mentor_feedback_public_read_for_profiles) since feedback used to be
  // readable only by the mentor themselves or the student who wrote it.
  const ratingsByMentor = new Map<string, number[]>();
  if (mentorIds.length > 0) {
    const { data: feedbackRows } = await supabase
      .from("mentor_session_feedback")
      .select("mentor_id, rating")
      .in("mentor_id", mentorIds);
    for (const row of (feedbackRows ?? []) as any[]) {
      const arr = ratingsByMentor.get(row.mentor_id) ?? [];
      arr.push(row.rating);
      ratingsByMentor.set(row.mentor_id, arr);
    }
  }

  const mentorCards = mentorsForDirectory.map((m) => {
    const ratings = ratingsByMentor.get(m.id) ?? [];
    return {
      ...m,
      helpedCount: helpedCountByMentor.get(m.id)?.size ?? 0,
      availableThisWeek: availableThisWeekMentorIds.has(m.id),
      avgRating: averageRating(ratings.map((rating) => ({ rating }))),
      ratingCount: ratings.length,
    };
  });

  return (
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 px-6 py-8 w-full">
        <h1 className="text-xl font-bold mb-1">Mentorship</h1>
        <p className="text-sm text-slate-400 mb-6">
          Pick a mentor to view their profile and book a session.
        </p>
        <MentorBrowseClient mentors={mentorCards} />
      </main>
    </AppShell>
  );
}
