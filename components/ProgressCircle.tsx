export default function ProgressCircle({
  pct,
  complete,
  size = 88,
  label,
}: {
  pct: number;
  complete?: boolean;
  size?: number;
  label?: string;
}) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = circumference * (1 - clamped / 100);
  const color = complete ? "#22c55e" : "#2b5bf5";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#1f2937"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.3s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-white">{clamped}%</span>
        </div>
      </div>
      {label && <span className="text-xs text-slate-400 text-center">{label}</span>}
    </div>
  );
}
