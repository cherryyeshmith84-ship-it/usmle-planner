import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { Mentor, MentorSlot } from "@/lib/mentors";
import { findMentorByEmail, getSlotStatus } from "@/lib/mentors";
import { getContentPublished } from "@/lib/platformSettings";
import type { PlannerEntry } from "@/lib/plannerColumns";
import type { UWorldBlock } from "@/lib/uworldBlocks";
import type { PlanTask } from "@/lib/planTasks";
import { computeTaskProgress, groupTasksByDate, sortTasks } from "@/lib/planTasks";
import type { MentorDailyNote } from "@/lib/mentorDailyNotes";
import type { ScoreReport } from "@/lib/scoreReports";
import { computeImmediateExamReview, computeSystemStrengths } from "@/lib/scoreReports";
import { computeWeeklyProgress } from "@/lib/weeklyProgress";
import { computeTodayStatus } from "@/lib/plannerStatus";
import { computeStreaks } from "@/lib/streaks";
import { computeSchedulePaceDays, computeDayStatus } from "@/lib/plannerCalendar";
import { computeCatchUpPlan, computeMoveAheadSuggestion, computeSkippedCategories } from "@/lib/adaptivePlanner";
import { easternDateStringNow, timeOfDayGreeting } from "@/lib/timezone";
import {
  computeAiReminder,
  computeRecentActivity,
  computeMotivationMessage,
  latestNoteWithContent,
  nextUpcomingCheckin,
} from "@/lib/homeInsights";
import AppShell from "@/components/AppShell";
import StatusUpdateCard from "@/components/StatusUpdateCard";
import PlannerStatusHeader from "@/components/PlannerStatusHeader";
import WeeklyProgress from "@/components/WeeklyProgress";
import MarkDayCompleteButton from "@/components/MarkDayCompleteButton";
import MissedDayPrompt from "@/components/MissedDayPrompt";
import AdaptiveInsights from "@/components/AdaptiveInsights";
import {
  WelcomeCard,
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

// Pure UTC date-string arithmetic - never touches the browser/server's local
// timezone (see the matching comment in PlannerGridClient.tsx's addDays for
// why the old "parse local, round-trip through toISOString" version broke
// for anyone in a timezone ahead of UTC).
function isoAddDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Whole calendar days from `from` to `to` (positive if `to` is later) - same
// UTC-only approach as isoAddDays above, so it's not thrown off by a
// timezone offset that happens to straddle midnight.
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((toUtc - fromUtc) / (1000 * 60 * 60 * 24));
}

type Booking = MentorSlot & {
  mentors: Pick<Mentor, "id" | "name" | "photo_path"> | null;
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

  // Eastern Time, not the server's UTC clock - otherwise "today" can
  // silently roll over to tomorrow's date hours early for anyone in a
  // timezone ahead of UTC (see the same fix applied across the planner).
  const today = easternDateStringNow();
  const yesterday = isoAddDays(today, -1);

  const [entriesRes, blocksRes, planTasksRes, dailyNotesRes, scoreReportsRes, bookingsRes, meetingLinkRes, plannerSettingsRes] =
    await Promise.all([
      supabase.from("planner_entries").select("*").eq("user_id", user.id),
      supabase.from("uworld_blocks").select("*").eq("user_id", user.id),
      supabase.from("mentor_plan_tasks").select("*").eq("student_id", user.id),
      supabase.from("mentor_daily_notes").select("*").eq("student_id", user.id),
      supabase.from("score_reports").select("*").eq("user_id", user.id).order("taken_date", { ascending: false }),
      supabase.from("mentor_slots").select("*, mentors(id, name, photo_path)").eq("booked_by", user.id),
      // This student's own permanent meeting link (mentor_meeting_links) -
      // not read off the mentor row, since different students of the same
      // mentor can have different links. Selecting mentor_id too (not just
      // meeting_link) so it can be checked against nextBooking's mentor
      // below - the table only ever holds one row per student, so if this
      // student switched mentors, this row may still belong to the OLD one
      // until their new mentor sets a fresh link.
      supabase.from("mentor_meeting_links").select("mentor_id, meeting_link").eq("student_id", user.id).maybeSingle(),
      supabase.from("student_planner_settings").select("start_date").eq("student_id", user.id).maybeSingle(),
    ]);

  const entries = (entriesRes.data ?? []) as PlannerEntry[];
  const blocks = (blocksRes.data ?? []) as UWorldBlock[];
  const planTasks = (planTasksRes.data ?? []) as PlanTask[];
  const dailyNotes = (dailyNotesRes.data ?? []) as MentorDailyNote[];
  const scoreReports = (scoreReportsRes.data ?? []) as ScoreReport[];
  const bookings = (bookingsRes.data ?? []) as Booking[];
  const meetingLinkRow = meetingLinkRes.data as { mentor_id: string; meeting_link: string } | null;
  const plannerStartDate = (plannerSettingsRes.data as { start_date: string } | null)?.start_date ?? null;

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

  // Only trust the fetched meeting-link row if it actually belongs to the
  // mentor of the upcoming session being shown - otherwise it's a leftover
  // from a mentor this student no longer has an upcoming session with (see
  // meetingLinkRow comment above), and showing it would point them at the
  // wrong room.
  const myMeetingLink =
    meetingLinkRow && nextBooking?.mentors?.id === meetingLinkRow.mentor_id ? meetingLinkRow.meeting_link : null;

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

  // Dashboard header (Study Planner v2) - greeting, exam countdown, streak,
  // today's progress, and a rough "ahead/behind schedule" pace signal. Pace
  // and today's progress are both derived from mentor_plan_tasks (the same
  // Assignments data as TodaysPlanCard below), NOT the flat grid's columns -
  // see lib/plannerCalendar.ts for why.
  const firstName = (profile.full_name || user.email || "there").trim().split(/\s+/)[0];
  const examLabel = profile.exam_track === "subject" ? `Subject${profile.subject_name ? `: ${profile.subject_name}` : ""}` : "Step 1";
  const daysRemaining = profile.exam_date ? daysBetween(today, profile.exam_date) : null;
  const statusLabel = todayStatus.studyCompleted
    ? "Today's plan complete"
    : todayStatus.hasEntry
    ? "In progress today"
    : "Not started today yet";
  const statusTone: "good" | "warning" | "neutral" = todayStatus.studyCompleted
    ? "good"
    : todayStatus.hasEntry
    ? "warning"
    : "neutral";
  const tasksByDate = groupTasksByDate(planTasks);
  const pace = computeSchedulePaceDays(tasksByDate, plannerStartDate, today);
  const todayTaskProgress = computeTaskProgress(todaysTasks);
  const todayFullyComplete = todayTaskProgress.totalCount > 0 && todayTaskProgress.completedCount === todayTaskProgress.totalCount;
  const motivationMessage = computeMotivationMessage(todayFullyComplete, pace);

  // Missed-day prompt (Study Planner v2, phase 3) - only surfaces when
  // yesterday genuinely had unfinished mentor-assigned tasks (status
  // "missed" or "partial"); a day with nothing planned ("no-plan") never
  // triggers it, since there's nothing to reschedule.
  const yesterdayTasks = tasksByDate[yesterday] ?? [];
  const yesterdayDayStatus = computeDayStatus(yesterdayTasks, yesterday, today);
  const yesterdayMissedCount = yesterdayTasks.filter((t) => !t.completed).length;
  const showMissedDayPrompt = yesterdayDayStatus === "missed" || yesterdayDayStatus === "partial";

  // Adaptive engine (Study Planner v2, phase 4) - "suggest, student
  // confirms" for anything touching the student's own plan; the
  // skipped-subject flag is the one exception, since it only notifies the
  // mentor and doesn't change the student's data (see AdaptiveInsights.tsx).
  const catchUpPlan = computeCatchUpPlan(tasksByDate, today, pace, daysRemaining);
  const moveAheadSuggestion = computeMoveAheadSuggestion(pace, today, tasksByDate);
  const skippedCategories = computeSkippedCategories(planTasks, today);

  return (
    <AppShell isAdmin={profile.is_admin} userName={profile.full_name} contentPublished={contentPublished}>
      <main className="flex-1 px-6 py-8 space-y-6 w-full">
        <WelcomeCard
          greeting={timeOfDayGreeting()}
          firstName={firstName}
          examLabel={examLabel}
          examDate={profile.exam_date}
          daysRemaining={daysRemaining}
          mentorName={currentMentorName}
          statusLabel={statusLabel}
          statusTone={statusTone}
          streakDays={streaks.current}
          todayProgress={todayTaskProgress}
          pace={pace}
          motivationMessage={motivationMessage}
        />

        {showMissedDayPrompt && (
          <MissedDayPrompt
            missedDate={yesterday}
            missedCount={yesterdayMissedCount}
            todayIso={today}
            dayLabel="Yesterday"
          />
        )}

        <AdaptiveInsights
          catchUpPlan={catchUpPlan}
          moveAhead={moveAheadSuggestion}
          skippedCategories={skippedCategories}
          studentId={user.id}
          mentorId={mentorFromEmail?.id ?? null}
          todayIso={today}
        />

        <StatusUpdateCard
          userId={user.id}
          initialStatus={profile.status_update ?? null}
          initialUpdatedAt={profile.status_updated_at ?? null}
        />

        <TodaysPlanCard
          plannedSystem={plannedSystem}
          tasks={todaysTasks}
          markCompleteSlot={
            <MarkDayCompleteButton
              userId={user.id}
              todayIso={today}
              existingFieldValues={todaysEntry?.field_values ?? {}}
              alreadyComplete={todayStatus.studyCompleted}
              mentorId={mentorFromEmail?.id ?? null}
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
                    meetingLink: myMeetingLink,
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
