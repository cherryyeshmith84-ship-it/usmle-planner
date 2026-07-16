"use client";

import { useMemo, useState } from "react";
import type { SystemGridStat } from "@/lib/masteryDashboard";

function pctColorClass(pct: number, total: number) {
  if (total === 0) return "text-slate-500";
  if (pct >= 75) return "text-green-400";
  if (pct >= 60) return "text-yellow-400";
  if (pct >= 45) return "text-orange-400";
  return "text-red-400";
}

function trendArrow(trend: "up" | "down" | "flat") {
  if (trend === "up") return <span className="text-green-400">&uarr;</span>;
  if (trend === "down") return <span className="text-red-400">&darr;</span>;
  return <span className="text-slate-500">&rarr;</span>;
}

interface Row {
  label: string;
  correct: number;
  total: number;
  pct: number;
  trend?: "up" | "down" | "flat";
}

function RowList({
  rows,
  onSelect,
  emptyMessage,
}: {
  rows: Row[];
  onSelect?: (label: string) => void;
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400 py-4">{emptyMessage}</p>;
  }
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-500 uppercase tracking-wide px-1 mb-1">
        <span>Name</span>
        <span className="flex items-center gap-8">
          <span>Mastery</span>
          {rows.some((r) => r.trend) && <span>Trend</span>}
        </span>
      </div>
      {rows.map((r) => {
        const clickable = !!onSelect;
        const Wrapper = clickable ? "button" : "div";
        return (
          <Wrapper
            key={r.label}
            type={clickable ? "button" : undefined}
            onClick={clickable ? () => onSelect!(r.label) : undefined}
            className={`w-full flex items-center justify-between px-1 py-2.5 border-t border-slate-800 text-sm text-left ${
              clickable ? "hover:bg-slate-800/60 transition rounded" : ""
            }`}
          >
            <span className="text-slate-200">
              {r.label}
              {r.total > 0 && <span className="text-slate-500 text-xs ml-2">({r.total}q)</span>}
            </span>
            <span className="flex items-center gap-8 shrink-0">
              <span className={`font-semibold w-10 text-right ${pctColorClass(r.pct, r.total)}`}>
                {r.total > 0 ? `${r.pct}%` : "—"}
              </span>
              {r.trend && <span className="w-4 text-center">{trendArrow(r.trend)}</span>}
              {clickable && <span className="text-slate-600 w-3 text-center">&rsaquo;</span>}
            </span>
          </Wrapper>
        );
      })}
    </div>
  );
}

/**
 * Interactive System -> Topic -> Concept drill-down. All the data is
 * computed once server-side (computeMasteryGrid) and handed down as props -
 * this component just manages which level the student has clicked into,
 * no extra data fetching.
 */
export default function MasteryGridClient({
  allSystems,
  grid,
}: {
  allSystems: readonly string[];
  grid: SystemGridStat[];
}) {
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  const gridBySystem = useMemo(() => new Map(grid.map((g) => [g.system, g])), [grid]);

  const systemRows: Row[] = allSystems.map((system) => {
    const g = gridBySystem.get(system);
    return {
      label: system,
      correct: g?.correct ?? 0,
      total: g?.total ?? 0,
      pct: g?.pct ?? 0,
      trend: g?.trend ?? "flat",
    };
  });

  const currentSystem = selectedSystem ? gridBySystem.get(selectedSystem) : null;
  const topicRows: Row[] = (currentSystem?.topics ?? []).map((t) => ({
    label: t.topic,
    correct: t.correct,
    total: t.total,
    pct: t.pct,
  }));

  const currentTopic = currentSystem?.topics.find((t) => t.topic === selectedTopic) ?? null;
  const conceptRows: Row[] = (currentTopic?.concepts ?? []).map((c) => ({
    label: c.concept,
    correct: c.correct,
    total: c.total,
    pct: c.pct,
  }));

  return (
    <div className="card">
      <div className="flex items-center gap-1.5 text-sm mb-4 flex-wrap">
        <button
          type="button"
          onClick={() => {
            setSelectedSystem(null);
            setSelectedTopic(null);
          }}
          className={`font-medium ${
            !selectedSystem ? "text-white" : "text-brand-400 hover:text-brand-300"
          }`}
        >
          All systems
        </button>
        {selectedSystem && (
          <>
            <span className="text-slate-600">/</span>
            <button
              type="button"
              onClick={() => setSelectedTopic(null)}
              className={`font-medium ${
                selectedSystem && !selectedTopic ? "text-white" : "text-brand-400 hover:text-brand-300"
              }`}
            >
              {selectedSystem}
            </button>
          </>
        )}
        {selectedTopic && (
          <>
            <span className="text-slate-600">/</span>
            <span className="font-medium text-white">{selectedTopic}</span>
          </>
        )}
      </div>

      {!selectedSystem && (
        <RowList
          rows={systemRows}
          onSelect={(system) => setSelectedSystem(system)}
          emptyMessage="No systems tagged yet."
        />
      )}

      {selectedSystem && !selectedTopic && (
        <RowList
          rows={topicRows}
          onSelect={topicRows.length > 0 ? (topic) => setSelectedTopic(topic) : undefined}
          emptyMessage="No topics tagged for this system yet - tag questions with a Topic in the question editor to break this down further."
        />
      )}

      {selectedSystem && selectedTopic && (
        <RowList
          rows={conceptRows}
          emptyMessage="No concepts tagged for this topic yet - tag questions with a Primary concept in the question editor to break this down further."
        />
      )}
    </div>
  );
}
