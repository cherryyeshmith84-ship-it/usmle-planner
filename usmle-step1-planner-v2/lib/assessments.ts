import type { AssessmentQuestion } from "./types";

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function blankChoice() {
  return { id: newId(), text: "" };
}

export function blankQuestion(): AssessmentQuestion {
  return {
    id: newId(),
    question: "",
    choices: [blankChoice(), blankChoice(), blankChoice(), blankChoice()],
    correct_choice_id: "",
    explanation: "",
  };
}

export interface ScoreResult {
  correct: number;
  total: number;
  pct: number;
}

/** Score a set of chosen answers (question id -> choice id) against a question bank. */
export function scoreAttempt(
  questions: AssessmentQuestion[],
  answers: Record<string, string>
): ScoreResult {
  const total = questions.length;
  const correct = questions.filter((q) => answers[q.id] === q.correct_choice_id).length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { correct, total, pct };
}

export function formatSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = m.toString().padStart(2, "0");
  const ss = sec.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
