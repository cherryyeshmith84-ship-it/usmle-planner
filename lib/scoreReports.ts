import { STEP1_SYSTEMS } from "./qbankTypes";

export type ScoreReportExamType = "nbme" | "uwsa" | "free120" | "uworld_self_assessment" | "other";

export const EXAM_TYPE_LABEL: Record<ScoreReportExamType, string> = {
  nbme: "NBME",
  uwsa: "UWSA",
  free120: "Free 120",
  uworld_self_assessment: "UWorld Self-Assessment",
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
  image_path: string | null;
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
}

export interface SystemTrendPoint {
  reportId: string;
  examName: string;
  takenDate: string | null;
  percent: number;
}

/** Per-system history across every score report, oldest first, for trend/comparison views. */
export function systemTrends(reports: ScoreReport[]): Record<string, SystemTrendPoint[]> {
  const sorted = [...reports].sort((a, b) => (a.taken_date ?? "").localeCompare(b.taken_date ?? ""));
  const bySystem: Record<string, SystemTrendPoint[]> = {};
  for (const system of STEP1_SYSTEMS) {
    bySystem[system] = [];
    for (const r of sorted) {
      const pct = r.system_breakdown?.[system];
      if (typeof pct === "number") {
        bySystem[system].push({ reportId: r.id, examName: r.exam_name, takenDate: r.taken_date, percent: pct });
      }
    }
  }
  return bySystem;
}

export interface SystemStrength {
  system: string;
  averagePercent: number;
  latestPercent: number;
  reportCount: number;
  trend: "improving" | "declining" | "flat" | "unknown";
}

/**
 * Ranks every system by recent performance - average of the last 3
 * data points per system, plus a simple trend read (first vs last of those
 * same points) so "consistently low" and "used to be weak, now fine" don't
 * look the same.
 */
export function computeSystemStrengths(reports: ScoreReport[]): SystemStrength[] {
  const trends = systemTrends(reports);
  const out: SystemStrength[] = [];
  for (const system of STEP1_SYSTEMS) {
    const points = trends[system];
    if (!points || points.length === 0) continue;
    const recent = points.slice(-3);
    const avg = Math.round(recent.reduce((s, p) => s + p.percent, 0) / recent.length);
    const latest = points[points.length - 1].percent;
    let trend: SystemStrength["trend"] = "unknown";
    if (recent.length >= 2) {
      const delta = recent[recent.length - 1].percent - recent[0].percent;
      trend = delta > 5 ? "improving" : delta < -5 ? "declining" : "flat";
    }
    out.push({ system, averagePercent: avg, latestPercent: latest, reportCount: points.length, trend });
  }
  return out.sort((a, b) => a.averagePercent - b.averagePercent);
}
