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
  type ConceptAnswer = { correct: boolean; submittedAt: string; errorType: string | null };
  const conceptBuckets: Record<string, { answers: ConceptAnswer[] }> = {};

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

export interface ConceptStat {
  concept: string;
  correct: number;
  total: number;
  pct: number;
}

export interface TopicStat {
  topic: string;
  correct: number;
  total: number;
  pct: number;
  concepts: ConceptStat[];
}

export interface SystemGridStat {
  system: string;
  correct: number;
  total: number;
  pct: number;
  trend: "up" | "down" | "flat";
  topics: TopicStat[];
}

function trendFromTimeline(timeline: boolean[]): "up" | "down" | "flat" {
  if (timeline.length < 4) return "flat";
  const mid = Math.floor(timeline.length / 2);
  const first = timeline.slice(0, mid);
  const second = timeline.slice(mid);
  const firstPct = first.length ? (first.filter(Boolean).length / first.length) * 100 : 0;
  const secondPct = second.length ? (second.filter(Boolean).length / second.length) * 100 : 0;
  if (secondPct - firstPct >= 8) return "up";
  if (firstPct - secondPct >= 8) return "down";
  return "flat";
}

/**
 * The full System -> Topic -> Concept drill-down behind the Master Grid
 * page - same underlying answer events as computeDashboardInsights, just
 * kept nested instead of flattened to a top-5 list. Topics/concepts only
 * show up once questions have been tagged with meta.topic/primary_concept
 * in the editor - systems with no tagged topics yet still show their
 * overall accuracy, just with an empty topics list.
 */
export function computeMasteryGrid(
  qbankEvents: QBankAnswerEvent[],
  questionById: Map<string, QBankQuestion>
): SystemGridStat[] {
  const sorted = [...qbankEvents].sort(
    (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
  );

  interface TopicBucket {
    correct: number;
    total: number;
    concepts: Map<string, { correct: number; total: number }>;
  }
  interface SystemBucket {
    correct: number;
    total: number;
    timeline: boolean[];
    topics: Map<string, TopicBucket>;
  }
  const systemBuckets = new Map<string, SystemBucket>();

  for (const ev of sorted) {
    const q = questionById.get(ev.questionId);
    if (!q || !ev.choiceId) continue;
    const isCorrect = ev.choiceId === q.correct_choice_id;
    const topic = q.meta?.topic?.trim() || null;
    const concept = q.meta?.primary_concept?.trim() || null;

    for (const system of q.systems ?? []) {
      if (!systemBuckets.has(system)) {
        systemBuckets.set(system, { correct: 0, total: 0, timeline: [], topics: new Map() });
      }
      const sb = systemBuckets.get(system)!;
      sb.total++;
      if (isCorrect) sb.correct++;
      sb.timeline.push(isCorrect);

      if (topic) {
        if (!sb.topics.has(topic)) sb.topics.set(topic, { correct: 0, total: 0, concepts: new Map() });
        const tb = sb.topics.get(topic)!;
        tb.total++;
        if (isCorrect) tb.correct++;

        if (concept) {
          if (!tb.concepts.has(concept)) tb.concepts.set(concept, { correct: 0, total: 0 });
          const cb = tb.concepts.get(concept)!;
          cb.total++;
          if (isCorrect) cb.correct++;
        }
      }
    }
  }

  const result: SystemGridStat[] = [];
  for (const [system, sb] of systemBuckets.entries()) {
    const topics: TopicStat[] = Array.from(sb.topics.entries())
      .map(([topic, tb]) => {
        const concepts: ConceptStat[] = Array.from(tb.concepts.entries())
          .map(([concept, cb]) => ({
            concept,
            correct: cb.correct,
            total: cb.total,
            pct: cb.total > 0 ? Math.round((cb.correct / cb.total) * 100) : 0,
          }))
          .sort((a, b) => b.total - a.total);
        return {
          topic,
          correct: tb.correct,
          total: tb.total,
          pct: tb.total > 0 ? Math.round((tb.correct / tb.total) * 100) : 0,
          concepts,
        };
      })
      .sort((a, b) => b.total - a.total);

    result.push({
      system,
      correct: sb.correct,
      total: sb.total,
      pct: sb.total > 0 ? Math.round((sb.correct / sb.total) * 100) : 0,
      trend: trendFromTimeline(sb.timeline),
      topics,
    });
  }

  return result.sort((a, b) => b.total - a.total);
}

export interface ReviewQueueItem {
  key: string;
  kind: "concept" | "weak_concept";
  label: string;
  priority: "high" | "medium" | "low";
  missed: number;
  total: number;
  missRate: number;
  primaryProblem: string | null;
  relatedConcepts: string[];
  lastMissedAt: string;
  // A representative missed question/choice for this card, used to route
  // "Start Review" into that exact mistake's Error Note + AI practice flow
  // (see app/error-notes/practice/[questionId]/[choiceId]).
  sampleQuestionId: string | null;
  sampleChoiceId: string | null;
}

// One canonical grouping key per question - primary_concept, falling back
// to topic, then subtopic, if not set. This used to fan a single missed
// question out into a separate review-queue entry for every tag it carried
// (primary concept, topic, subtopic, and every secondary concept
// independently), which meant one missed question could spawn 5-10 "due"
// cards, each showing a misleading "missed 2 of your last 2" even though
// the student had only ever answered ONE question touching most of those
// tags. Now each question maps to exactly one primary card; everything
// else it's tagged with becomes supporting "related concepts" context under
// that one card instead of a card of its own.
function canonicalConceptFor(q: QBankQuestion): string | null {
  return (
    q.meta?.primary_concept?.trim() || q.meta?.topic?.trim() || q.meta?.subtopic?.trim() || null
  );
}

/**
 * Smart Review's priority queue - every concept the student hasn't yet
 * "earned back" after missing it. A concept is due if it's had at least one
 * miss among the student's last (up to) 7 attempts at it; priority is set by
 * how often they're still missing it in that recent window. Concepts with
 * zero misses in the recent window are treated as mastered and drop out of
 * the queue entirely - this is deliberately simple (no literal per-day
 * scheduling) rather than a full spaced-repetition date engine.
 *
 * Two kinds of cards:
 * - "concept" cards are keyed by canonicalConceptFor (one per question, not
 *   fanned out) - attempt/miss counts only ever come from questions that
 *   actually share that same primary concept. Every other tag on those
 *   questions (topic, subtopic, secondary concepts, and any Error DNA
 *   "weak concept" from a wrong pick) is collected as deduped
 *   `relatedConcepts` context on the card, not a card of its own.
 * - "weak_concept" cards are a second, independent check: if the exact same
 *   Error DNA "weak concept" tag (the specific mix-up a wrong choice is
 *   tagged with) recurs on its own at least twice, that's real evidence of
 *   a standing weakness even if it hasn't happened twice under the same
 *   primary concept - so it earns its own card. But a weak concept that's
 *   only ever shown up as a secondary association (e.g. mentioned once)
 *   does NOT automatically become a card - it needs its own track record.
 *   If a weak concept happens to already be some question's primary
 *   concept (i.e. it already has a "concept" card), it's skipped here to
 *   avoid a duplicate.
 */
export function computeSmartReviewQueue(
  qbankEvents: QBankAnswerEvent[],
  questionById: Map<string, QBankQuestion>
): ReviewQueueItem[] {
  const sorted = [...qbankEvents].sort(
    (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
  );

  type Answer = {
    correct: boolean;
    submittedAt: string;
    errorType: string | null;
    questionId: string;
    choiceId: string;
  };
  const primaryBuckets: Record<string, { answers: Answer[]; related: Set<string> }> = {};
  const weakBuckets: Record<string, { answers: Answer[] }> = {};

  for (const ev of sorted) {
    const q = questionById.get(ev.questionId);
    if (!q || !ev.choiceId) continue;
    const isCorrect = ev.choiceId === q.correct_choice_id;
    const key = canonicalConceptFor(q);

    let errorType: string | null = null;
    let weakConcept: string | null = null;
    if (!isCorrect) {
      const choice = q.choices.find((c) => c.id === ev.choiceId);
      errorType = choice?.error_type ?? null;
      weakConcept = choice?.weak_concept?.trim() || null;
    }

    if (key) {
      if (!primaryBuckets[key]) primaryBuckets[key] = { answers: [], related: new Set() };
      primaryBuckets[key].answers.push({
        correct: isCorrect,
        submittedAt: ev.submittedAt,
        errorType,
        questionId: ev.questionId,
        choiceId: ev.choiceId,
      });
      const addRelated = (v?: string | null) => {
        const t = v?.trim();
        if (t && t !== key) primaryBuckets[key].related.add(t);
      };
      addRelated(q.meta?.topic);
      addRelated(q.meta?.subtopic);
      for (const sc of q.meta?.secondary_concepts ?? []) addRelated(sc);
      if (!isCorrect) addRelated(weakConcept);
    }

    if (!isCorrect && weakConcept) {
      if (!weakBuckets[weakConcept]) weakBuckets[weakConcept] = { answers: [] };
      weakBuckets[weakConcept].answers.push({
        correct: false,
        submittedAt: ev.submittedAt,
        errorType,
        questionId: ev.questionId,
        choiceId: ev.choiceId,
      });
    }
  }

  const queue: ReviewQueueItem[] = [];

  for (const [key, bucket] of Object.entries(primaryBuckets)) {
    if (bucket.answers.length < 2) continue;
    const recent = [...bucket.answers]
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
      .slice(0, 7);
    const missed = recent.filter((a) => !a.correct).length;
    if (missed === 0) continue;

    const missRate = missed / recent.length;
    const priority: ReviewQueueItem["priority"] =
      missRate >= 0.5 ? "high" : missRate >= 0.3 ? "medium" : "low";

    const errorTypeCounts: Record<string, number> = {};
    for (const a of recent) {
      if (!a.correct && a.errorType) errorTypeCounts[a.errorType] = (errorTypeCounts[a.errorType] ?? 0) + 1;
    }
    const primaryProblem = Object.entries(errorTypeCounts).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
    const lastMissed = recent.find((a) => !a.correct) ?? recent[0];

    queue.push({
      key,
      kind: "concept",
      label: key,
      priority,
      missed,
      total: recent.length,
      missRate,
      primaryProblem,
      relatedConcepts: Array.from(bucket.related).slice(0, 6),
      lastMissedAt: lastMissed.submittedAt,
      sampleQuestionId: lastMissed.questionId,
      sampleChoiceId: lastMissed.choiceId,
    });
  }

  const primaryKeys = new Set(Object.keys(primaryBuckets));
  for (const [weakConcept, bucket] of Object.entries(weakBuckets)) {
    if (bucket.answers.length < 2) continue;
    if (primaryKeys.has(weakConcept)) continue;
    const recent = [...bucket.answers]
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
      .slice(0, 7);

    const errorTypeCounts: Record<string, number> = {};
    for (const a of recent) {
      if (a.errorType) errorTypeCounts[a.errorType] = (errorTypeCounts[a.errorType] ?? 0) + 1;
    }
    const primaryProblem = Object.entries(errorTypeCounts).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;

    queue.push({
      key: weakConcept,
      kind: "weak_concept",
      label: weakConcept,
      priority: recent.length >= 3 ? "high" : "medium",
      missed: recent.length,
      total: recent.length,
      missRate: 1,
      primaryProblem,
      relatedConcepts: [],
      lastMissedAt: recent[0].submittedAt,
      sampleQuestionId: recent[0].questionId,
      sampleChoiceId: recent[0].choiceId,
    });
  }

  const priorityRank: Record<ReviewQueueItem["priority"], number> = { high: 0, medium: 1, low: 2 };
  return queue.sort((a, b) => {
    if (priorityRank[a.priority] !== priorityRank[b.priority]) {
      return priorityRank[a.priority] - priorityRank[b.priority];
    }
    return new Date(b.lastMissedAt).getTime() - new Date(a.lastMissedAt).getTime();
  });
}
