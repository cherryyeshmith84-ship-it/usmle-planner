import type { WeeklyProgressSummary } from "@/lib/weeklyProgress";

/**
 * "Weekly Progress" (Study Planner v1 item 8) - read-only rollup of the
 * last 7 days, sitting above the daily grid on /planner. Every number here
 * is derived from data already entered day-by-day (planner_entries,
 * uworld_blocks, mentor_plan_tasks) - nothing new to fill in.
 */
export default function WeeklyProgress({ summary }: { summary: WeeklyProgressSummary }) {
  const stats: { label: string; value: string }[] = [
    {
      label: "Questions",
      value:
        summary.questionsPlanned > 0
          ? `${summary.questionsCompleted} / ${summary.questionsPlanned}`
          : String(summary.questionsCompleted),
    },
    { label: "Hours", value: String(summary.hours) },
    { label: "Days Studied", value: `${summary.daysStudied} / ${summary.daysInWindow}` },
    {
      label: "Assignments Completed",
      value: summary.assignmentsTotal > 0 ? `${summary.assignmentsCompleted} / ${summary.assignmentsTotal}` : "—",
    },
    {
      label: "Average UWorld %",
      value: summary.averageUWorldPercent !== null ? `${summary.averageUWorldPercent}%` : "—",
    },
  ];

  return (
    <div className="card mb-6">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
        Weekly Progress <span className="normal-case text-slate-500">(last 7 days)</span>
      </p>
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="text-[11px] text-slate-500">{s.label}</p>
            <p className="text-lg font-semibold">{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
