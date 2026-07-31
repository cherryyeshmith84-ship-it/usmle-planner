const ISSUES: { key: string; label: string }[] = [
  { key: "distraction", label: "Distraction" },
  { key: "fatigue", label: "Fatigue" },
  { key: "didnt_understand", label: "Didn't understand concepts" },
  { key: "didnt_finish", label: "Didn't finish questions" },
  { key: "burnout", label: "Burnout" },
  { key: "time_management", label: "Time management" },
];

/**
 * "Study Issues" (Study Planner v1 item 10) - single-select, so a mentor
 * can immediately see what happened without reading a paragraph. Stored as
 * plain text in planner_entries.field_values.study_issue, same save flow
 * as the rest of the grid (via setCellValue passed down from
 * PlannerGridClient). Already readable by the student's mentor via the
 * existing "Mentor views related student's planner entries" RLS policy.
 */
export default function StudyIssueSelector({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (issue: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid sm:grid-cols-2 gap-1.5">
      {ISSUES.map((issue) => (
        <label key={issue.key} className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="radio"
            name="study_issue"
            checked={value === issue.key}
            disabled={disabled}
            onChange={() => onChange(issue.key)}
            className="w-4 h-4"
          />
          {issue.label}
        </label>
      ))}
      {value && !disabled && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-xs text-slate-500 hover:text-slate-300 col-span-full text-left"
        >
          Clear
        </button>
      )}
    </div>
  );
}
