import Link from "next/link";
import type { PlanTask } from "@/lib/planTasks";
import { computeTaskProgress, formatEstimatedTime } from "@/lib/planTasks";
import type { ImmediateExamReview, SystemStrength } from "@/lib/scoreReports";
import type { MentorDailyNote } from "@/lib/mentorDailyNotes";
import type { RecentActivityItem, StatusTone } from "@/lib/homeInsights";
import type { HighlightedDay } from "@/lib/mentorDailyNotes";
import { formatSlotDate, formatSlotTime } from "@/lib/mentors";
import AssignmentsChecklist from "./AssignmentsChecklist";

/**
 * Home dashboard cards (see app/dashboard/page.tsx) - kept in one file since
 * they're all small, purely presentational, and only ever used together on
 * that one page. All plain Server Components - no client-side state needed.
 *
 * Note: the old manual "Mark Day Complete" button (MarkDayCompleteButton.tsx)
 * was removed from here. It let a student flip today to a green "Completed"
 * checkmark with one click regardless of whether their actual Assignments
 * were checked off, which is exactly why some students saw green on days
 * they hadn't finished everything. Completion status now comes ONLY from
 * PlannerStatusHeader/computeTodayStatus, which is derived purely from real
 * Assignment checkbox state (see lib/plannerStatus.ts) - no manual override.
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
  streakDays,
  todayProgress,
  pace,
  motivationMessage,
}: {
  greeting: string;
  firstName: string;
  examLabel: string;
  examDate: string | null;
  daysRemaining: number | null;
  mentorName: string | null;
  statusLabel: string;
  statusTone: StatusTone;
  // New for the Study Planner v2 dashboard header - all optional so this
  // card still works anywhere it might be used without them.
  streakDays?: number;
  todayProgress?: { completedCount: number; totalCount: number; percent: number };
  pace?: number; // + = ahead of schedule, - = behind, 0/undefined = don't show
  // Phase 3's rule-based "real analytics, not quotes" nudge - see
  // computeMotivationMessage in lib/homeInsights.ts.
  motivationMessage?: string;
}) {
  return (
    <div className="card">
      <p className="text-2xl font-bold mb-4">
        {greeting}, {firstName} 👋
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <Stat label="Exam" value={examLabel} />
        <Stat
          label={`${examLabel} Countdown`}
          value={daysRemaining !== null ? `${daysRemaining} Days` : "—"}
        />
        {streakDays !== undefined && <Stat label="Current Streak" value={`🔥 ${streakDays} Days`} />}
        <Stat label="Current Mentor" value={mentorName ?? "None yet"} />
      </div>

      {todayProgress && todayProgress.totalCount > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Today&apos;s Progress</span>
            <span>
              {todayProgress.completedCount} / {todayProgress.totalCount} ({todayProgress.percent}%)
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-brand-500 transition-all"
              style={{ width: `${todayProgress.percent}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs font-semibold rounded-full px-3 py-1 ${TONE_CLASS[statusTone]}`}>
          {statusLabel}
        </span>
        {!!pace && (
          <span
            className={`text-xs font-semibold rounded-full px-3 py-1 ${
              pace > 0 ? "bg-green-900/40 text-green-400" : "bg-red-900/40 text-red-400"
            }`}
          >
            {pace > 0
              ? `Ahead of schedule by ${pace} day${pace === 1 ? "" : "s"}`
              : `Behind schedule by ${Math.abs(pace)} day${Math.abs(pace) === 1 ? "" : "s"}`}
          </span>
        )}
      </div>

      {motivationMessage && <p className="text-sm text-slate-400 mt-3">{motivationMessage}</p>}
    </div>
  );
}

export function TodaysPlanCard({
  plannedSystem,
  tasks,
}: {
  plannedSystem: string | null;
  tasks: PlanTask[];
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

/** Whole days from `todayIso` to `dateIso` (both YYYY-MM-DD) - pure UTC date-string arithmetic. */
function daysUntilIso(todayIso: string, dateIso: string): number {
  const [ty, tm, td] = todayIso.split("-").map(Number);
  const [dy, dm, dd] = dateIso.split("-").map(Number);
  return Math.round((Date.UTC(dy, dm - 1, dd) - Date.UTC(ty, tm - 1, td)) / (1000 * 60 * 60 * 24));
}

/**
 * "Important Day" card - the nearest upcoming date a mentor has starred
 * (exam day, NBME day, etc. - see MentorDailyNoteCell's highlight toggle).
 * Only rendered by the dashboard when there IS an upcoming one; no
 * placeholder/empty state needed since most days nothing is starred.
 */
export function ImportantDayCard({ highlight, todayIso }: { highlight: HighlightedDay; todayIso: string }) {
  const days = daysUntilIso(todayIso, highlight.date);
  const daysLabel = days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days`;
  return (
    <div className="card border-amber-700">
      <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-2">⭐ Important Day</p>
      <p className="text-sm font-semibold mb-1">{highlight.label || "Marked by your mentor"}</p>
      <p className="text-sm text-slate-300 mb-1">{highlight.date}</p>
      <p className="text-xs text-slate-500">{daysLabel}</p>
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
