import type { TodayStatus } from "@/lib/plannerStatus";

/**
 * "Planner Status" header (Study Planner v1 item 13) - today's Questions,
 * Hours, Assignments, and a Status badge, in one strip at the top of
 * /planner. Purely read-only/derived - nothing here is entered directly,
 * it all comes from what's already been logged for today elsewhere on the
 * page (see lib/plannerStatus.ts).
 */
export default function PlannerStatusHeader({ status }: { status: TodayStatus }) {
  const statusLabel = status.studyCompleted ? "Completed" : status.hasEntry ? "In Progress" : "Not Started";
  // Same fix as DAY_STATUS_COLOR in lib/plannerCalendar.ts: bg-X-900/40 was a
  // dark-theme translucent wash that reads as barely-there on a white card
  // now that X-900 is the palest end of the (deliberately reversed) color
  // scale - bg-X-800 solid + text-X-300 gives an actually-visible pastel.
  const statusColor = status.studyCompleted
    ? "bg-green-800 text-green-300"
    : status.hasEntry
    ? "bg-amber-800 text-amber-300"
    : "bg-slate-800 text-slate-500";

  const stats: { label: string; value: string }[] = [
    {
      label: "Questions",
      value:
        status.questionsPlanned > 0
          ? `${status.questionsCompleted} / ${status.questionsPlanned}`
          : String(status.questionsCompleted),
    },
    { label: "Hours", value: String(status.hours) },
    {
      label: "Assignments",
      value: status.assignmentsTotal > 0 ? `${status.assignmentsCompleted} / ${status.assignmentsTotal}` : "—",
    },
  ];

  return (
    <div className="card mb-4 flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Today&apos;s Status</p>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="text-[11px] text-slate-500">{s.label}</p>
              <p className="text-lg font-semibold">{s.value}</p>
            </div>
          ))}
        </div>
      </div>
      <span className={`text-xs font-semibold rounded-full px-3 py-1 whitespace-nowrap ${statusColor}`}>
        {statusLabel}
      </span>
    </div>
  );
}
