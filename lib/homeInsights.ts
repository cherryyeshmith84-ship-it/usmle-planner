import type { PlannerEntry } from "./plannerColumns";
import type { UWorldBlock } from "./uworldBlocks";
import type { MentorDailyNote } from "./mentorDailyNotes";
import type { WeeklyProgressSummary } from "./weeklyProgress";
import type { TodayStatus } from "./plannerStatus";

/**
 * Most recent mentor note that actually has text in it - for the "Latest
 * Mentor Note" card on Home. Skips rating-only/empty notes so the card
 * never shows an empty quote.
 */
export function latestNoteWithContent(notes: MentorDailyNote[]): MentorDailyNote | null {
  const withContent = notes.filter((n) => n.content && n.content.trim().length > 0);
  if (withContent.length === 0) return null;
  return [...withContent].sort((a, b) => b.note_date.localeCompare(a.note_date))[0];
}

/** Nearest upcoming next_checkin_date a mentor has set, if any - "Next Milestone" on Home. */
export function nextUpcomingCheckin(notes: MentorDailyNote[], todayIso: string): string | null {
  const upcoming = notes
    .map((n) => n.next_checkin_date)
    .filter((d): d is string => !!d && d >= todayIso)
    .sort();
  return upcoming[0] ?? null;
}

export type StatusTone = "good" | "warning" | "neutral";

/** "Current Status" badge on the Welcome card - how the last 7 days are going. */
export function computeExamStatus(weekly: WeeklyProgressSummary): { label: string; tone: StatusTone } {
  if (weekly.daysInWindow === 0) return { label: "Getting Started", tone: "neutral" };
  const ratio = weekly.daysStudied / weekly.daysInWindow;
  if (ratio >= 0.7) return { label: "On Track", tone: "good" };
  if (ratio >= 0.4) return { label: "Needs Attention", tone: "warning" };
  return { label: "Falling Behind", tone: "warning" };
}

/**
 * A single small, rule-based nudge for the Home page - deliberately NOT an
 * AI call (no latency, no cost, always available, never wrong about what
 * actually happened). Checks a short list of conditions in priority order
 * and returns the first one that applies.
 */
export function computeAiReminder(params: {
  todayStatus: TodayStatus;
  weekly: WeeklyProgressSummary;
  yesterdayEntry: PlannerEntry | undefined;
  yesterdayBlocks: UWorldBlock[];
}): string {
  const { todayStatus, weekly, yesterdayEntry, yesterdayBlocks } = params;
  const yesterdayQReviewed = Number(yesterdayEntry?.field_values?.["q_reviewed"] ?? 0) || 0;
  const yesterdayQuestionsCompleted =
    yesterdayBlocks.length > 0
      ? yesterdayBlocks.reduce((sum, b) => sum + (b.questions ?? 0), 0)
      : Number(yesterdayEntry?.field_values?.["q_solved"] ?? 0) || 0;

  if (yesterdayQuestionsCompleted > 0 && yesterdayQReviewed === 0) {
    return "You haven't reviewed yesterday's incorrect questions yet.";
  }
  if (weekly.daysInWindow > 0 && weekly.daysStudied >= weekly.daysInWindow) {
    return "Great job! You've completed every study day this week.";
  }
  if (!todayStatus.hasEntry) {
    return "You haven't logged anything for today yet - even a quick note keeps your streak going.";
  }
  if (todayStatus.assignmentsTotal > 0 && todayStatus.assignmentsCompleted < todayStatus.assignmentsTotal) {
    const remaining = todayStatus.assignmentsTotal - todayStatus.assignmentsCompleted;
    return `${remaining} assignment${remaining === 1 ? "" : "s"} still open for today.`;
  }
  return "You're on track - keep it up.";
}

export interface RecentActivityItem {
  label: string;
}

/**
 * Yesterday's activity summary for the Home page's "Recent Activity" card -
 * purely descriptive, built from whatever already happened to be logged/
 * reviewed/assigned on that date. No separate activity-log table, so this
 * takes pre-computed booleans/counts rather than raw tables - keeps the
 * actual "was X true yesterday" queries in the page that already fetched
 * everything, instead of duplicating date-filtering logic here.
 */
export function computeRecentActivity(params: {
  questionsCompletedYesterday: number;
  scoreReportUploadedYesterday: boolean;
  mentorReviewedYesterday: boolean;
  newAssignmentYesterday: boolean;
}): RecentActivityItem[] {
  const { questionsCompletedYesterday, scoreReportUploadedYesterday, mentorReviewedYesterday, newAssignmentYesterday } =
    params;
  const items: RecentActivityItem[] = [];

  if (questionsCompletedYesterday > 0) {
    items.push({ label: `Completed ${questionsCompletedYesterday} question${questionsCompletedYesterday === 1 ? "" : "s"}` });
  }
  if (scoreReportUploadedYesterday) items.push({ label: "Uploaded a score report" });
  if (mentorReviewedYesterday) items.push({ label: "Mentor reviewed your planner" });
  if (newAssignmentYesterday) items.push({ label: "New assignment added by your mentor" });

  return items;
}
