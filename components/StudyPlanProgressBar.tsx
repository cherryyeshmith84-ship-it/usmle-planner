import type { PlanProgress } from "@/lib/planProgress";

/**
 * "Study Plan Progress" - how much of the mentor's plan (mentor-assigned
 * tasks, from wherever they started assigning through today) the student
 * has actually completed. A day only counts once everything the mentor
 * assigned for it is checked off - no partial credit - and the bar's total
 * grows on its own as the mentor plans further ahead and those days arrive.
 * See lib/planProgress.ts for the actual computation.
 *
 * Renders nothing if the mentor hasn't assigned anything yet - there's
 * nothing meaningful to show until there's a plan to measure against.
 */
export default function StudyPlanProgressBar({ progress }: { progress: PlanProgress }) {
  if (progress.totalDays === 0) return null;

  return (
    <div className="card mb-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Study Plan Progress <span className="normal-case text-slate-500">(your mentor's plan so far)</span>
        </p>
        <p className="text-sm font-semibold">
          {progress.completedDays} / {progress.totalDays} days
          <span className="text-brand-400 ml-1">({progress.percent}%)</span>
        </p>
      </div>
      <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full bg-brand-500 transition-all"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <p className="text-[11px] text-slate-500 mt-2">
        A day only counts once you've completed everything your mentor assigned for it - this grows
        automatically as your mentor plans further ahead.
      </p>
    </div>
  );
}
