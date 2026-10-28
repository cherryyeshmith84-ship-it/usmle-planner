"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  EXAM_TYPE_LABEL,
  SYSTEM_TARGET_PERCENT,
  computeDisciplineStrengths,
  computeImmediateExamReview,
  computeSystemStrengths,
  systemTrends,
  type ScoreReport,
} from "@/lib/scoreReports";
import { compareContentBreakdowns, systemQuestionCounts, type ContentAreaStat } from "@/lib/questionLevelReports";
import { STEP1_SUBJECTS, STEP1_SYSTEMS } from "@/lib/qbankTypes";
import ScoreReportUpload from "./ScoreReportUpload";
import ScoreReportEditForm from "./ScoreReportEditForm";

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
 * Performance page, built entirely from score_reports (NBME/UWSA/Free120/
 * UWorld self-assessment uploads, see ScoreReportUpload.tsx): current
 * weak/strong systems, system-by-report comparison tables, and the upload
 * flow itself. (The AI Exam Review and Default AI Study Plan cards were
 * removed; a mentor-written study plan still shows when one exists.)
 */
export default function PerformanceClient({
  userId,
  initialReports,
  myMentor,
  mentorStudyPlan,
}: {
  userId: string;
  initialReports: ScoreReport[];
  myMentor?: { id: string; name: string | null } | null;
  // A mentor-authored study plan (see StudyPlanEditor.tsx / mentor_study_plans
  // table). Null until a mentor writes one.
  mentorStudyPlan?: { content: string; updatedAt: string; mentorName: string | null } | null;
}) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingReportId, setViewingReportId] = useState<string | null>(null);
  const [reportImageUrls, setReportImageUrls] = useState<Record<string, string[]>>({});
  const [loadingReportImages, setLoadingReportImages] = useState<string | null>(null);
  const [systemTableOpen, setSystemTableOpen] = useState(true);
  const [disciplineTableOpen, setDisciplineTableOpen] = useState(true);
  const [topicTableOpen, setTopicTableOpen] = useState(true);
  const [systemSort, setSystemSort] = useState<"weakest" | "declining" | "improving">("weakest");
  const [expandedSystemHistory, setExpandedSystemHistory] = useState<string | null>(null);
  const [compareAId, setCompareAId] = useState<string | null>(null);
  const [compareBId, setCompareBId] = useState<string | null>(null);

  const reports = initialReports;
  const immediateReview = useMemo(() => computeImmediateExamReview(reports), [reports]);
  const strengths = useMemo(() => computeSystemStrengths(reports), [reports]);
  const trends = useMemo(() => systemTrends(reports), [reports]);
  const weakest = strengths.slice(0, 5);
  const strongest = [...strengths].reverse().slice(0, 3);

  const disciplineStrengths = useMemo(() => computeDisciplineStrengths(reports), [reports]);
  const weakestDisciplines = disciplineStrengths.slice(0, 5);
  const strongestDisciplines = [...disciplineStrengths].reverse().slice(0, 3);

  const sortedReports = useMemo(
    () => [...reports].sort((a, b) => (b.taken_date ?? "").localeCompare(a.taken_date ?? "")),
    [reports]
  );
  const regularReports = useMemo(
    () => sortedReports.filter((r) => r.exam_type !== "question_level"),
    [sortedReports]
  );
  const questionLevelReportsList = useMemo(
    () => sortedReports.filter((r) => r.exam_type === "question_level"),
    [sortedReports]
  );
  const questionLevelColumns = useMemo(
    () => [...questionLevelReportsList].sort((a, b) => (a.taken_date ?? "").localeCompare(b.taken_date ?? "")),
    [questionLevelReportsList]
  );
  const comparisonReports = useMemo(
    () =>
      [...regularReports].sort((a, b) => (a.taken_date ?? "").localeCompare(b.taken_date ?? "")),
    [regularReports]
  );
  const regularStrengths = useMemo(() => computeSystemStrengths(regularReports), [regularReports]);
  const regularDisciplineStrengths = useMemo(
    () => computeDisciplineStrengths(regularReports),
    [regularReports]
  );

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

  // Action Center - short, deterministic "what to do right now" checklist
  // built from data already on this page.
  interface ActionItem {
    id: string;
    text: string;
    href?: string;
  }
  const mentorHref = myMentor ? `/mentorship/mentor/${myMentor.id}` : "/mentorship";
  const actionItems = useMemo(() => {
    const items: ActionItem[] = [];
    const todayStr = new Date().toISOString().slice(0, 10);
    if (immediateReview && !immediateReview.latest.mentor_reviewed_at) {
      items.push({
        id: "discuss",
        text: `Discuss your ${immediateReview.latest.exam_name} results with your mentor before your next study block.`,
        href: mentorHref,
      });
    }
    if (immediateReview?.latest.next_checkin_date && immediateReview.latest.next_checkin_date < todayStr) {
      items.push({
        id: "checkin",
        text: `Your mentor check-in was due ${immediateReview.latest.next_checkin_date} - reach out.`,
        href: mentorHref,
      });
    }
    if (reports.length > 0 && disciplineStrengths.length === 0) {
      items.push({
        id: "disciplines",
        text: "Add a discipline breakdown (Anatomy, Pathology, Pharmacology, etc.) to your next upload to unlock discipline tracking.",
      });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immediateReview, disciplineStrengths, reports, mentorHref]);

  interface TopicRow {
    key: string;
    subtopic: string;
    percents: Record<string, number>;
  }
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

  async function deleteReport(id: string) {
    if (!confirm("Delete this score report? This can't be undone.")) return;
    const supabase = createClient();
    await supabase.from("score_reports").delete().eq("id", id);
    router.refresh();
  }

  async function toggleViewReport(r: ScoreReport) {
    if (viewingReportId === r.id) {
      setViewingReportId(null);
      return;
    }
    setViewingReportId(r.id);
    if (reportImageUrls[r.id] || r.image_paths.length === 0) return;
    setLoadingReportImages(r.id);
    const supabase = createClient();
    const { data } = await supabase.storage.from("score-reports").createSignedUrls(r.image_paths, 300);
    setReportImageUrls((prev) => ({
      ...prev,
      [r.id]: (data ?? []).map((d) => d.signedUrl).filter((u): u is string => !!u),
    }));
    setLoadingReportImages(null);
  }

  function renderReportCard(r: ScoreReport) {
    const expanded = expandedId === r.id;
    const viewingReport = viewingReportId === r.id;
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
            {r.image_paths.length > 0 && (
              <button
                type="button"
                onClick={() => toggleViewReport(r)}
                className="text-xs text-brand-400 hover:text-brand-300 font-medium"
              >
                {viewingReport ? "Hide report" : "View Report"}
              </button>
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
              onClick={() => setEditingId(editingId === r.id ? null : r.id)}
              className="text-xs text-brand-400 hover:text-brand-300 font-medium"
            >
              {editingId === r.id ? "Close edit" : "Edit"}
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
        {editingId === r.id && <ScoreReportEditForm report={r} onClose={() => setEditingId(null)} />}
        {viewingReport && (
          <div className="mt-3 pt-3 border-t border-slate-800">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
              Original uploaded report
            </p>
            {loadingReportImages === r.id ? (
              <p className="text-xs text-slate-500">Loading...</p>
            ) : (reportImageUrls[r.id]?.length ?? 0) === 0 ? (
              <p className="text-xs text-slate-500">Couldn&apos;t load the original file(s) for this report.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {reportImageUrls[r.id].map((url, i) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-brand-400 hover:text-brand-300 underline"
                  >
                    Open page {i + 1}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
        {expanded && (
          <div className="mt-3 space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Systems</p>
              <div className="grid sm:grid-cols-2 gap-1.5">
                {Object.entries(r.system_breakdown ?? {}).length === 0 ? (
                  <p className="text-xs text-slate-500">No per-system breakdown saved for this one.</p>
                ) : (
                  (() => {
                    const questionCounts =
                      r.exam_type === "question_level" && r.content_breakdown
                        ? systemQuestionCounts(r.content_breakdown)
                        : {};
                    return Object.entries(r.system_breakdown).map(([system, pct]) => (
                      <div key={system} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-400 truncate">{system}</span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          {questionCounts[system] !== undefined && (
                            <span className="text-[10px] text-slate-600">
                              {questionCounts[system]} Q{questionCounts[system] === 1 ? "" : "s"}
                            </span>
                          )}
                          <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${scoreBadgeClass(pct)}`}>
                            {pct}%
                          </span>
                        </span>
                      </div>
                    ));
                  })()
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

      {reports.length === 0 ? (
        <div className="card">
          <p className="text-sm text-slate-400">
            Add your first NBME, UWSA, Free 120, or UWorld self-assessment result above to start
            tracking your weak and strong systems over time.
          </p>
        </div>
      ) : (
        <>
          {myMentor && immediateReview && (
            <div
              className="card flex items-center justify-between gap-3 flex-wrap"
              style={{ borderColor: immediateReview.latest.mentor_reviewed_at ? "#14532d" : "#78350f" }}
            >
              <p className="text-xs text-slate-300">
                {immediateReview.latest.mentor_reviewed_at ? (
                  <>
                    <span className="text-green-400 font-semibold">✓ Reviewed by {myMentor.name ?? "your mentor"}</span>{" "}
                    on {new Date(immediateReview.latest.mentor_reviewed_at).toLocaleDateString()}
                  </>
                ) : (
                  <>
                    <span className="text-amber-400 font-semibold">⚠ Not yet reviewed</span> - {myMentor.name ?? "your mentor"}{" "}
                    hasn&apos;t looked at your {immediateReview.latest.exam_name} results yet.
                  </>
                )}
                {immediateReview.latest.next_checkin_date && (
                  <span className="text-slate-500"> &middot; Next check-in: {immediateReview.latest.next_checkin_date}</span>
                )}
              </p>
            </div>
          )}

          {actionItems.length > 0 && (
            <div className="card">
              <p className="text-sm font-semibold mb-2">Action Center</p>
              <div className="space-y-2">
                {actionItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-slate-300">{item.text}</span>
                    {item.href && (
                      <a href={item.href} className="text-xs text-brand-400 hover:text-brand-300 font-medium shrink-0">
                        Go &rarr;
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

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

          {/* Mentor-written study plan - only shown when a mentor has
              written one (the AI Exam Review and Default AI Study Plan
              cards were removed). */}
          {mentorStudyPlan && (
            <div className="card">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold">Study Plan</p>
                <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-brand-900/40 text-brand-300">
                  From {mentorStudyPlan.mentorName ?? "your mentor"}
                </span>
              </div>
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{mentorStudyPlan.content}</p>
              <p className="text-xs text-slate-500 mt-2">
                Last updated {new Date(mentorStudyPlan.updatedAt).toLocaleDateString()}
              </p>
            </div>
          )}

          <div className="card">
            <p className="text-sm font-semibold mb-1">Mentor Recommendation</p>
            <p className="text-xs text-slate-400 mb-3">
              Before starting your next study block, discuss this report with your mentor - they can
              help turn these numbers into a concrete plan.
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
                Pharmacology, etc.) when you add a score report to see your weakest/strongest disciplines
                here.
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
                  No discipline data yet - this comes from the "Discipline breakdown" section when you add
                  a score report (Anatomy, Pathology, Pharmacology, etc.). Fill that in and it'll start
                  showing up here.
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

          <div className="space-y-2">
            <p className="text-sm font-semibold">Score report history</p>
            {regularReports.length === 0 ? (
              <p className="text-xs text-slate-500">No score reports yet.</p>
            ) : (
              regularReports.map((r) => renderReportCard(r))
            )}
          </div>

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
