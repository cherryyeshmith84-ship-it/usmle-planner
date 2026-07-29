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
