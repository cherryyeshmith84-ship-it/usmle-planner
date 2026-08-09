import type { PlanProgress } from "@/lib/planProgress";

/**
 * "Study Plan Progress" - how many days of the full study planner grid have
 * been completely filled in, from the date your mentor set your plan to
 * start through today. A day only counts once every box in that day's row
 * is filled in - no partial credit - and the total grows on its own as more
 * days pass (or readjusts right away if your mentor moves the start date or
 * changes which columns are active). See lib/planProgress.ts.
 *
 * Renders nothing until a mentor has actually set a plan start date -
 * there's nothing meaningful to measure before that.
 */
export default function StudyPlanProgressBar({ progress }: { progress: PlanProgress }) {
  if (progress.totalDays === 0) return null;

  return (
    <div className="card mb-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Study Plan Progress <span className="normal-case text-slate-500">(since {progress.planStart})</span>
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
        A day only counts once every box in the grid below is filled in for it - this covers
        every day your mentor has planned so far, and grows the moment they plan further ahead.
      </p>
    </div>
  );
}
