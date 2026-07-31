const MOODS: { key: string; emoji: string; label: string }[] = [
  { key: "great", emoji: "😊", label: "Great" },
  { key: "good", emoji: "🙂", label: "Good" },
  { key: "okay", emoji: "😐", label: "Okay" },
  { key: "difficult", emoji: "😞", label: "Difficult" },
];

/**
 * "Daily Mood" (Study Planner v1 item 9, optional) - one click, no
 * gamification beyond the emoji itself. Stored as plain text in
 * planner_entries.field_values.mood (same save flow as everything else in
 * the grid, via setCellValue passed down from PlannerGridClient) so
 * patterns show up over time without adding a new table.
 */
export default function MoodPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (mood: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {MOODS.map((m) => (
        <button
          key={m.key}
          type="button"
          disabled={disabled}
          onClick={() => onChange(value === m.key ? "" : m.key)}
          title={m.label}
          className={`text-2xl leading-none rounded-lg px-2 py-1.5 transition ${
            value === m.key ? "bg-brand-900/40 ring-1 ring-brand-500" : "hover:bg-slate-800"
          }`}
        >
          {m.emoji}
        </button>
      ))}
    </div>
  );
}
