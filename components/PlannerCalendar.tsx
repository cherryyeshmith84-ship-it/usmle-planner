"use client";

import { useMemo, useState } from "react";
import type { PlanTask } from "@/lib/planTasks";
import { computeTaskProgress, groupTasksByDate, sortTasks } from "@/lib/planTasks";
import {
  buildCalendarRange,
  computeSchedulePaceDays,
  DAY_STATUS_COLOR,
  monthGridEnd,
  monthGridStart,
  addDaysIso,
} from "@/lib/plannerCalendar";
import { isDateEditable } from "@/lib/planProgress";
import AssignmentsChecklist from "./AssignmentsChecklist";

const WEEKDAY_HEADERS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthLabel(anyDateInMonth: string): string {
  const [y, m] = anyDateInMonth.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function dayNumberInPlan(date: string, startDate: string | null): number | null {
  if (!startDate) return null;
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [dy, dm, dd] = date.split("-").map(Number);
  const diff = Math.round(
    (Date.UTC(dy, dm - 1, dd) - Date.UTC(sy, sm - 1, sd)) / (1000 * 60 * 60 * 24)
  );
  return diff >= 0 ? diff + 1 : null;
}

function formatDayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

/**
 * Color-coded month calendar for the study planner (Study Planner v2) -
 * sits above the flat day-by-day grid on /planner. Built entirely from
 * mentor_plan_tasks (the same "Assignments" data already shown on the Home
 * dashboard's Today's Plan card and the grid's expanded-row Assignments
 * section) rather than the flat grid's columns, since a day here is
 * "completed" in the simple all-or-nothing checkbox sense the calendar
 * mockup called for, not "every column filled in."
 *
 * Clicking a day opens its Daily Card below the grid with the same
 * AssignmentsChecklist checkboxes used everywhere else in the app, so
 * toggling here writes through the same student_toggle_plan_task() RPC and
 * stays in sync with the dashboard/grid views.
 */
export default function PlannerCalendar({
  initialTasks,
  startDate,
  todayIso,
}: {
  initialTasks: PlanTask[];
  startDate: string | null;
  todayIso: string;
}) {
  const [monthAnchor, setMonthAnchor] = useState(todayIso);
  const [selectedDate, setSelectedDate] = useState(todayIso);

  const tasksByDate = useMemo(() => groupTasksByDate(initialTasks), [initialTasks]);

  const gridStart = monthGridStart(monthAnchor);
  const gridEnd = monthGridEnd(monthAnchor);
  const days = useMemo(
    () => buildCalendarRange(tasksByDate, gridStart, gridEnd, todayIso),
    [tasksByDate, gridStart, gridEnd, todayIso]
  );

  const currentMonthPrefix = monthAnchor.slice(0, 7);
  const pace = useMemo(
    () => computeSchedulePaceDays(tasksByDate, startDate, todayIso),
    [tasksByDate, startDate, todayIso]
  );

  const selectedTasks = sortTasks(tasksByDate[selectedDate] ?? []);
  const selectedProgress = computeTaskProgress(selectedTasks);
  const selectedDayNumber = dayNumberInPlan(selectedDate, startDate);
  const selectedEditable = isDateEditable(selectedDate, todayIso);

  return (
    <div className="card mb-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMonthAnchor(addDaysIso(monthGridStart(monthAnchor), -1))}
            className="btn-secondary text-xs px-2 py-1"
            aria-label="Previous month"
          >
            &larr;
          </button>
          <p className="font-bold">{monthLabel(monthAnchor)}</p>
          <button
            type="button"
            onClick={() => setMonthAnchor(addDaysIso(monthGridEnd(monthAnchor), 1))}
            className="btn-secondary text-xs px-2 py-1"
            aria-label="Next month"
          >
            &rarr;
          </button>
        </div>
        {pace !== 0 && (
          <p className={`text-xs font-semibold ${pace > 0 ? "text-green-400" : "text-red-400"}`}>
            {pace > 0
              ? `You're ahead of schedule by ${pace} day${pace === 1 ? "" : "s"}`
              : `You're behind schedule by ${Math.abs(pace)} day${Math.abs(pace) === 1 ? "" : "s"}`}
          </p>
        )}
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center text-xs text-slate-500 mb-1.5">
        {WEEKDAY_HEADERS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5 mb-4">
        {days.map((day) => {
          const inMonth = day.date.startsWith(currentMonthPrefix);
          const colors = DAY_STATUS_COLOR[day.status];
          const isSelected = day.date === selectedDate;
          const dayNum = Number(day.date.slice(8, 10));
          return (
            <button
              key={day.date}
              type="button"
              onClick={() => setSelectedDate(day.date)}
              className={`aspect-square rounded-lg text-xs font-semibold flex items-center justify-center transition ${colors.bg} ${colors.text} ${
                inMonth ? "" : "opacity-30"
              } ${isSelected ? "ring-2 ring-brand-400" : ""} ${
                day.status === "today" ? "ring-2 ring-brand-500" : ""
              }`}
              title={`${day.date} - ${colors.label}${day.totalCount > 0 ? ` (${day.completedCount}/${day.totalCount})` : ""}`}
            >
              {dayNum}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 mb-6">
        {(["completed", "partial", "missed", "today", "upcoming"] as const).map((status) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${DAY_STATUS_COLOR[status].bg}`} />
            {DAY_STATUS_COLOR[status].label}
          </span>
        ))}
      </div>

      <div className="border-t border-slate-800 pt-4">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div>
            {selectedDayNumber && (
              <p className="text-xs text-slate-500 uppercase tracking-wide">Day {selectedDayNumber}</p>
            )}
            <p className="font-bold">{formatDayLabel(selectedDate)}</p>
          </div>
          {selectedProgress.totalCount > 0 && (
            <p className="text-sm font-semibold text-brand-400">{selectedProgress.percent}% complete</p>
          )}
        </div>
        {selectedProgress.totalCount > 0 && (
          <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden mb-4">
            <div
              className="h-full bg-brand-500 transition-all"
              style={{ width: `${selectedProgress.percent}%` }}
            />
          </div>
        )}
        <AssignmentsChecklist tasks={selectedTasks} editable={selectedEditable} />
      </div>
    </div>
  );
}
