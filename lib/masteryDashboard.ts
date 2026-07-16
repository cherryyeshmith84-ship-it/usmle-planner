import type { QBankQuestion } from "./qbankTypes";

export interface QBankAnswerEvent {
  questionId: string;
  choiceId: string;
  submittedAt: string;
}

export interface SystemStat {
  system: string;
  correct: number;
  total: number;
  pct: number;
  trend: "up" | "down" | "flat";
}

export interface OpportunityInsight {
  concept: string;
  missed: number;
  total: number;
  primaryProblem: string | null;
}

export interface DashboardInsights {
  totalAnswered: number;
  totalCorrect: number;
  overallAccuracyPct: number;
  // Average of per-system accuracy (each system weighted equally), distinct
  // from overall accuracy (which is question-weighted) - null if the student
  // hasn't answered any tagged Question Bank questions yet.
  masteryPct: number | null;
  systemStats: SystemStat[];
  opportunity: OpportunityInsight | null;
}

/**
 * Turns a student's raw Question Bank answer history (plus however many
 * un-tagged self-assessment answers they also have) into the dashboard's
 * headline numbers: total questions/accuracy, per-system mastery + trend,
 * and their single biggest "opportunity" concept - the concept they've
 * missed most among their last few attempts at it, along with the most
 * common Error DNA tag behind those misses.
 *
 * Only Question Bank questions carry subjects/systems/Error DNA tags today
 * (self-assessment questions don't), so system mastery and the opportunity
 * card are both derived from `qbankEvents` + `questionById` only.
 * `extraAnswered`/`extraCorrect` fold in self-assessment attempts for the
 * plain "Questions answered" / "Overall accuracy" totals only.
 */
export function computeDashboardInsights(
  qbankEvents: QBankAnswerEvent[],
  questionById: Map<string, QBankQuestion>,
  extraAnswered: number,
  extraCorrect: number
): DashboardInsights {
  const sorted = [...qbankEvents].sort(
    (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
  );

  let totalAnswered = 0;
  let totalCorrect = 0;

  const systemBuckets: Record<string, { correct: number; total: number; timeline: boolean[] }> = {};
  const conceptBuckets: Record<
    string,
    { answers: { correct: boolean; submittedAt: string; errorType: string | null }[] }
  > = {};

  for (const ev of sorted) {
    const q = questionById.get(ev.questionId);
    if (!q || !ev.choiceId) continue;
    totalAnswered++;
    const isCorrect = ev.choiceId === q.correct_choice_id;
    if (isCorrect) totalCorrect++;

    for (const system of q.systems ?? []) {
      if (!systemBuckets[system]) systemBuckets[system] = { correct: 0, total: 0, timeline: [] };
      systemBuckets[system].total++;
      if (isCorrect) systemBuckets[system].correct++;
      systemBuckets[system].timeline.push(isCorrect);
    }

    const concept = q.meta?.primary_concept?.trim() || q.meta?.topic?.trim() || null;
    if (concept) {
      if (!conceptBuckets[concept]) conceptBuckets[concept] = { answers: [] };
      let errorType: string | null = null;
      if (!isCorrect) {
        const choice = q.choices.find((c) => c.id === ev.choiceId);
        errorType = choice?.error_type ?? null;
      }
      conceptBuckets[concept].answers.push({ correct: isCorrect, submittedAt: ev.submittedAt, errorType });
    }
  }

  totalAnswered += Math.max(0, extraAnswered);
  totalCorrect += Math.max(0, extraCorrect);
  const overallAccuracyPct = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

  const systemStats: SystemStat[] = Object.entries(systemBuckets)
    .map(([system, b]) => {
      const pct = b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0;
      let trend: SystemStat["trend"] = "flat";
      if (b.timeline.length >= 4) {
        const mid = Math.floor(b.timeline.length / 2);
        const firstHalf = b.timeline.slice(0, mid);
        const secondHalf = b.timeline.slice(mid);
        const firstPct = firstHalf.length ? (firstHalf.filter(Boolean).length / firstHalf.length) * 100 : 0;
        const secondPct = secondHalf.length ? (secondHalf.filter(Boolean).length / secondHalf.length) * 100 : 0;
        if (secondPct - firstPct >= 8) trend = "up";
        else if (firstPct - secondPct >= 8) trend = "down";
      }
      return { system, correct: b.correct, total: b.total, pct, trend };
    })
    .sort((a, b) => b.total - a.total);

  const masteryPct =
    systemStats.length > 0
      ? Math.round(systemStats.reduce((sum, s) => sum + s.pct, 0) / systemStats.length)
      : null;

  // Biggest opportunity: among concepts with enough of a track record, the
  // one with the most misses among the student's last (up to) 7 attempts at
  // it - not just all-time worst, so it reflects what's currently going wrong.
  let opportunity: OpportunityInsight | null = null;
  let bestMissed = 1;
  for (const [concept, bucket] of Object.entries(conceptBuckets)) {
    if (bucket.answers.length < 3) continue;
    const recent = [...bucket.answers]
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
      .slice(0, 7);
    const missed = recent.filter((a) => !a.correct).length;
    const missRate = missed / recent.length;
    if (missed >= 2 && missRate >= 0.4 && missed > bestMissed) {
      bestMissed = missed;
      const errorTypeCounts: Record<string, number> = {};
      for (const a of recent) {
        if (!a.correct && a.errorType) errorTypeCounts[a.errorType] = (errorTypeCounts[a.errorType] ?? 0) + 1;
      }
      const primaryProblem =
        Object.entries(errorTypeCounts).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
      opportunity = { concept, missed, total: recent.length, primaryProblem };
    }
  }

  return { totalAnswered, totalCorrect, overallAccuracyPct, masteryPct, systemStats, opportunity };
}
