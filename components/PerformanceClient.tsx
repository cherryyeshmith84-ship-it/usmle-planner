"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  EXAM_TYPE_LABEL,
  computeSystemStrengths,
  systemTrends,
  type ScoreReport,
} from "@/lib/scoreReports";
import { compareContentBreakdowns, type ContentAreaStat } from "@/lib/questionLevelReports";
import ScoreReportUpload from "./ScoreReportUpload";
import QuestionLevelReportUpload from "./QuestionLevelReportUpload";

/** Finds the most recent OTHER question-level report before this one (by
 *  taken_date), for the "vs. your last question-level upload" comparison -
 *  falls back to whichever other one exists if dates are missing/tied. */
function previousQuestionLevelReport(all: ScoreReport[], current: ScoreReport): ScoreReport | null {
  const others = all.filter(
    (r) => r.exam_type === "question_level" && r.id !== current.id && r.content_breakdown
  );
  if (others.length === 0) return null;
  const sorted = [...others].sort((a, b) => (a.taken_date ?? "").localeCompare(b.taken_date ?? ""));
  const currentDate = current.taken_date ?? "";
  const before = sorted.filter((r) => (r.taken_date ?? "") < currentDate);
  return before.length > 0 ? before[before.length - 1] : sorted[sorted.length - 1];
}

function scoreBadgeClass(pct: number | null) {
  if (pct === null) return "bg-slate-800 text-slate-300";
  if (pct >= 75) return "bg-green-900/40 text-green-400";
  if (pct >= 60) return "bg-yellow-900/40 text-yellow-400";
  if (pct >= 45) return "bg-orange-900/40 text-orange-400";
  return "bg-red-900/40 text-red-400";
}

const TREND_LABEL: Record<string, string> = {
  improving: "Improving",
  declining: "Declining",
  flat: "Steady",
  unknown: "Not enough data",
};

const TREND_CLASS: Record<string, string> = {
  improving: "text-green-400",
  declining: "text-red-400",
  flat: "text-slate-400",
  unknown: "text-slate-500",
};

/**
 * Replaces the old plain daily-log list on the Performance page. Built
 * entirely from score_reports (NBME/UWSA/Free120/UWorld self-assessment
 * uploads, see ScoreReportUpload.tsx): current weak/strong systems, a
 * system-by-report comparison table, an AI-generated coaching note, and the
 * upload flow itself.
 */
export default function PerformanceClient({
  userId,
  initialReports,
}: {
  userId: string;
  initialReports: ScoreReport[];
}) {
  const router = useRouter();
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const reports = initialReports;
  const strengths = useMemo(() => computeSystemStrengths(reports), [reports]);
  const trends = useMemo(() => systemTrends(reports), [reports]);
  const weakest = strengths.slice(0, 5);
  const strongest = [...strengths].reverse().slice(0, 3);

  const sortedReports = useMemo(
    () => [...reports].sort((a, b) => (b.taken_date ?? "").localeCompare(a.taken_date ?? "")),
    [reports]
  );
  const comparisonReports = useMemo(
    () => [...reports].sort((a, b) => (a.taken_date ?? "").localeCompare(b.taken_date ?? "")).slice(-8),
    [reports]
  );

  // On load, just check whether we already have a cached suggestion for
  // this student - this is a plain DB read, it never calls the (shared,
  // quota-limited) Gemini API, so it's free to run automatically.
  useEffect(() => {
    if (reports.length === 0) return;
    (async () => {
      try {
        const res = await fetch("/api/score-report/suggestions");
        const json = await res.json();
        if (res.ok && json.suggestion) setSuggestion(json.suggestion);
      } catch {
        // Silent - the button is still there if this fails.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function getSuggestion(force = false) {
    setLoadingSuggestion(true);
    setSuggestionError(null);
    try {
      const res = await fetch("/api/score-report/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSuggestionError(json.error || "Couldn't generate a suggestion.");
      } else {
        setSuggestion(json.suggestion);
      }
    } catch (e: any) {
      setSuggestionError(e.message || "Couldn't reach the AI.");
    }
    setLoadingSuggestion(false);
  }

  async function deleteReport(id: string) {
    if (!confirm("Delete this score report? This can't be undone.")) return;
    const supabase = createClient();
    await supabase.from("score_reports").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <ScoreReportUpload userId={userId} />
      <QuestionLevelReportUpload userId={userId} />

      {reports.length === 0 ? (
        <div className="card">
          <p className="text-sm text-slate-400">
            Upload your first NBME, UWSA, Free 120, or UWorld self-assessment result above to start
            tracking your weak and strong systems over time.
          </p>
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="card">
              <p className="text-sm font-semibold mb-3">Weakest systems right now</p>
              <div className="space-y-2">
                {weakest.map((s) => (
                  <div key={s.system} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-300 truncate">{s.system}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs ${TREND_CLASS[s.trend]}`}>{TREND_LABEL[s.trend]}</span>
                      <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${scoreBadgeClass(s.averagePercent)}`}>
                        {s.averagePercent}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <p className="text-sm font-semibold mb-3">Strongest systems</p>
              <div className="space-y-2">
                {strongest.map((s) => (
                  <div key={s.system} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-300 truncate">{s.system}</span>
                    <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${scoreBadgeClass(s.averagePercent)}`}>
                      {s.averagePercent}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">AI suggestions</p>
              <button
                type="button"
                onClick={() => getSuggestion(!!suggestion)}
                disabled={loadingSuggestion}
                className="btn-secondary text-xs"
              >
                {loadingSuggestion ? "Thinking..." : suggestion ? "Refresh" : "Get suggestions"}
              </button>
            </div>
            {suggestionError && <p className="text-xs text-red-400">{suggestionError}</p>}
            {suggestion && <p className="text-sm text-slate-300 whitespace-pre-line">{suggestion}</p>}
            {!suggestion && !suggestionError && (
              <p className="text-xs text-slate-500">
                Generates a short note on what to prioritize based on your score history. Reused
                automatically until you add a new report or hit Refresh, so it doesn't burn through
                the shared AI quota.
              </p>
            )}
          </div>

          {comparisonReports.length > 1 && (
            <div className="card overflow-x-auto">
              <p className="text-sm font-semibold mb-3">Progress by system</p>
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pr-3 py-1">System</th>
                    {comparisonReports.map((r) => (
                      <th key={r.id} className="px-2 py-1 whitespace-nowrap">
                        {r.taken_date ?? "?"}
                        <br />
                        <span className="text-slate-600">{r.exam_name}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {strengths.map((s) => (
                    <tr key={s.system} className="border-t border-slate-800">
                      <td className="pr-3 py-1.5 text-slate-300 whitespace-nowrap">{s.system}</td>
                      {comparisonReports.map((r) => {
                        const pct = r.system_breakdown?.[s.system];
                        return (
                          <td key={r.id} className="px-2 py-1.5 text-center">
                            {typeof pct === "number" ? (
                              <span className={`rounded-full px-1.5 py-0.5 ${scoreBadgeClass(pct)}`}>{pct}</span>
                            ) : (
                              <span className="text-slate-700">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-semibold">Score report history</p>
            {sortedReports.map((r) => {
              const expanded = expandedId === r.id;
              return (
                <div key={r.id} className="card">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-semibold">
                        {r.exam_name}{" "}
                        <span className="text-xs font-normal text-slate-500">
                          &middot; {EXAM_TYPE_LABEL[r.exam_type]}
                        </span>
                      </p>
                      <p className="text-xs text-slate-400">{r.taken_date ?? "No date"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {(r.overall_percent !== null || r.overall_score !== null) && (
                        <span className={`text-sm font-semibold rounded-full px-3 py-1 ${scoreBadgeClass(r.overall_percent)}`}>
                          {r.overall_percent !== null ? `${r.overall_percent}%` : r.overall_score}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : r.id)}
                        className="text-xs text-brand-400 hover:text-brand-300 font-medium"
                      >
                        {expanded ? "Hide" : "Systems"}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteReport(r.id)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {expanded && (
                    <div className="mt-3 space-y-4">
                      <div className="grid sm:grid-cols-2 gap-1.5">
                        {Object.entries(r.system_breakdown ?? {}).length === 0 ? (
                          <p className="text-xs text-slate-500">No per-system breakdown saved for this one.</p>
                        ) : (
                          Object.entries(r.system_breakdown).map(([system, pct]) => (
                            <div key={system} className="flex items-center justify-between gap-2">
                              <span className="text-xs text-slate-400 truncate">{system}</span>
                              <span className={`text-xs font-semibold rounded-full px-2 py-0.5 shrink-0 ${scoreBadgeClass(pct)}`}>
                                {pct}%
                              </span>
                            </div>
                          ))
                        )}
                      </div>

                      {r.exam_type === "question_level" &&
                        r.content_breakdown &&
                        Object.keys(r.content_breakdown).length > 0 &&
                        (() => {
                          const entries = Object.entries(r.content_breakdown) as [string, ContentAreaStat][];
                          const weakestTopics = [...entries].sort((a, b) => a[1].percent - b[1].percent).slice(0, 6);
                          const prev = previousQuestionLevelReport(reports, r);
                          const comparison =
                            prev?.content_breakdown && r.content_breakdown
                              ? compareContentBreakdowns(prev.content_breakdown, r.content_breakdown)
                              : null;
                          const improved = comparison?.filter((c) => c.delta > 0) ?? [];
                          const declined = comparison?.filter((c) => c.delta < 0) ?? [];

                          return (
                            <div className="pt-3 border-t border-slate-800 space-y-3">
                              <div>
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                                  Specific weak topics
                                </p>
                                <div className="space-y-1">
                                  {weakestTopics.map(([key, stat]) => (
                                    <div key={key} className="flex items-center justify-between gap-2">
                                      <span className="text-xs text-slate-400 truncate" title={key}>
                                        {stat.subtopic}
                                        {stat.system ? ` (${stat.system})` : ""}
                                      </span>
                                      <span
                                        className={`text-xs font-semibold rounded-full px-2 py-0.5 shrink-0 ${scoreBadgeClass(stat.percent)}`}
                                      >
                                        {stat.correct}/{stat.total}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {comparison && comparison.length > 0 && prev && (
                                <div>
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                                    Vs. {prev.exam_name} ({prev.taken_date ?? "no date"})
                                  </p>
                                  <p className="text-xs text-slate-500 mb-1.5">
                                    {improved.length} topic{improved.length === 1 ? "" : "s"} improved,{" "}
                                    {declined.length} declined (matched by exact topic name).
                                  </p>
                                  {declined.slice(0, 3).map((c) => (
                                    <p key={c.key} className="text-xs text-red-400">
                                      &darr; {c.subtopic}: {c.previousPercent}% &rarr; {c.currentPercent}%
                                    </p>
                                  ))}
                                  {[...improved]
                                    .reverse()
                                    .slice(0, 3)
                                    .map((c) => (
                                      <p key={c.key} className="text-xs text-green-400">
                                        &uarr; {c.subtopic}: {c.previousPercent}% &rarr; {c.currentPercent}%
                                      </p>
                                    ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
