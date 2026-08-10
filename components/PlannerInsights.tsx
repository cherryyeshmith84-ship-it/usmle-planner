import type { CalendarDay, MonthStats } from "@/lib/plannerCalendar";
import { DAY_STATUS_COLOR } from "@/lib/plannerCalendar";

/**
 * Weekly View / Monthly Statistics / Heatmap (Study Planner v2, phase 2) -
 * all three are plain presentational Server Components, built from the same
 * CalendarDay[] shape as PlannerCalendar.tsx's month grid (see
 * lib/plannerCalendar.ts). No client-side state needed here since nothing
 * on this page is interactive - clicking into a specific day still happens
 * up in the calendar above.
 */

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function WeekStrip({ weekNumber, days }: { weekNumber: number | null; days: CalendarDay[] }) {
  const completedCount = days.filter((d) => d.status === "completed").length;
  const percent = Math.round((completedCount / (days.length || 1)) * 100);

  return (
    <div className="card mb-6">
      <div className="flex items-center justify-between mb-3">
        <p className="font-bold">{weekNumber ? `Week ${weekNumber}` : "This week"}</p>
        <p className="text-sm font-semibold text-brand-400">{percent}% complete</p>
      </div>
      <div className="grid grid-cols-7 gap-2 text-center">
        {days.map((day, i) => {
          const colors = DAY_STATUS_COLOR[day.status];
          return (
            <div key={day.date}>
              <p className="text-[11px] text-slate-500 mb-1">{WEEKDAY_SHORT[i] ?? ""}</p>
              <div
                className={`w-full aspect-square rounded-lg flex items-center justify-center text-xs font-semibold ${colors.bg} ${colors.text}`}
                title={`${day.date} - ${colors.label}`}
              >
                {Number(day.date.slice(8, 10))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MonthStatsGrid({
  monthLabel,
  stats,
  currentStreak,
  longestStreak,
}: {
  monthLabel: string;
  stats: MonthStats;
  currentStreak: number;
  longestStreak: number;
}) {
  const items = [
    { label: "Completed Days", value: String(stats.completedDays) },
    { label: "Missed Days", value: String(stats.missedDays) },
    { label: "Partial Days", value: String(stats.partialDays) },
    { label: "Study Hours", value: String(stats.studyHours) },
    { label: "Current Streak", value: `${currentStreak} Days` },
    { label: "Longest Streak", value: `${longestStreak} Days` },
  ];

  return (
    <div className="card mb-6">
      <p className="font-bold mb-4">{monthLabel} Statistics</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {items.map((it) => (
          <div key={it.label}>
            <p className="text-[11px] text-slate-500">{it.label}</p>
            <p className="text-lg font-semibold">{it.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Heatmap({ days }: { days: CalendarDay[] }) {
  // `days` should already start on a Monday (see weekStartMonday) so every
  // column below lines up as a clean 7-tall week, same as GitHub's grid.
  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <div className="card mb-6">
      <p className="font-bold mb-4">Activity Heatmap</p>
      <div className="flex gap-1 overflow-x-auto pb-2">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day) => (
              <div
                key={day.date}
                className={`w-3 h-3 rounded-sm ${DAY_STATUS_COLOR[day.status].bg}`}
                title={`${day.date} - ${DAY_STATUS_COLOR[day.status].label}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 mt-3">
        {(["completed", "partial", "missed", "no-plan"] as const).map((status) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-sm ${DAY_STATUS_COLOR[status].bg}`} />
            {DAY_STATUS_COLOR[status].label}
          </span>
        ))}
      </div>
    </div>
  );
}
