import { STEP1_SUBJECTS, STEP1_SYSTEMS } from "./qbankTypes";
import type { ContentBreakdown } from "./questionLevelReports";

export type ScoreReportExamType =
  | "nbme"
  | "uwsa"
  | "free120"
  | "uworld_self_assessment"
  | "question_level"
  | "other";

export const EXAM_TYPE_LABEL: Record<ScoreReportExamType, string> = {
  nbme: "NBME",
  uwsa: "UWSA",
  free120: "Free 120",
  uworld_self_assessment: "UWorld Self-Assessment",
  // A per-question feedback PDF (e.g. NBME CBSE/CCSE "Examinee Question-Level
  // Feedback Report") rather than a single per-system percent table - only
  // ever set by QuestionLevelReportUpload.tsx, which is also what populates
  // content_breakdown below.
  question_level: "Question-Level Report",
  other: "Other",
};

export interface ScoreReport {
  id: string;
  user_id: string;
  exam_type: ScoreReportExamType;
  exam_name: string;
  taken_date: string | null;
  overall_score: number | null;
  overall_percent: number | null;
  // Keyed by lib/qbankTypes.ts STEP1_SYSTEMS labels -> percent correct (0-100).
  system_breakdown: Record<string, number>;
  // Keyed by lib/qbankTypes.ts STEP1_SUBJECTS labels (Anatomy, Pathology,
  // Pharmacology, etc.) -> percent correct (0-100). This is the other axis
  // NBME/UWSA reports usually break performance down by, alongside System -
  // optional since reports saved before this existed won't have it.
  discipline_breakdown?: Record<string, number>;
  // Only set for exam_type "question_level" - percent correct per exact
  // named topic (finer-grained than system_breakdown), keyed by the
  // verbatim content-description string. See lib/questionLevelReports.ts.
  content_breakdown?: ContentBreakdown | null;
  // One score report can be built from several screenshots (e.g. a System
  // table + a Subject table, or a scrolled multi-part capture) - all of
  // them are stored and read together.
  image_paths: string[];
  created_at?: string;
  // Mentor review status (Analysis v1 item 15 / Mentor Status banner) - set
  // only via the mentor_mark_report_reviewed() DB function (see migration
  // score_reports_mentor_review_status), never written directly by either
  // side's client code. Optional since reports saved before this existed
  // won't have them.
  mentor_notified_at?: string | null;
  mentor_reviewed_at?: string | null;
  mentor_reviewed_by?: string | null;
  next_checkin_date?: string | null;
}

/** What the AI-parse endpoint returns before the student reviews/confirms it. */
export interface ParsedScoreReport {
  exam_type: ScoreReportExamType;
  exam_name: string;
  taken_date: string | null;
  overall_score: number | null;
  overall_percent: number | null;
  system_breakdown: Record<string, number>;
  discipline_breakdown: Record<string, number>;
}

export interface SystemTrendPoint {
  reportId: string;
  examName: string;
  takenDate: string | null;
  percent: number;
}

/**
 * Shared implementation behind systemTrends/disciplineTrends below - walks
 * every report oldest-first and, for each category in the given canonical
 * list, collects every data point found via `breakdown(report)[category]`.
 * Kept generic so the System axis (STEP1_SYSTEMS/system_breakdown) and the
 * Discipline axis (STEP1_SUBJECTS/discipline_breakdown - Anatomy, Pathology,
 * Pharmacology, etc., the other axis NBME/UWSA reports usually break
 * performance down by) share one implementation instead of two copies that
 * could drift apart.
 */
function buildCategoryTrends(
  reports: ScoreReport[],
  categories: readonly string[],
  breakdown: (r: ScoreReport) => Record<string, number> | null | undefined
): Record<string, SystemTrendPoint[]> {
  const sorted = [...reports].sort((a, b) => (a.taken_date ?? "").localeCompare(b.taken_date ?? ""));
  const byCategory: Record<string, SystemTrendPoint[]> = {};
  for (const category of categories) {
    byCategory[category] = [];
    for (const r of sorted) {
      const pct = breakdown(r)?.[category];
      if (typeof pct === "number") {
        byCategory[category].push({ reportId: r.id, examName: r.exam_name, takenDate: r.taken_date, percent: pct });
      }
    }
  }
  return byCategory;
}

/** Per-system history across every score report, oldest first, for trend/comparison views. */
export function systemTrends(reports: ScoreReport[]): Record<string, SystemTrendPoint[]> {
  return buildCategoryTrends(reports, STEP1_SYSTEMS, (r) => r.system_breakdown);
}

/** Same idea as systemTrends, but for the Discipline axis (Anatomy,
 *  Pathology, Pharmacology, etc.) instead of organ System. */
export function disciplineTrends(reports: ScoreReport[]): Record<string, SystemTrendPoint[]> {
  return buildCategoryTrends(reports, STEP1_SUBJECTS, (r) => r.discipline_breakdown);
}

export interface SystemStrength {
  system: string;
  averagePercent: number;
  latestPercent: number;
  reportCount: number;
  trend: "improving" | "declining" | "flat" | "unknown";
}

/** Fixed default goal used for the "Target %" column on the Weakest Systems
 *  row detail - there's no per-student customizable target yet, so this is
 *  the same 70% bar computeImmediateExamReview already uses to decide
 *  whether a system counts as "strong" (see strongSystems there), kept in
 *  one place so the two stay consistent if it's ever tuned. */
export const SYSTEM_TARGET_PERCENT = 70;

/**
 * Ranks every category by recent performance - average of the last 3
 * data points per category, plus a simple trend read (first vs last of
 * those same points) so "consistently low" and "used to be weak, now fine"
 * don't look the same. Shared by computeSystemStrengths/
 * computeDisciplineStrengths below.
 */
function buildCategoryStrengths(
  categories: readonly string[],
  trends: Record<string, SystemTrendPoint[]>
): SystemStrength[] {
  const out: SystemStrength[] = [];
  for (const category of categories) {
    const points = trends[category];
    if (!points || points.length === 0) continue;
    const recent = points.slice(-3);
    const avg = Math.round(recent.reduce((s, p) => s + p.percent, 0) / recent.length);
    const latest = points[points.length - 1].percent;
    let trend: SystemStrength["trend"] = "unknown";
    if (recent.length >= 2) {
      const delta = recent[recent.length - 1].percent - recent[0].percent;
      trend = delta > 5 ? "improving" : delta < -5 ? "declining" : "flat";
    }
    out.push({ system: category, averagePercent: avg, latestPercent: latest, reportCount: points.length, trend });
  }
  return out.sort((a, b) => a.averagePercent - b.averagePercent);
}

export function computeSystemStrengths(reports: ScoreReport[]): SystemStrength[] {
  return buildCategoryStrengths(STEP1_SYSTEMS, systemTrends(reports));
}

/** Same idea as computeSystemStrengths, but ranking Disciplines (Anatomy,
 *  Pathology, Pharmacology, etc.) instead of organ Systems. */
export function computeDisciplineStrengths(reports: ScoreReport[]): SystemStrength[] {
  return buildCategoryStrengths(STEP1_SUBJECTS, disciplineTrends(reports));
}

/** Structured shape for the "AI Exam Review" card - replaces the old
 *  free-text paragraph stored in ai_suggestion_cache.suggestion. Kept here
 *  (rather than only in the API route) since both the route that generates
 *  it and PerformanceClient that renders it need the same shape. */
export interface AiExamReviewBullet {
  text: string;
  // true -> rendered with a green check, false -> rendered with an amber
  // warning triangle. Roughly "this is going well" vs "pay attention here".
  positive: boolean;
}
export interface AiExamReview {
  bullets: AiExamReviewBullet[];
  // Ordered, most urgent first - empty once the student has already taken
  // the real exam (nothing left to prioritize).
  priorityAreas: string[];
  // Free text like "8-10 focused hours" - deliberately not a number type
  // since the AI phrases this as a range, not a single figure.
  estimatedHours: string;
}

export interface ImmediateExamReview {
  latest: ScoreReport;
  previous: ScoreReport | null;
  overallDelta: number | null;
  biggestImprovement: { system: string; delta: number } | null;
  biggestDecline: { system: string; delta: number } | null;
  summarySentences: string[];
  readinessNote: string;
}

/**
 * A student should be able to read this in ~30 seconds, right after
 * uploading - so it's built entirely from arithmetic on the two most recent
 * REGULAR (non-question-level) reports, no AI call, no waiting. Only ever
 * defined once there's at least one regular report; `previous` (and
 * everything that depends on comparing to it) is null for a student's very
 * first upload.
 */
export function computeImmediateExamReview(reports: ScoreReport[]): ImmediateExamReview | null {
  const regular = [...reports]
    .filter((r) => r.exam_type !== "question_level")
    .sort((a, b) => (b.taken_date ?? "").localeCompare(a.taken_date ?? ""));
  if (regular.length === 0) return null;
  const latest = regular[0];
  const previous = regular[1] ?? null;

  const overallDelta =
    previous && latest.overall_percent !== null && previous.overall_percent !== null
      ? latest.overall_percent - previous.overall_percent
      : null;

  let biggestImprovement: { system: string; delta: number } | null = null;
  let biggestDecline: { system: string; delta: number } | null = null;
  const strongSystems: string[] = [];
  const decliningSystems: string[] = [];

  if (previous) {
    for (const system of STEP1_SYSTEMS) {
      const latestPct = latest.system_breakdown?.[system];
      const prevPct = previous.system_breakdown?.[system];
      if (typeof latestPct !== "number" || typeof prevPct !== "number") continue;
      const delta = latestPct - prevPct;
      if (!biggestImprovement || delta > biggestImprovement.delta) biggestImprovement = { system, delta };
      if (!biggestDecline || delta < biggestDecline.delta) biggestDecline = { system, delta };
      if (latestPct >= 70 && prevPct >= 70) strongSystems.push(system);
      if (delta <= -5) decliningSystems.push(system);
    }
  }

  const summarySentences: string[] = [];
  if (!previous) {
    summarySentences.push("This is your first uploaded exam - future uploads will show how you're trending.");
  } else if (overallDelta !== null) {
    if (overallDelta > 0) summarySentences.push(`You improved overall (up ${overallDelta}% from your previous exam).`);
    else if (overallDelta < 0) summarySentences.push(`Your overall score dropped ${Math.abs(overallDelta)}% from your previous exam.`);
    else summarySentences.push("Your overall score held steady from your previous exam.");
  }
  if (strongSystems.length > 0) {
    summarySentences.push(`${strongSystems.slice(0, 2).join(" and ")} remained strong.`);
  }
  if (decliningSystems.length > 0) {
    const others = decliningSystems.filter((s) => s !== biggestDecline?.system);
    summarySentences.push(
      `${biggestDecline?.system}${others.length > 0 ? ` and ${others[0]}` : ""} dropped compared with your previous exam.`
    );
  }

  const weakCount = STEP1_SYSTEMS.filter((s) => (latest.system_breakdown?.[s] ?? 100) < 60).length;
  const readinessNote =
    weakCount >= 3
      ? "Continue strengthening weak systems before your next exam."
      : weakCount > 0
        ? "You're close - tighten up your remaining weak systems before your next exam."
        : latest.overall_percent !== null && latest.overall_percent >= 75
          ? "Strong showing across the board - keep up steady review to stay sharp."
          : "Keep building a consistent review routine heading into your next exam.";

  return { latest, previous, overallDelta, biggestImprovement, biggestDecline, summarySentences, readinessNote };
}
