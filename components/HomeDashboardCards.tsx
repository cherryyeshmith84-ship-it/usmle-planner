import type { ReactNode } from "react";
import Link from "next/link";
import type { PlanTask } from "@/lib/planTasks";
import { computeTaskProgress, formatEstimatedTime } from "@/lib/planTasks";
import type { ImmediateExamReview, SystemStrength } from "@/lib/scoreReports";
import type { MentorDailyNote } from "@/lib/mentorDailyNotes";
import type { RecentActivityItem, StatusTone } from "@/lib/homeInsights";
import { formatSlotDate, formatSlotTime } from "@/lib/mentors";
import AssignmentsChecklist from "./AssignmentsChecklist";

/**
 * Home dashboard cards (see app/dashboard/page.tsx) - kept in one file since
 * they're all small, purely presentational, and only ever used together on
 * that one page. None of these need client-side state, so they stay plain
 * Server Components (the one interactive piece, "Mark Day Complete", is its
 * own small Client Component - MarkDayCompleteButton.tsx).
 */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

const TONE_CLASS: Record<StatusTone, string> = {
  good: "bg-green-900/40 text-green-400",
  warning: "bg-amber-900/40 text-amber-400",
  neutral: "bg-slate-800 text-slate-400",
};

export function WelcomeCard({
  greeting,
  firstName,
  examLabel,
  examDate,
  daysRemaining,
  mentorName,
  statusLabel,
  statusTone,
}: {
  greeting: string;
  firstName: string;
  examLabel: string;
  examDate: string | null;
  daysRemaining: number | null;
  mentorName: string | null;
  statusLabel: string;
  statusTone: StatusTone;
}) {
  return (
    <div className="card">
      <p className="text-2xl font-bold mb-4">
        {greeting}, {firstName} 👋
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="Exam" value={examLabel} />
        <Stat label="Target Exam Date" value={examDate ?? "Not set"} />
        <Stat label="Days Remaining" value={daysRemaining !== null ? String(daysRemaining) : "—"} />
        <Stat label="Current Mentor" value={mentorName ?? "None yet"} />
      </div>
      <div className="mt-4">
        <span className={`text-xs font-semibold rounded-full px-3 py-1 ${TONE_CLASS[statusTone]}`}>
          {statusLabel}
        </span>
      </div>
    </div>
  );
}

export function TodaysPlanCard({
  plannedSystem,
  tasks,
  markCompleteSlot,
}: {
  plannedSystem: string | null;
  tasks: PlanTask[];
  markCompleteSlot: ReactNode;
}) {
  const progress = computeTaskProgress(tasks);
  const estimatedTime = formatEstimatedTime(tasks);

  return (
    <div className="card">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Today&apos;s Plan</p>
      {plannedSystem && (
        <p className="text-sm text-slate-300 mb-3">
          <span className="text-slate-500">System:</span> <span className="font-semibold">{plannedSystem}</span>
        </p>
      )}
      {tasks.length === 0 ? (
        <p className="text-sm text-slate-500 mb-3">No assignments from your mentor for today yet.</p>
      ) : (
        <div className="mb-3">
          <AssignmentsChecklist tasks={tasks} />
        </div>
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500 mb-4">
        {estimatedTime && <span>Estimated time: {estimatedTime}</span>}
        <span>
          Progress: {progress.completedCount} / {progress.totalCount} completed
        </span>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/planner" className="btn-primary text-sm">
          Open Study Planner
        </Link>
        {markCompleteSlot}
      </div>
    </div>
  );
}

export function LatestAnalysisCard({
  review,
  weakest,
  strongest,
}: {
  review: ImmediateExamReview | null;
  weakest: SystemStrength | null;
  strongest: SystemStrength | null;
}) {
  return (
    <div className="card">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Latest Assessment</p>
      {!review ? (
        <p className="text-sm text-slate-500 mb-3">No score reports uploaded yet.</p>
      ) : (
        <>
          <p className="text-sm font-semibold mb-1">{review.latest.exam_name}</p>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl font-bold">
              {review.latest.overall_percent !== null ? `${review.latest.overall_percent}%` : "—"}
            </span>
            {review.overallDelta !== null && (
              <span className={`text-sm font-semibold ${review.overallDelta >= 0 ? "text-green-400" : "text-red-400"}`}>
                {review.overallDelta >= 0 ? "↑" : "↓"} {Math.abs(review.overallDelta)}%
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
            <div>
              <p className="text-[11px] text-slate-500">Weakest</p>
              <p className="font-semibold">{weakest?.system ?? "—"}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-500">Strongest</p>
              <p className="font-semibold">{strongest?.system ?? "—"}</p>
            </div>
          </div>
        </>
      )}
      <Link href="/history" className="text-xs font-semibold text-brand-400 hover:text-brand-300">
        View Full Analysis →
      </Link>
    </div>
  );
}

function daysUntilLabel(startTimeIso: string): string {
  const ms = new Date(startTimeIso).getTime() - Date.now();
  const days = Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days} days`;
}

export function UpcomingMentorshipCard({
  booking,
}: {
  booking: { startTime: string; endTime: string; mentorName: string; meetingLink: string | null } | null;
}) {
  return (
    <div className="card">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Upcoming Mentorship</p>
      {!booking ? (
        <>
          <p className="text-sm text-slate-500 mb-3">No upcoming sessions.</p>
          <Link href="/mentorship" className="text-xs font-semibold text-brand-400 hover:text-brand-300">
            Book a mentor →
          </Link>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold mb-1">{booking.mentorName}</p>
          <p className="text-sm text-slate-300 mb-0.5">{formatSlotDate(booking.startTime)}</p>
          <p className="text-sm text-slate-400 mb-3">
            {formatSlotTime(booking.startTime)}–{formatSlotTime(booking.endTime)}
          </p>
          <p className="text-xs text-slate-500 mb-3">{daysUntilLabel(booking.startTime)}</p>
          {booking.meetingLink ? (
            <a href={booking.meetingLink} target="_blank" rel="noreferrer" className="btn-primary text-sm inline-block">
              Join Session
            </a>
          ) : (
            <Link href="/mentorship/sessions" className="text-xs font-semibold text-brand-400 hover:text-brand-300">
              View session →
            </Link>
          )}
        </>
      )}
    </div>
  );
}

export function MentorNoteCard({ note, mentorName }: { note: MentorDailyNote | null; mentorName: string | null }) {
  return (
    <div className="card">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Latest Mentor Note</p>
      {!note ? (
        <p className="text-sm text-slate-500 mb-3">No notes from your mentor yet.</p>
      ) : (
        <p className="text-sm text-slate-200 italic mb-3 whitespace-pre-wrap">
          &ldquo;{note.content}&rdquo;
          {mentorName && <span className="block text-xs text-slate-500 mt-1 not-italic">— {mentorName}</span>}
        </p>
      )}
      <Link href="/planner" className="text-xs font-semibold text-brand-400 hover:text-brand-300">
        View All Notes →
      </Link>
    </div>
  );
}

export function AiReminderCard({ message }: { message: string }) {
  return (
    <div className="card">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Reminder</p>
      <p className="text-sm text-slate-300">{message}</p>
    </div>
  );
}

const QUICK_ACTIONS = [
  { label: "Upload Score Report", href: "/history" },
  { label: "Open Planner", href: "/planner" },
  { label: "Book Mentor", href: "/mentorship" },
  { label: "View Analysis", href: "/history" },
];

export function QuickActionsCard() {
  return (
    <div className="card">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Quick Actions</p>
      <div className="grid grid-cols-2 gap-2">
        {QUICK_ACTIONS.map((a) => (
          <Link key={a.label} href={a.href} className="btn-secondary text-sm text-center">
            {a.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function StudyStreakCard({ current, longest }: { current: number; longest: number }) {
  return (
    <div className="card">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Study Streak</p>
      <div className="flex items-center gap-8">
        <div>
          <p className="text-[11px] text-slate-500">Current Streak</p>
          <p className="text-2xl font-bold">
            🔥 {current} Day{current === 1 ? "" : "s"}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-slate-500">Longest</p>
          <p className="text-lg font-semibold">
            {longest} Day{longest === 1 ? "" : "s"}
          </p>
        </div>
      </div>
    </div>
  );
}

export function NextMilestoneCard({ nextCheckin }: { nextCheckin: string | null }) {
  return (
    <div className="card">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Next Milestone</p>
      {nextCheckin ? (
        <p className="text-sm text-slate-300">
          Your mentor&apos;s next check-in is planned for <span className="font-semibold">{nextCheckin}</span>.
        </p>
      ) : (
        <p className="text-sm text-slate-500">
          Keep logging daily to build your streak - no check-in scheduled yet.
        </p>
      )}
    </div>
  );
}

export function RecentActivityCard({ items }: { items: RecentActivityItem[] }) {
  return (
    <div className="card">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Yesterday</p>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No activity logged yesterday.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className="text-sm text-slate-300">
              ✓ {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
