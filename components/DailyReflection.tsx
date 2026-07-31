/**
 * "Daily Reflection" - the signature feature of Study Planner v1. Three
 * short prompts a student answers at the end of each day (What went well /
 * What slowed you down / What will you improve tomorrow), sitting alongside
 * the free-text Student Notes journal but structured enough that a mentor
 * scanning several days can actually spot a pattern (e.g. "fatigue" showing
 * up under "What slowed you down" three days running). Each prompt is its
 * own planner_columns field (reflection_went_well / reflection_slowed_down /
 * reflection_improve), saved with the rest of the day via the grid's normal
 * "Save changes" flow - nothing new to submit separately.
 */
export default function DailyReflection({
  wentWell,
  slowedDown,
  improve,
  onChangeWentWell,
  onChangeSlowedDown,
  onChangeImprove,
  disabled,
}: {
  wentWell: string;
  slowedDown: string;
  improve: string;
  onChangeWentWell: (v: string) => void;
  onChangeSlowedDown: (v: string) => void;
  onChangeImprove: (v: string) => void;
  disabled?: boolean;
}) {
  const prompts: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
  }[] = [
    {
      label: "What went well?",
      value: wentWell,
      onChange: onChangeWentWell,
      placeholder: "A win from today - a system you nailed, a habit you kept...",
    },
    {
      label: "What slowed you down?",
      value: slowedDown,
      onChange: onChangeSlowedDown,
      placeholder: "Distraction, fatigue, a tough topic...",
    },
    {
      label: "What will you improve tomorrow?",
      value: improve,
      onChange: onChangeImprove,
      placeholder: "One concrete change for tomorrow...",
    },
  ];

  return (
    <div className="grid sm:grid-cols-3 gap-3">
      {prompts.map((p) => (
        <div key={p.label}>
          <label className="block text-[11px] text-slate-500 mb-1">{p.label}</label>
          <textarea
            value={p.value}
            disabled={disabled}
            onChange={(e) => p.onChange(e.target.value)}
            rows={2}
            placeholder={p.placeholder}
            className="input text-sm py-1.5 px-2 w-full resize-y text-slate-100"
          />
        </div>
      ))}
    </div>
  );
}
