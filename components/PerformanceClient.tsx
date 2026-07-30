"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  EXAM_TYPE_LABEL,
  SYSTEM_TARGET_PERCENT,
  computeDisciplineStrengths,
  computeImmediateExamReview,
  computeSystemStrengths,
  systemTrends,
  type AiExamReview,
  type ScoreReport,
} from "@/lib/scoreReports";
import { compareContentBreakdowns, type ContentAreaStat } from "@/lib/questionLevelReports";
import { STEP1_SUBJECTS, STEP1_SYSTEMS } from "@/lib/qbankTypes";
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

/** Small up/down chevron for the maximize/minimize buttons on the "Progress
 *  by ..." tables - points up (^) when the table is open (click to
 *  collapse), rotates to point down when it's collapsed (click to expand). */
function ChevronToggle({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={`w-4 h-4 transition-transform duration-150 ${open ? "" : "rotate-180"}`}
    >
      <path
        d="M5 12l5-5 5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
  myMentor,
  mentorStudyPlan,
}: {
  userId: string;
  initialReports: ScoreReport[];
  // The student's own mentor, resolved server-side (app/history/page.tsx)
  // from an existing booked session or message thread - null if the student
  // has no mentor relationship yet, in which case "Discuss With Mentor"
  // routes to the mentor directory instead of a specific profile.
  myMentor?: { id: string; name: string | null } | null;
  // A mentor-authored study plan (see StudyPlanEditor.tsx / mentor_study_plans
  // table) - when present, this fully replaces the computed "Default AI Study
  // Plan" below. Null until a mentor writes one; disappears again if they
  // remove it.
  mentorStudyPlan?: { content: string; updatedAt: string; mentorName: string | null } | null;
}) {
  const router = useRouter();
  const [aiReview, setAiReview] = useState<AiExamReview | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Maximize/minimize toggles for the three "Progress by ..." tables below -
  // each defaults open, but with 13+ reports as columns these can get wide
  // and tall, so a student can collapse the ones they're not looking at
  // right now without losing their place on the page.
  const [systemTableOpen, setSystemTableOpen] = useState(true);
  const [disciplineTableOpen, setDisciplineTableOpen] = useState(true);
  const [topicTableOpen, setTopicTableOpen] = useState(true);
  // "Progress by system" table controls - default sort matches the existing
  // weakest-first order computeSystemStrengths already returns; the other
  // two re-sort by how much each system's percent moved from its first to
  // its most recent regular report (see systemDelta below), not just its
  // rolling average, so a system that's swinging hard shows up even if its
  // average still looks middling. expandedSystemHistory drives the
  // click-a-system-to-see-full-history row.
  const [systemSort, setSystemSort] = useState<"weakest" | "declining" | "improving">("weakest");
  const [expandedSystemHistory, setExpandedSystemHistory] = useState<string | null>(null);
  // Compare Exams - which two regular (non-question-level) reports to diff.
  // Null until the student picks one explicitly, in which case the default
  // below (previous vs. latest) is used - same pair Immediate Exam Review
  // already compares, so Compare Exams starts out showing the same story in
  // more detail rather than something that looks unrelated.
  const [compareAId, setCompareAId] = useState<string | null>(null);
  const [compareBId, setCompareBId] = useState<string | null>(null);

  const reports = initialReports;
  const immediateReview = useMemo(() => computeImmediateExamReview(reports), [reports]);
  const strengths = useMemo(() => computeSystemStrengths(reports), [reports]);
  const trends = useMemo(() => systemTrends(reports), [reports]);
  const weakest = strengths.slice(0, 5);
  const strongest = [...strengths].reverse().slice(0, 3);

  // Same idea as strengths/weakest/strongest above, but ranking Disciplines
  // (Anatomy, Pathology, Pharmacology, etc.) - the other axis reports break
  // performance down by, alongside System.
  const disciplineStrengths = useMemo(() => computeDisciplineStrengths(reports), [reports]);
  const weakestDisciplines = disciplineStrengths.slice(0, 5);
  const strongestDisciplines = [...disciplineStrengths].reverse().slice(0, 3);

  const sortedReports = useMemo(
    () => [...reports].sort((a, b) => (b.taken_date ?? "").localeCompare(a.taken_date ?? "")),
    [reports]
  );
  // Question-level reports (per-question feedback PDFs) are a different
  // kind of upload from a regular single-table score report, so they get
  // their own list in the history section instead of being mixed in.
  const regularReports = useMemo(
    () => sortedReports.filter((r) => r.exam_type !== "question_level"),
    [sortedReports]
  );
  const questionLevelReportsList = useMemo(
    () => sortedReports.filter((r) => r.exam_type === "question_level"),
    [sortedReports]
  );
  // Same reports, oldest first - column order for the "Progress by topic"
  // table below, matching the left-to-right convention of the other
  // progress tables.
  const questionLevelColumns = useMemo(
    () => [...questionLevelReportsList].sort((a, b) => (a.taken_date ?? "").localeCompare(b.taken_date ?? "")),
    [questionLevelReportsList]
  );
  // Every REGULAR (non-question-level) report, oldest first, for the
  // "Progress by system" table - previously this included question-level
  // reports too and was capped to the last 8 with .slice(-8) (why only 8 of
  // 13 submitted reports ever showed up). Question-level reports get their
  // own separate topic-level table below instead of being mixed into this
  // one, since a single system percent from a question-level report is a
  // coarser rollup of the same data that table already shows per-topic.
  const comparisonReports = useMemo(
    () =>
      [...regularReports].sort((a, b) => (a.taken_date ?? "").localeCompare(b.taken_date ?? "")),
    [regularReports]
  );
  // Row list for that same table - system strengths computed from regular
  // reports only, so a system that only ever appeared in a question-level
  // upload doesn't show up as an all-dashes row here.
  const regularStrengths = useMemo(() => computeSystemStrengths(regularReports), [regularReports]);
  // Same, but for the "Progress by discipline" table below it.
  const regularDisciplineStrengths = useMemo(
    () => computeDisciplineStrengths(regularReports),
    [regularReports]
  );

  // How much a system's percent moved from its first to its most recent
  // appearance across comparisonReports (same columns the table shows) -
  // used by the "Most declining"/"Most improving" sort options below. Null
  // when a system has fewer than 2 data points, so it sorts as "no real
  // movement" rather than a false zero.
  function systemDelta(system: string): number | null {
    const vals = comparisonReports
      .map((r) => r.system_breakdown?.[system])
      .filter((v): v is number => typeof v === "number");
    if (vals.length < 2) return null;
    return vals[vals.length - 1] - vals[0];
  }

  const sortedSystemRows = useMemo(() => {
    if (systemSort === "weakest") return regularStrengths;
    const withDelta = regularStrengths.map((s) => ({ s, delta: systemDelta(s.system) ?? 0 }));
    withDelta.sort((a, b) => (systemSort === "declining" ? a.delta - b.delta : b.delta - a.delta));
    return withDelta.map((x) => x.s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regularStrengths, systemSort, comparisonReports]);

  // Compare Exams - defaults to the same previous-vs-latest pair Immediate
  // Exam Review already uses (comparisonReports is oldest-first, so [-2]/[-1]
  // are previous/latest) until the student explicitly picks two reports.
  const compareA = useMemo(
    () => comparisonReports.find((r) => r.id === compareAId) ?? comparisonReports[comparisonReports.length - 2] ?? null,
    [comparisonReports, compareAId]
  );
  const compareB = useMemo(
    () => comparisonReports.find((r) => r.id === compareBId) ?? comparisonReports[comparisonReports.length - 1] ?? null,
    [comparisonReports, compareBId]
  );
  interface CompareRow {
    category: string;
    from: number;
    to: number;
    delta: number;
  }
  function buildCompareRows(categories: readonly string[], breakdown: (r: ScoreReport) => Record<string, number> | null | undefined): CompareRow[] {
    if (!compareA || !compareB) return [];
    const rows: CompareRow[] = [];
    for (const category of categories) {
      const from = breakdown(compareA)?.[category];
      const to = breakdown(compareB)?.[category];
      if (typeof from === "number" && typeof to === "number") {
        rows.push({ category, from, to, delta: to - from });
      }
    }
    // Biggest movers first, regardless of direction - that's the whole point
    // of a comparison view, as opposed to the weakest-first convention used
    // elsewhere on this page.
    return rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }
  const compareSystemRows = useMemo(
    () => buildCompareRows(STEP1_SYSTEMS, (r) => r.system_breakdown),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [compareA, compareB]
  );
  const compareDisciplineRows = useMemo(
    () => buildCompareRows(STEP1_SUBJECTS, (r) => r.discipline_breakdown),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [compareA, compareB]
  );

  interface TopicRow {
    key: string;
    subtopic: string;
    percents: Record<string, number>;
  }
  // Groups every specific topic (content_breakdown entry) across every
  // question-level report upload, by canonical system, for a dedicated
  // topic-level progress table - the score-reports table above only ever
  // has one number per system, so this is the "in that subtopic there
  // should be topics" breakdown instead.
  const questionLevelTopicGroups = useMemo(() => {
    const bySystem: Record<string, Record<string, TopicRow>> = {};
    for (const r of questionLevelReportsList) {
      if (!r.content_breakdown) continue;
      for (const [key, stat] of Object.entries(r.content_breakdown)) {
        const system = stat.system ?? "Unmapped";
        bySystem[system] ??= {};
        bySystem[system][key] ??= { key, subtopic: stat.subtopic, percents: {} };
        bySystem[system][key].percents[r.id] = stat.percent;
      }
    }
    const systemOrder = [...STEP1_SYSTEMS, "Unmapped"];
    return systemOrder
      .filter((sys) => bySystem[sys])
      .map((sys) => {
        const topics = Object.values(bySystem[sys]).sort((a, b) => {
          const aVals = Object.values(a.percents);
          const bVals = Object.values(b.percents);
          const aLast = aVals[aVals.length - 1] ?? 100;
          const bLast = bVals[bVals.length - 1] ?? 100;
          return aLast - bLast;
        });
        return { system: sys, topics };
      });
  }, [questionLevelReportsList]);

  // On load, just check whether we already have a cached suggestion for
  // this student - this is a plain DB read, it never calls the (shared,
  // quota-limited) Gemini API, so it's free to run automatically.
  useEffect(() => {
    if (reports.length === 0) return;
    (async () => {
      try {
        const res = await fetch("/api/score-report/suggestions");
        const json = await res.json();
        if (res.ok && json.review) setAiReview(json.review);
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
        setSuggestionError(json.error || "Couldn't generate a review.");
      } else {
        setAiReview(json.review);
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

  /**
   * Renders one report card (used for both the regular score-report list
   * and the separate question-level-report list below it). For
   * question-level reports, shows BOTH specific weak topics (any exact
   * content-description with at least one wrong answer) and specific
   * strong topics (every question on that exact topic answered correctly)
   * - each row already names the system it's under, so a weak system can
   * be traced down to the exact question topic causing it.
   */
  function renderReportCard(r: ScoreReport) {
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
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Systems</p>
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
            </div>

            {r.discipline_breakdown && Object.keys(r.discipline_breakdown).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Disciplines</p>
                <div className="grid sm:grid-cols-2 gap-1.5">
                  {Object.entries(r.discipline_breakdown).map(([discipline, pct]) => (
                    <div key={discipline} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-400 truncate">{discipline}</span>
                      <span className={`text-xs font-semibold rounded-full px-2 py-0.5 shrink-0 ${scoreBadgeClass(pct)}`}>
                        {pct}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {r.exam_type === "question_level" &&
              r.content_breakdown &&
              Object.keys(r.content_breakdown).length > 0 &&
              (() => {
                const entries = Object.entries(r.content_breakdown) as [string, ContentAreaStat][];
                const sortedByPercent = [...entries].sort((a, b) => a[1].percent - b[1].percent);
                // "Weak" = at least one question missed on this exact topic;
                // "strong" = every question filed under this exact topic was
                // correct. Most content-description rows only have 1-2
                // questions behind them, so in practice this reads close to
                // a per-question right/wrong list, not just a broad average.
                const weakTopics = sortedByPercent.filter(([, s]) => s.percent < 100);
                const strongTopics = [...sortedByPercent].reverse().filter(([, s]) => s.percent === 100);
                const prev = previousQuestionLevelReport(reports, r);
                const comparison =
                  prev?.content_breakdown && r.content_breakdown
                    ? compareContentBreakdowns(prev.content_breakdown, r.content_breakdown)
                    : null;
                const improved = comparison?.filter((c) => c.delta > 0) ?? [];
                const declined = comparison?.filter((c) => c.delta < 0) ?? [];

                return (
                  <div className="pt-3 border-t border-slate-800 space-y-3">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-1.5">
                          Specific weak topics ({weakTopics.length})
                        </p>
                        <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                          {weakTopics.length === 0 ? (
                            <p className="text-xs text-slate-500">No missed topics - nice work.</p>
                          ) : (
                            weakTopics.map(([key, stat]) => (
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
                            ))
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-1.5">
                          Specific strong topics ({strongTopics.length})
                        </p>
                        <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                          {strongTopics.length === 0 ? (
                            <p className="text-xs text-slate-500">None yet.</p>
                          ) : (
                            strongTopics.map(([key, stat]) => (
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
                            ))
                          )}
                        </div>
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
          {/* Immediate Exam Review - deterministic, no AI call, so it's ready
              the instant a report is saved instead of waiting on anything.
              Always about the single most recent regular (non-question-
              level) report, which is why it sits above every other section -
              a student should be able to read this in about 30 seconds. */}
          {immediateReview && (
            <div className="card">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                <div>
                  <p className="text-sm font-semibold">{immediateReview.latest.exam_name}</p>
                  <p className="text-xs text-slate-500">{immediateReview.latest.taken_date ?? "No date"}</p>
                </div>
                {immediateReview.latest.overall_percent !== null && (
                  <span className="text-2xl font-bold text-brand-300">{immediateReview.latest.overall_percent}%</span>
                )}
              </div>
              {immediateReview.previous && (
                <p className="text-xs text-slate-400 mb-3">
                  Previous exam: {immediateReview.previous.overall_percent ?? "?"}%
                  {immediateReview.overallDelta !== null && (
                    <span
                      className={`ml-2 font-semibold ${
                        immediateReview.overallDelta > 0
                          ? "text-green-400"
                          : immediateReview.overallDelta < 0
                            ? "text-red-400"
                            : "text-slate-400"
                      }`}
                    >
                      {immediateReview.overallDelta > 0 ? "↑" : immediateReview.overallDelta < 0 ? "↓" : "→"}{" "}
                      {immediateReview.overallDelta > 0 ? "+" : ""}
                      {immediateReview.overallDelta}%
                    </span>
                  )}
                </p>
              )}
              <div className="space-y-1 mb-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Performance Summary</p>
                {immediateReview.summarySentences.map((s, i) => (
                  <p key={i} className="text-sm text-slate-300">
                    {s}
                  </p>
                ))}
              </div>
              {immediateReview.biggestImprovement && immediateReview.biggestDecline && (
                <div className="grid sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <p className="text-xs text-slate-500">Biggest Improvement</p>
                    <p className="text-sm font-semibold text-green-400">{immediateReview.biggestImprovement.system}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Biggest Decline</p>
                    <p className="text-sm font-semibold text-red-400">{immediateReview.biggestDecline.system}</p>
                  </div>
                </div>
              )}
              <p className="text-xs text-slate-400">
                <span className="font-semibold text-slate-300">Exam Readiness:</span> {immediateReview.readinessNote}
              </p>
            </div>
          )}

          {/* AI Exam Review - structured bullets instead of a paragraph (see
              AiExamReview in lib/scoreReports.ts). Sits right below the
              Immediate Exam Review, above every table, matching the intended
              upload -> AI processing -> immediate review -> AI review flow. */}
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">AI Exam Review</p>
              <button
                type="button"
                onClick={() => getSuggestion(!!aiReview)}
                disabled={loadingSuggestion}
                className="btn-secondary text-xs"
              >
                {loadingSuggestion ? "Thinking..." : aiReview ? "Refresh" : "Get AI review"}
              </button>
            </div>
            {suggestionError && <p className="text-xs text-red-400 mb-2">{suggestionError}</p>}
            {aiReview ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  {aiReview.bullets.map((b, i) => (
                    <p key={i} className={`text-sm flex items-start gap-2 ${b.positive ? "text-slate-300" : "text-slate-300"}`}>
                      <span className={`shrink-0 ${b.positive ? "text-green-400" : "text-amber-400"}`}>
                        {b.positive ? "✓" : "⚠"}
                      </span>
                      {b.text}
                    </p>
                  ))}
                </div>
                {aiReview.priorityAreas.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Priority Areas</p>
                    <ol className="text-sm text-slate-300 list-decimal list-inside space-y-0.5">
                      {aiReview.priorityAreas.map((area) => (
                        <li key={area}>{area}</li>
                      ))}
                    </ol>
                  </div>
                )}
                {aiReview.estimatedHours && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                      Estimated study requirement
                    </p>
                    <p className="text-sm text-slate-300">{aiReview.estimatedHours}</p>
                  </div>
                )}
              </div>
            ) : (
              !suggestionError && (
                <p className="text-xs text-slate-500">
                  Generates a quick read on what's going well and what to prioritize, based on your score
                  history. Reused automatically until you add a new report or hit Refresh, so it doesn't
                  burn through the shared AI quota.
                </p>
              )
            )}
          </div>

          {/* Study Plan - a mentor-authored plan (mentorStudyPlan) always
              wins when one exists; otherwise this is computed on the fly
              from the AI Exam Review above (no separate AI call/schema
              needed for the default case - see mentorStudyPlan prop doc). */}
          <div className="card">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold">
                {mentorStudyPlan ? "Study Plan" : "Default AI Study Plan"}
              </p>
              {mentorStudyPlan && (
                <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-brand-900/40 text-brand-300">
                  From {mentorStudyPlan.mentorName ?? "your mentor"}
                </span>
              )}
            </div>
            {mentorStudyPlan ? (
              <>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{mentorStudyPlan.content}</p>
                <p className="text-xs text-slate-500 mt-2">
                  Last updated {new Date(mentorStudyPlan.updatedAt).toLocaleDateString()}
                </p>
              </>
            ) : aiReview && aiReview.priorityAreas.length > 0 ? (
              <>
                <p className="text-xs text-slate-500 mb-2">
                  Generated from your AI Exam Review above - a mentor can replace this with their own plan
                  any time.
                </p>
                <ol className="text-sm text-slate-300 list-decimal list-inside space-y-0.5">
                  {aiReview.priorityAreas.map((area) => (
                    <li key={area}>{area}</li>
                  ))}
                </ol>
                {aiReview.estimatedHours && (
                  <p className="text-xs text-slate-500 mt-2">Estimated total: {aiReview.estimatedHours}</p>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-500">
                Get an AI Exam Review above to generate your default study plan here.
              </p>
            )}
          </div>

          {/* Mentor Recommendation - what makes this different from a plain
              analytics page: nudges the student to loop a mentor in on this
              exact report before diving into the next study block, instead
              of just leaving them alone with the numbers above. Routes to
              the student's own mentor (myMentor, resolved server-side from
              an existing booked session or message thread) if one exists,
              otherwise to the mentor directory to find one. */}
          <div className="card">
            <p className="text-sm font-semibold mb-1">Mentor Recommendation</p>
            <p className="text-xs text-slate-400 mb-3">
              Your AI analysis has generated a default study recommendation. Before starting your next
              study block, discuss this report with your mentor - they can help turn these numbers into a
              concrete plan.
            </p>
            <a
              href={myMentor ? `/mentorship/mentor/${myMentor.id}` : "/mentorship"}
              className="btn-secondary text-xs inline-block"
            >
              {myMentor ? `Discuss With ${myMentor.name ?? "Your Mentor"} →` : "Find a Mentor to Discuss →"}
            </a>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="card">
              <p className="text-sm font-semibold mb-3">Weakest systems right now</p>
              <div className="space-y-3">
                {weakest.map((s) => (
                  <div key={s.system} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-300 truncate">{s.system}</span>
                      <span className={`text-xs ${TREND_CLASS[s.trend]}`}>{TREND_LABEL[s.trend]}</span>
                    </div>
                    {/* Row detail - Last Exam / Average / Target %, so a
                        student can see at a glance whether a system is
                        already close to goal or still far off, not just its
                        rolling average. Target is a fixed 70% default (see
                        SYSTEM_TARGET_PERCENT) - there's no per-student
                        customizable goal yet. */}
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>
                        Last{" "}
                        <span className={`font-semibold rounded-full px-1.5 py-0.5 ${scoreBadgeClass(s.latestPercent)}`}>
                          {s.latestPercent}%
                        </span>
                      </span>
                      <span>
                        Avg{" "}
                        <span className={`font-semibold rounded-full px-1.5 py-0.5 ${scoreBadgeClass(s.averagePercent)}`}>
                          {s.averagePercent}%
                        </span>
                      </span>
                      <span>
                        Target <span className="font-semibold text-slate-400">{SYSTEM_TARGET_PERCENT}%</span>
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

          {disciplineStrengths.length === 0 ? (
            <div className="card">
              <p className="text-sm font-semibold mb-1">Disciplines</p>
              <p className="text-xs text-slate-500">
                No discipline data yet - fill in the "Discipline breakdown" section (Anatomy, Pathology,
                Pharmacology, etc.) when you upload a score report, or let the AI read it off a report
                that shows it, to see your weakest/strongest disciplines here.
              </p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="card">
                <p className="text-sm font-semibold mb-3">Weakest disciplines right now</p>
                <div className="space-y-2">
                  {weakestDisciplines.map((s) => (
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
                <p className="text-sm font-semibold mb-3">Strongest disciplines</p>
                <div className="space-y-2">
                  {strongestDisciplines.map((s) => (
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
          )}

          {comparisonReports.length > 1 && (
            <div className="card overflow-x-auto">
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <p className="text-sm font-semibold">Progress by system</p>
                <div className="flex items-center gap-2">
                  {/* Sort control - "Weakest first" is the existing default
                      order computeSystemStrengths already returns; the other
                      two re-rank by systemDelta (first-vs-last percent
                      across the columns shown), so a system swinging hard in
                      either direction surfaces even if its average looks
                      middling. */}
                  <select
                    value={systemSort}
                    onChange={(e) => setSystemSort(e.target.value as typeof systemSort)}
                    className="input text-xs py-1"
                  >
                    <option value="weakest">Sort: Weakest first</option>
                    <option value="declining">Sort: Most declining</option>
                    <option value="improving">Sort: Most improving</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setSystemTableOpen((v) => !v)}
                    aria-label={systemTableOpen ? "Minimize" : "Maximize"}
                    className="text-slate-400 hover:text-slate-200 shrink-0 p-1 rounded hover:bg-slate-800 transition"
                  >
                    <ChevronToggle open={systemTableOpen} />
                  </button>
                </div>
              </div>
              {systemTableOpen && (
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="pr-3 py-1 sticky-col">System</th>
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
                    {sortedSystemRows.map((s) => {
                      const historyOpen = expandedSystemHistory === s.system;
                      const history = trends[s.system] ?? [];
                      return (
                        <Fragment key={s.system}>
                          <tr className="border-t border-slate-800">
                            <td className="pr-3 py-1.5 whitespace-nowrap sticky-col">
                              <button
                                type="button"
                                onClick={() => setExpandedSystemHistory(historyOpen ? null : s.system)}
                                className="text-slate-300 hover:text-brand-300 text-left"
                              >
                                {s.system}
                              </button>
                            </td>
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
                          {/* Click-a-system full history - every trend point
                              ever recorded for this system (not just the
                              regular-report columns above), each with its
                              delta vs. the point before it, for a student
                              who wants the whole story on one system instead
                              of scanning across the wide table. */}
                          {historyOpen && (
                            <tr className="border-t border-slate-900 bg-slate-900/30">
                              <td colSpan={comparisonReports.length + 1} className="px-3 py-2">
                                {history.length === 0 ? (
                                  <p className="text-slate-500">No history for this system.</p>
                                ) : (
                                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                                    {history.map((point, i) => {
                                      const prevPct = i > 0 ? history[i - 1].percent : null;
                                      const delta = prevPct !== null ? point.percent - prevPct : null;
                                      return (
                                        <span key={point.reportId} className="whitespace-nowrap">
                                          <span className="text-slate-500">
                                            {point.takenDate ?? "?"} ({point.examName}):
                                          </span>{" "}
                                          <span className={`font-semibold rounded-full px-1.5 py-0.5 ${scoreBadgeClass(point.percent)}`}>
                                            {point.percent}%
                                          </span>
                                          {delta !== null && delta !== 0 && (
                                            <span className={delta > 0 ? "text-green-400" : "text-red-400"}>
                                              {" "}
                                              {delta > 0 ? "↑" : "↓"}
                                              {Math.abs(delta)}
                                            </span>
                                          )}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {comparisonReports.length > 1 && (
            <div className="card overflow-x-auto">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold">Progress by discipline</p>
                <button
                  type="button"
                  onClick={() => setDisciplineTableOpen((v) => !v)}
                  aria-label={disciplineTableOpen ? "Minimize" : "Maximize"}
                  className="text-slate-400 hover:text-slate-200 shrink-0 p-1 rounded hover:bg-slate-800 transition"
                >
                  <ChevronToggle open={disciplineTableOpen} />
                </button>
              </div>
              {regularDisciplineStrengths.length === 0 ? (
                <p className="text-xs text-slate-500 mt-2">
                  No discipline data yet - this comes from the "Discipline breakdown" section on the score
                  report upload form (Anatomy, Pathology, Pharmacology, etc.). Fill that in (or let the AI
                  read it off a report that shows it) and it'll start showing up here.
                </p>
              ) : (
                disciplineTableOpen && (
                  <table className="min-w-full text-xs mt-2">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="pr-3 py-1">Discipline</th>
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
                      {regularDisciplineStrengths.map((s) => (
                        <tr key={s.system} className="border-t border-slate-800">
                          <td className="pr-3 py-1.5 text-slate-300 whitespace-nowrap">{s.system}</td>
                          {comparisonReports.map((r) => {
                            const pct = r.discipline_breakdown?.[s.system];
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
                )
              )}
            </div>
          )}

          {/* Compare Exams - pick any two regular reports and see every
              system/discipline that moved between them, biggest movers
              first. Defaults to previous-vs-latest (same pair Immediate
              Exam Review uses) until the student picks their own. */}
          {comparisonReports.length > 1 && compareA && compareB && (
            <div className="card">
              <p className="text-sm font-semibold mb-3">Compare Exams</p>
              <div className="flex items-center gap-2 flex-wrap mb-4">
                <select
                  value={compareA.id}
                  onChange={(e) => setCompareAId(e.target.value)}
                  className="input text-xs py-1"
                >
                  {comparisonReports.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.taken_date ?? "?"} - {r.exam_name}
                    </option>
                  ))}
                </select>
                <span className="text-slate-500 text-xs">vs.</span>
                <select
                  value={compareB.id}
                  onChange={(e) => setCompareBId(e.target.value)}
                  className="input text-xs py-1"
                >
                  {comparisonReports.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.taken_date ?? "?"} - {r.exam_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Systems</p>
                  <div className="space-y-1.5">
                    {compareSystemRows.length === 0 ? (
                      <p className="text-xs text-slate-500">No overlapping system data between these two reports.</p>
                    ) : (
                      compareSystemRows.map((row) => (
                        <div key={row.category} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-slate-300 truncate">{row.category}</span>
                          <span className="flex items-center gap-1 shrink-0">
                            <span className="text-slate-500">
                              {row.from}% &rarr; {row.to}%
                            </span>
                            <span className={row.delta > 0 ? "text-green-400" : row.delta < 0 ? "text-red-400" : "text-slate-500"}>
                              {row.delta > 0 ? "↑" : row.delta < 0 ? "↓" : "→"}
                              {Math.abs(row.delta)}
                            </span>
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Disciplines</p>
                  <div className="space-y-1.5">
                    {compareDisciplineRows.length === 0 ? (
                      <p className="text-xs text-slate-500">No overlapping discipline data between these two reports.</p>
                    ) : (
                      compareDisciplineRows.map((row) => (
                        <div key={row.category} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-slate-300 truncate">{row.category}</span>
                          <span className="flex items-center gap-1 shrink-0">
                            <span className="text-slate-500">
                              {row.from}% &rarr; {row.to}%
                            </span>
                            <span className={row.delta > 0 ? "text-green-400" : row.delta < 0 ? "text-red-400" : "text-slate-500"}>
                              {row.delta > 0 ? "↑" : row.delta < 0 ? "↓" : "→"}
                              {Math.abs(row.delta)}
                            </span>
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {questionLevelColumns.length > 0 && (
            <div className="card overflow-x-auto">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold">Progress by topic (question-level reports)</p>
                <button
                  type="button"
                  onClick={() => setTopicTableOpen((v) => !v)}
                  aria-label={topicTableOpen ? "Minimize" : "Maximize"}
                  className="text-slate-400 hover:text-slate-200 shrink-0 p-1 rounded hover:bg-slate-800 transition"
                >
                  <ChevronToggle open={topicTableOpen} />
                </button>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Separate from the system table above - grouped by system, but broken down to the exact
                subtopic from your question-level uploads instead of one number per system.
              </p>
              {topicTableOpen && (
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="pr-3 py-1">Topic</th>
                      {questionLevelColumns.map((r) => (
                        <th key={r.id} className="px-2 py-1 whitespace-nowrap">
                          {r.taken_date ?? "?"}
                          <br />
                          <span className="text-slate-600">{r.exam_name}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {questionLevelTopicGroups.map((group) => (
                      <Fragment key={group.system}>
                        <tr className="border-t border-slate-800">
                          <td colSpan={questionLevelColumns.length + 1} className="pt-3 pb-1 text-slate-300 font-semibold">
                            {group.system}
                          </td>
                        </tr>
                        {group.topics.map((topic) => (
                          <tr key={topic.key} className="border-t border-slate-900">
                            <td className="pr-3 py-1.5 text-slate-400 max-w-xs truncate" title={topic.key}>
                              {topic.subtopic}
                            </td>
                            {questionLevelColumns.map((r) => {
                              const pct = topic.percents[r.id];
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
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-semibold">Score report history</p>
            {regularReports.length === 0 ? (
              <p className="text-xs text-slate-500">No score reports yet.</p>
            ) : (
              regularReports.map((r) => renderReportCard(r))
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">Question-level report history</p>
            {questionLevelReportsList.length === 0 ? (
              <p className="text-xs text-slate-500">No question-level reports yet.</p>
            ) : (
              questionLevelReportsList.map((r) => renderReportCard(r))
            )}
          </div>

        </>
      )}
    </div>
  );
}
