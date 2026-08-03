import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { Mentor, MentorSlot } from "@/lib/mentors";
import { findMentorByEmail, getSlotStatus } from "@/lib/mentors";
import { getContentPublished } from "@/lib/platformSettings";
import type { PlannerEntry } from "@/lib/plannerColumns";
import type { UWorldBlock } from "@/lib/uworldBlocks";
import type { PlanTask } from "@/lib/planTasks";
import { sortTasks } from "@/lib/planTasks";
import type { MentorDailyNote } from "@/lib/mentorDailyNotes";
import type { ScoreReport } from "@/lib/scoreReports";
import { computeImmediateExamReview, computeSystemStrengths } from "@/lib/scoreReports";
import { computeWeeklyProgress } from "@/lib/weeklyProgress";
import { computeTodayStatus } from "@/lib/plannerStatus";
import { computeStreaks } from "@/lib/streaks";
import {
  computeAiReminder,
  computeRecentActivity,
  latestNoteWithContent,
  nextUpcomingCheckin,
} from "@/lib/homeInsights";
import AppShell from "@/components/AppShell";
import PlannerStatusHeader from "@/components/PlannerStatusHeader";
import WeeklyProgress from "@/components/WeeklyProgress";
import MarkDayCompleteButton from "@/components/MarkDayCompleteButton";
import {
  TodaysPlanCard,
  LatestAnalysisCard,
  UpcomingMentorshipCard,
  MentorNoteCard,
  AiReminderCard,
  QuickActionsCard,
  StudyStreakCard,
  NextMilestoneCard,
  RecentActivityCard,
} from "@/components/HomeDashboardCards";

export const dynamic = "force-dynamic";

function isoAddDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

type Booking = MentorSlot & {
  mentors: Pick<Mentor, "id" | "name" | "photo_path" | "meeting_link"> | null;
};

/**
 * Home dashboard - answers "what do I need to do today?" instead of just
 * linking off to Study Planner / Analysis (the old bare version, still in
 * DashboardClient.tsx but no longer used from here - safe to leave in place
 * unused). Every card is built from data that already exists elsewhere in
 * the app (planner_entries, mentor_plan_tasks, mentor_daily_notes,
 * score_reports, mentor_slots) - nothing new to fill in, no new tables
 * except this page's own derived reads. See lib/streaks.ts and
 * lib/homeInsights.ts for the two genuinely new pieces of logic (streak
 * counting and the small rule-based reminder/status/activity helpers).
 */
export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const profile = profileData as Profile | null;

  // Same mentor bypass as onboarding - a mentor landing on /dashboard
  // (e.g. an old bookmark) should end up on their availability page, not
  // the student onboarding wizard or this student dashboard.
  const { data: mentorRows } = await supabase.from("mentors").select("*").eq("active", true);
  const mentors = (mentorRows ?? []) as Mentor[];
  if (findMentorByEmail(mentors, user.email)) {
    redirect("/mentorship");
  }

  if (!profile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const contentPublished = profile.is_admin ? true : await getContentPublished(supabase);

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = isoAddDays(today, -1);

  const [entriesRes, blocksRes, planTasksRes, dailyNotesRes, scoreReportsRes, bookingsRes] = await Promise.all([
    supabase.from("planner_entries").select("*").eq("user_id", user.id),
    supabase.from("uworld_blocks").select("*").eq("user_id", user.id),
    supabase.from("mentor_plan_tasks").select("*").eq("student_id", user.id),
    supabase.from("mentor_daily_notes").select("*").eq("student_id", user.id),
    supabase.from("score_reports").select("*").eq("user_id", user.id).order("taken_date", { ascending: false }),
    supabase
      .from("mentor_slots")
      .select("*, mentors(id, name, photo_path, meeting_link)")
      .eq("booked_by", user.id),
  ]);

  const entries = (entriesRes.data ?? []) as PlannerEntry[];
  const blocks = (blocksRes.data ?? []) as UWorldBlock[];
  const planTasks = (planTasksRes.data ?? []) as PlanTask[];
  const dailyNotes = (dailyNotesRes.data ?? []) as MentorDailyNote[];
  const scoreReports = (scoreReportsRes.data ?? []) as ScoreReport[];
  const bookings = (bookingsRes.data ?? []) as Booking[];

  const todaysEntry = entries.find((e) => e.log_date === today);
  const yesterdayEntry = entries.find((e) => e.log_date === yesterday);
  const yesterdayBlocks = blocks.filter((b) => b.log_date === yesterday);
  const todaysTasks = sortTasks(planTasks.filter((t) => t.task_date === today));

  const weeklySummary = computeWeeklyProgress(entries, blocks, planTasks, today);
  const todayStatus = computeTodayStatus(entries, blocks, planTasks, today);
  const streaks = computeStreaks(
    [...entries.map((e) => e.log_date), ...blocks.map((b) => b.log_date)],
    today
  );

  const examReview = computeImmediateExamReview(scoreReports);
  const regularReports = scoreReports.filter((r) => r.exam_type !== "question_level");
  const strengths = computeSystemStrengths(regularReports);
  const weakest = strengths[0] ?? null;
  const strongest = strengths.length > 0 ? strengths[strengths.length - 1] : null;

  const nonCancelledBookings = bookings.filter((b) => !b.cancelled_at);
  const upcomingBookings = nonCancelledBookings
    .filter((b) => getSlotStatus(b) === "upcoming")
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const nextBooking = upcomingBookings[0] ?? null;
  const mostRecentBooking = [...nonCancelledBookings].sort((a, b) => b.start_time.localeCompare(a.start_time))[0] ?? null;

  const mentorFromEmail = findMentorByEmail(mentors, profile.mentor_email);
  const currentMentorName = mentorFromEmail?.name ?? nextBooking?.mentors?.name ?? mostRecentBooking?.mentors?.name ?? null;

  const latestNote = latestNoteWithContent(dailyNotes);
  const noteMentorName = latestNote
    ? mentors.find((m) => m.id === latestNote.mentor_id)?.name ?? currentMentorName
    : null;
  const nextCheckin = nextUpcomingCheckin(dailyNotes, today);

  const reminderMessage = computeAiReminder({ todayStatus, weekly: weeklySummary, yesterdayEntry, yesterdayBlocks });

  const questionsCompletedYesterday =
    yesterdayBlocks.length > 0
      ? yesterdayBlocks.reduce((sum, b) => sum + (b.questions ?? 0), 0)
      : Number(yesterdayEntry?.field_values?.["q_solved"] ?? 0) || 0;
  const scoreReportUploadedYesterday = scoreReports.some((r) => (r.created_at ?? "").slice(0, 10) === yesterday);
  const mentorReviewedYesterday = dailyNotes.some((n) => (n.reviewed_at ?? "").slice(0, 10) === yesterday);
  const newAssignmentYesterday = planTasks.some((t) => (t.created_at ?? "").slice(0, 10) === yesterday);
  const recentActivity = computeRecentActivity({
    questionsCompletedYesterday,
    scoreReportUploadedYesterday,
    mentorReviewedYesterday,
    newAssignmentYesterday,
  });

  const plannedSystemRaw = todaysEntry?.field_values?.["planned_system"];
  const plannedSystem = typeof plannedSystemRaw === "string" && plannedSystemRaw.trim() ? plannedSystemRaw : null;

  return (
    <AppShell isAdmin={profile.is_admin} userName={profile.full_name} contentPublished={contentPublished}>
      <main className="flex-1 px-6 py-8 space-y-6 w-full">
        <TodaysPlanCard
          plannedSystem={plannedSystem}
          tasks={todaysTasks}
          markCompleteSlot={
            <MarkDayCompleteButton
              userId={user.id}
              todayIso={today}
              existingFieldValues={todaysEntry?.field_values ?? {}}
              alreadyComplete={todayStatus.studyCompleted}
            />
          }
        />

        <PlannerStatusHeader status={todayStatus} />

        <div className="grid sm:grid-cols-2 gap-4">
          <UpcomingMentorshipCard
            booking={
              nextBooking
                ? {
                    startTime: nextBooking.start_time,
                    endTime: nextBooking.end_time,
                    mentorName: nextBooking.mentors?.name ?? "Your mentor",
                    meetingLink: nextBooking.mentors?.meeting_link ?? null,
                  }
                : null
            }
          />
          <MentorNoteCard note={latestNote} mentorName={noteMentorName} />
        </div>

        <LatestAnalysisCard review={examReview} weakest={weakest} strongest={strongest} />

        <AiReminderCard message={reminderMessage} />

        <WeeklyProgress summary={weeklySummary} />

        <QuickActionsCard />

        <div className="grid sm:grid-cols-2 gap-4">
          <StudyStreakCard current={streaks.current} longest={streaks.longest} />
          <NextMilestoneCard nextCheckin={nextCheckin} />
        </div>

        <RecentActivityCard items={recentActivity} />
      </main>
    </AppShell>
  );
}
