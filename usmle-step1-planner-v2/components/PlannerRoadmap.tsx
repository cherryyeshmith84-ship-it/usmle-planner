import type { RoadmapEntry } from "@/lib/templateDays";

function dayStatus(entry: RoadmapEntry, today: string): { label: string; className: string } {
  const totalCount = entry.tasks.length;
  const doneCount = entry.log?.tasks.filter((t) => t.status === "done").length ?? 0;

  if (entry.date === today) {
    return { label: "Today", className: "bg-brand-900/40 text-brand-300" };
  }
  if (entry.date > today) {
    return { label: "Upcoming", className: "bg-slate-800 text-slate-400" };
  }
  if (entry.log?.marked_complete || (totalCount > 0 && doneCount >= totalCount)) {
    return { label: "Completed", className: "bg-green-900/40 text-green-400" };
  }
  if (doneCount > 0) {
    return { label: "Partially done", className: "bg-amber-900/40 text-amber-400" };
  }
  return { label: "Missed", className: "bg-red-900/40 text-red-400" };
}

export default function PlannerRoadmap({
  entries,
  today,
}: {
  entries: RoadmapEntry[];
  today: string;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-400">No plan assigned yet.</p>;
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const status = dayStatus(entry, today);
        const totalCount = entry.tasks.length;
        const doneCount = entry.log?.tasks.filter((t) => t.status === "done").length ?? 0;
        const displayTasks: any[] = entry.log?.tasks?.length ? entry.log.tasks : entry.tasks;

        return (
          <div
            key={entry.dayNumber}
            className={`card ${status.label === "Today" ? "border-brand-500" : ""}`}
          >
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h3 className="font-semibold">
                Day {entry.dayNumber}{" "}
                <span className="text-slate-500 font-normal text-sm">· {entry.date}</span>
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">
                  {doneCount}/{totalCount} done
                </span>
                <span className={`text-xs font-semibold rounded-full px-2 py-1 ${status.className}`}>
                  {status.label}
                </span>
              </div>
            </div>
            <ul className="space-y-1">
              {displayTasks.map((t, i) => {
                const isDone = t.status === "done";
                const isSkipped = t.status === "skipped";
                return (
                  <li
                    key={i}
                    className={`text-sm flex items-center gap-2 ${
                      isDone
                        ? "text-slate-500 line-through"
                        : isSkipped
                        ? "text-slate-500 italic"
                        : "text-slate-300"
                    }`}
                  >
                    <span
                      className={`inline-block w-3.5 h-3.5 rounded-sm border shrink-0 ${
                        isDone
                          ? "bg-green-600 border-green-600"
                          : isSkipped
                          ? "bg-slate-700 border-slate-600"
                          : "border-slate-600"
                      }`}
                    />
                    <span>
                      {t.title}{" "}
                      <span className="text-slate-500">
                        ({t.resource}
                        {t.target ? `, ${t.target}` : ""})
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
