import type { QBankQuestion } from "./qbankTypes";
import { canonicalConceptFor, type QBankAnswerEvent } from "./masteryDashboard";

export type MasteryState = "learning" | "improving" | "strong";

export interface PracticeAttempt {
  concept: string;
  correct: boolean;
  createdAt: string;
}

export const MASTERY_LABELS: Record<MasteryState, string> = {
  learning: "Learning",
  improving: "Improving",
  strong: "Strong",
};

/**
 * Turns one concept's answer history - real Question Bank attempts AND
 * "Targeted Practice" (AI question) attempts, merged into one timeline -
 * into a Learning -> Improving -> Strong state.
 *
 * The distinction that matters: getting a couple of AI practice questions
 * right in the same sitting only proves you can do it right now, with the
 * mistake still fresh - it does NOT prove retention. "Strong" specifically
 * requires a QUESTION BANK attempt (i.e. one that came via Smart Review
 * resurfacing the concept later) answered correctly AFTER the most recent
 * practice session - a genuine delayed retest, not just back-to-back
 * practice reps. Without that delayed confirmation, doing well in practice
 * only earns "Improving".
 */
export function computeConceptMasteryState(
  qbankAnswers: { correct: boolean; submittedAt: string }[],
  practiceAnswers: { correct: boolean; createdAt: string }[]
): MasteryState | null {
  type Entry = { source: "qbank" | "practice"; correct: boolean; at: number };
  const entries: Entry[] = [
    ...qbankAnswers.map((e) => ({ source: "qbank" as const, correct: e.correct, at: new Date(e.submittedAt).getTime() })),
    ...practiceAnswers.map((e) => ({ source: "practice" as const, correct: e.correct, at: new Date(e.createdAt).getTime() })),
  ].sort((a, b) => a.at - b.at);

  if (entries.length < 2) return null;

  const last = entries[entries.length - 1];
  const secondLast = entries[entries.length - 2];
  if (!last.correct || !secondLast.correct) return "learning";

  const lastPracticeAt = [...entries].reverse().find((e) => e.source === "practice")?.at ?? null;
  const hasDelayedQbankConfirmation = entries.some(
    (e) => e.source === "qbank" && lastPracticeAt !== null && e.at > lastPracticeAt
  );

  return hasDelayedQbankConfirmation ? "strong" : "improving";
}

/**
 * Batch version used by pages that need a state per concept at once
 * (Error Notes, Smart Review) - groups qbank answer events the same way
 * Smart Review does (canonicalConceptFor: primary concept, falling back to
 * topic, then subtopic) and matches them up with practice attempts logged
 * under that same concept string.
 */
export function computeAllConceptMasteryStates(
  qbankEvents: QBankAnswerEvent[],
  questionById: Map<string, QBankQuestion>,
  practiceAttempts: PracticeAttempt[]
): Map<string, MasteryState> {
  const qbankByConcept = new Map<string, { correct: boolean; submittedAt: string }[]>();
  for (const ev of qbankEvents) {
    const q = questionById.get(ev.questionId);
    if (!q || !ev.choiceId) continue;
    const key = canonicalConceptFor(q);
    if (!key) continue;
    if (!qbankByConcept.has(key)) qbankByConcept.set(key, []);
    qbankByConcept.get(key)!.push({
      correct: ev.choiceId === q.correct_choice_id,
      submittedAt: ev.submittedAt,
    });
  }

  const practiceByConcept = new Map<string, { correct: boolean; createdAt: string }[]>();
  for (const p of practiceAttempts) {
    if (!practiceByConcept.has(p.concept)) practiceByConcept.set(p.concept, []);
    practiceByConcept.get(p.concept)!.push({ correct: p.correct, createdAt: p.createdAt });
  }

  const allConcepts = new Set([...qbankByConcept.keys(), ...practiceByConcept.keys()]);
  const result = new Map<string, MasteryState>();
  for (const concept of allConcepts) {
    const state = computeConceptMasteryState(
      qbankByConcept.get(concept) ?? [],
      practiceByConcept.get(concept) ?? []
    );
    if (state) result.set(concept, state);
  }
  return result;
}
