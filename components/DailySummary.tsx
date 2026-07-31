/**
 * "Daily Summary" (Study Planner v1 item 3) - purely derived, read-only.
 * Nothing here is typed by the student a second time: Questions Completed
 * and Blocks come from whatever's logged in the UWorld Block Tracker for
 * this day (falling back to the daily row's own "Questions Completed"
 * field on days logged before block tracking existed, or for a student who
 * only ever fills in the daily row), Questions Reviewed/Hours mirror the
 * daily row's own fields, and Study Completed mirrors the Study Status
 * checkbox. Reflects whatever's currently drafted in the grid (including
 * unsaved edits), same as the rest of this row.
 */
export default function DailySummary({
  questionsCompleted,
  blocksCount,
  questionsReviewed,
  hours,
  studyCompleted,
}: {
  questionsCompleted: number | null;
  blocksCount: number;
  questionsReviewed: number | null;
  hours: number | null;
  studyCompleted: boolean;
}) {
  const stats: { label: string; value: string }[] = [
    { label: "Questions Completed", value: questionsCompleted !== null ? String(questionsCompleted) : "—" },
    { label: "Blocks", value: String(blocksCount) },
    { label: "Questions Reviewed", value: questionsReviewed !== null ? String(questionsReviewed) : "—" },
    { label: "Hours", value: hours !== null ? String(hours) : "—" },
    { label: "Study Completed", value: studyCompleted ? "Yes" : "No" },
  ];

  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Daily Summary</p>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="text-[11px] text-slate-500">{s.label}</p>
            <p
              className={`text-sm font-semibold ${
                s.label === "Study Completed" ? (studyCompleted ? "text-green-400" : "text-slate-300") : ""
              }`}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
