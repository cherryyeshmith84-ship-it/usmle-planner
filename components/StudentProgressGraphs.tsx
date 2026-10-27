"use client";

import { useMemo, useState } from "react";

export type GraphReport = {
  id: string;
  exam_name: string | null;
  exam_type: string | null;
  overall_percent: number | null;
  taken_date: string | null;
};

export type GraphBlock = {
  log_date: string | null;
  qbank: string | null;
  system: string | null;
  percentage: number | string | null;
  questions: number | string | null;
};

type Point = { date: string; value: number; label?: string };

const BANKS = ["UWorld", "Amboss", "Mehlman"] as const;

function toTime(d: string) {
  return new Date(d + "T00:00:00").getTime();
}

function fmtDate(d: string) {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function LineChart({ points, color }: { points: Point[]; color: string }) {
  const W = 720;
  const H = 260;
  const L = 44;
  const R = 16;
  const T = 14;
  const B = 36;
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return <p className="text-sm text-slate-500 py-8 text-center">No data yet.</p>;
  }

  const times = points.map((p) => toTime(p.date));
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const span = maxT - minT;
  const x = (t: number) => (span === 0 ? (L + W - R) / 2 : L + ((t - minT) / span) * (W - L - R));
  const y = (v: number) => T + (1 - Math.max(0, Math.min(100, v)) / 100) * (H - T - B);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(times[i]).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");

  // x-axis ticks: up to 6 evenly spaced actual data dates
  const tickCount = Math.min(6, points.length);
  const tickIdx = new Set<number>();
  for (let i = 0; i < tickCount; i++) {
    tickIdx.add(tickCount === 1 ? 0 : Math.round((i * (points.length - 1)) / (tickCount - 1)));
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img">
        {[0, 20, 40, 60, 80, 100].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#334155" strokeWidth={0.6} strokeDasharray={v === 0 ? "" : "3 3"} />
            <text x={L - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="#94a3b8">
              {v}%
            </text>
          </g>
        ))}
        {Array.from(tickIdx).map((i) => (
          <text key={i} x={x(times[i])} y={H - 14} textAnchor="middle" fontSize={10} fill="#94a3b8">
            {fmtDate(points[i].date)}
          </text>
        ))}
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(times[i])}
            cy={y(p.value)}
            r={hover === i ? 5 : 3.5}
            fill={color}
            stroke="#0f172a"
            strokeWidth={1}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        {hover !== null && (
          <g>
            <text
              x={Math.min(Math.max(x(times[hover]), L + 60), W - R - 60)}
              y={Math.max(y(points[hover].value) - 10, 12)}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill="#e2e8f0"
            >
              {points[hover].value}% · {fmtDate(points[hover].date)}
              {points[hover].label ? ` · ${points[hover].label}` : ""}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

type Trend = "improving" | "declining" | "fluctuating" | "steady" | "few";

function classify(values: number[]): Trend {
  if (values.length < 2) return "few";
  const n = values.length;
  const k = Math.max(1, Math.floor(n / 3));
  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const change = avg(values.slice(n - k)) - avg(values.slice(0, k));
  const diffs = values.slice(1).map((v, i) => Math.abs(v - values[i]));
  const avgSwing = avg(diffs);
  if (avgSwing >= 10 && Math.abs(change) < 8) return "fluctuating";
  if (change >= 3) return "improving";
  if (change <= -3) return "declining";
  if (avgSwing >= 8) return "fluctuating";
  return "steady";
}

const TREND_UI: Record<Trend, { label: string; cls: string }> = {
  improving: { label: "↑ Improving", cls: "text-green-400" },
  declining: { label: "↓ Declining", cls: "text-red-400" },
  fluctuating: { label: "↕ Fluctuating", cls: "text-yellow-400" },
  steady: { label: "→ Steady", cls: "text-slate-400" },
  few: { label: "Not enough data", cls: "text-slate-500" },
};

/** Per-day average % across blocks, weighted by number of questions. */
function dailySeries(blocks: GraphBlock[]): Point[] {
  const byDay = new Map<string, { sum: number; w: number }>();
  for (const b of blocks) {
    const pct = b.percentage === null || b.percentage === undefined ? NaN : Number(b.percentage);
    if (!b.log_date || !isFinite(pct)) continue;
    const q = Number(b.questions);
    const w = isFinite(q) && q > 0 ? q : 1;
    const cur = byDay.get(b.log_date) ?? { sum: 0, w: 0 };
    cur.sum += pct * w;
    cur.w += w;
    byDay.set(b.log_date, cur);
  }
  return Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, value: Math.round((v.sum / v.w) * 10) / 10 }));
}

export default function StudentProgressGraphs({
  reports,
  blocks,
}: {
  reports: GraphReport[];
  blocks: GraphBlock[];
}) {
  const [bank, setBank] = useState<string>("UWorld");
  const [system, setSystem] = useState<string>("");

  // ---- Exam graph ----
  const examPoints: Point[] = useMemo(
    () =>
      reports
        .filter((r) => r.taken_date && r.overall_percent !== null && r.overall_percent !== undefined && isFinite(Number(r.overall_percent)))
        .sort((a, b) => (a.taken_date ?? "").localeCompare(b.taken_date ?? ""))
        .map((r) => ({
          date: r.taken_date as string,
          value: Math.round(Number(r.overall_percent) * 10) / 10,
          label: r.exam_name ?? undefined,
        })),
    [reports]
  );
  const examTrend = classify(examPoints.map((p) => p.value));

  // ---- Qbank graph ----
  // Blocks logged without a qbank name are counted as UWorld (the default).
  const bankBlocks = useMemo(
    () => blocks.filter((b) => (b.qbank || "UWorld").toLowerCase() === bank.toLowerCase()),
    [blocks, bank]
  );
  const bankPoints = useMemo(() => dailySeries(bankBlocks), [bankBlocks]);
  const bankTrend = classify(bankPoints.map((p) => p.value));
  const bankQuestions = bankBlocks.reduce((s, b) => s + (Number(b.questions) || 0), 0);

  // ---- By system ----
  const systemRows = useMemo(() => {
    const groups = new Map<string, GraphBlock[]>();
    for (const b of bankBlocks) {
      const s = (b.system || "").trim();
      if (!s) continue;
      if (!groups.has(s)) groups.set(s, []);
      groups.get(s)!.push(b);
    }
    return Array.from(groups.entries())
      .map(([name, bl]) => {
        const pts = dailySeries(bl);
        const q = bl.reduce((s, b) => s + (Number(b.questions) || 0), 0);
        const avg = pts.length ? Math.round((pts.reduce((s, p) => s + p.value, 0) / pts.length) * 10) / 10 : null;
        return {
          name,
          pts,
          questions: q,
          avg,
          latest: pts.length ? pts[pts.length - 1].value : null,
          trend: classify(pts.map((p) => p.value)),
        };
      })
      .filter((r) => r.pts.length > 0)
      .sort((a, b) => b.pts.length - a.pts.length || a.name.localeCompare(b.name));
  }, [bankBlocks]);

  const activeSystem = systemRows.find((r) => r.name === system) ?? systemRows[0] ?? null;

  return (
    <div className="space-y-4">
      {/* Exam graph */}
      <div className="card">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
          <div>
            <p className="text-sm font-semibold">Exam graph</p>
            <p className="text-xs text-slate-500">Overall score of each uploaded exam, by date taken.</p>
          </div>
          <span className={`text-xs font-semibold ${TREND_UI[examTrend].cls}`}>{TREND_UI[examTrend].label}</span>
        </div>
        <LineChart points={examPoints} color="#818cf8" />
      </div>

      {/* Qbank graph */}
      <div className="card">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
          <div>
            <p className="text-sm font-semibold">Qbank graph</p>
            <p className="text-xs text-slate-500">
              Daily average % from logged blocks{bankQuestions > 0 ? ` · ${bankQuestions} questions` : ""}.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-semibold ${TREND_UI[bankTrend].cls}`}>{TREND_UI[bankTrend].label}</span>
            <select
              value={bank}
              onChange={(e) => {
                setBank(e.target.value);
                setSystem("");
              }}
              className="input text-sm py-1"
            >
              {BANKS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        </div>
        {bankPoints.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">No {bank} blocks with a score logged yet.</p>
        ) : (
          <LineChart points={bankPoints} color="#34d399" />
        )}
      </div>

      {/* By system */}
      <div className="card">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
          <div>
            <p className="text-sm font-semibold">{bank} by system</p>
            <p className="text-xs text-slate-500">Is each system improving or fluctuating? Pick a system to see its graph.</p>
          </div>
          {systemRows.length > 0 && (
            <select
              value={activeSystem?.name ?? ""}
              onChange={(e) => setSystem(e.target.value)}
              className="input text-sm py-1"
            >
              {systemRows.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {!activeSystem ? (
          <p className="text-sm text-slate-500 py-8 text-center">No system-wise {bank} blocks logged yet.</p>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-xs text-slate-400">{activeSystem.name}</span>
              <span className={`text-xs font-semibold ${TREND_UI[activeSystem.trend].cls}`}>
                {TREND_UI[activeSystem.trend].label}
              </span>
            </div>
            <LineChart points={activeSystem.pts} color="#fbbf24" />
            <div className="overflow-x-auto mt-4">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pr-3 py-1">System</th>
                    <th className="px-2 py-1">Days</th>
                    <th className="px-2 py-1">Questions</th>
                    <th className="px-2 py-1">Average</th>
                    <th className="px-2 py-1">Latest</th>
                    <th className="px-2 py-1">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {systemRows.map((r) => (
                    <tr
                      key={r.name}
                      className="border-t border-slate-800 cursor-pointer hover:bg-slate-800/40"
                      onClick={() => setSystem(r.name)}
                    >
                      <td className="pr-3 py-1.5 text-slate-300 whitespace-nowrap">{r.name}</td>
                      <td className="px-2 py-1.5">{r.pts.length}</td>
                      <td className="px-2 py-1.5">{r.questions || "-"}</td>
                      <td className="px-2 py-1.5">{r.avg !== null ? `${r.avg}%` : "-"}</td>
                      <td className="px-2 py-1.5">{r.latest !== null ? `${r.latest}%` : "-"}</td>
                      <td className={`px-2 py-1.5 font-semibold ${TREND_UI[r.trend].cls}`}>{TREND_UI[r.trend].label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
