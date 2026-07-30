import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { Mentor, MentorSlot, SessionFeedback } from "@/lib/mentors";
import { findMentorByEmail, formatSlotDate, formatSlotTime, getSlotStatus, groupSlotsByDate } from "@/lib/mentors";
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
    .select("is_admin, full_name")
    .eq("id", user.id)
    .single();
  const profile = profileData as Pick<Profile, "is_admin" | "full_name"> | null;

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
    const avgRating =
      feedback.length > 0 ? Math.round((feedback.reduce((s, f) => s + f.rating, 0) / feedback.length) * 10) / 10 : null;

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
        <main className="flex-1 max-w-3xl mx-auto px-6 py-8 w-full">
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
              <p className="text-2xl font-bold text-brand-300">{upcoming.length + todaysSessions.length}</p>
              <p className="text-xs text-slate-500">Upcoming sessions</p>
            </div>
            <div className="card py-3 text-center">
              <p className="text-2xl font-bold text-brand-300">{openUpcomingCount}</p>
              <p className="text-xs text-slate-500">Open slots</p>
            </div>
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
  const now = new Date().toISOString();
  const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const mentorIds = mentors.map((m) => m.id);

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
    const { data: upcomingOpenRows } = await supabase
      .from("mentor_slots")
      .select("mentor_id")
      .in("mentor_id", mentorIds)
      .eq("is_booked", false)
      .gte("end_time", now)
      .lt("start_time", weekFromNow);
    for (const row of (upcomingOpenRows ?? []) as any[]) {
      availableThisWeekMentorIds.add(row.mentor_id);
    }
  }

  const mentorCards = mentors.map((m) => ({
    ...m,
    helpedCount: helpedCountByMentor.get(m.id)?.size ?? 0,
    availableThisWeek: availableThisWeekMentorIds.has(m.id),
  }));

  return (
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 max-w-5xl mx-auto px-6 py-8 w-full">
        <h1 className="text-xl font-bold mb-1">Mentorship</h1>
        <p className="text-sm text-slate-400 mb-6">
          Pick a mentor to view their profile and book a session.
        </p>
        <MentorBrowseClient mentors={mentorCards} />
      </main>
    </AppShell>
  );
}
