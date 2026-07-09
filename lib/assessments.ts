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

/** Splits a flat question list into fixed-size blocks, in order. */
export function chunkIntoBlocks(
  questions: AssessmentQuestion[],
  questionsPerBlock: number
): AssessmentQuestion[][] {
  const size = Math.max(1, questionsPerBlock || 1);
  const blocks: AssessmentQuestion[][] = [];
  for (let i = 0; i < questions.length; i += size) {
    blocks.push(questions.slice(i, i + size));
  }
  return blocks.length > 0 ? blocks : [[]];
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

export type AnswerClass = "correct" | "near" | "far" | "unanswered";

/**
 * Classifies a single answer:
 * - "correct": right answer
 * - "near": picked a choice the question-writer tagged as a close, plausible
 *   distractor (they were in the right ballpark but couldn't discriminate)
 * - "far": picked an unrelated/easily-ruled-out distractor (a fundamentals gap)
 * - "unanswered": left blank
 */
export function classifyAnswer(
  question: AssessmentQuestion,
  chosenId: string | undefined
): AnswerClass {
  if (!chosenId) return "unanswered";
  if (chosenId === question.correct_choice_id) return "correct";
  const chosen = question.choices.find((c) => c.id === chosenId);
  return chosen?.distance === "near" ? "near" : "far";
}

export interface ErrorBreakdown {
  correct: number;
  near: number;
  far: number;
  unanswered: number;
  total: number;
  nearPctOfWrong: number;
  farPctOfWrong: number;
}

/** Tallies correct / near-miss / far-miss / unanswered across a full attempt. */
export function buildErrorBreakdown(
  questions: AssessmentQuestion[],
  answers: Record<string, string>
): ErrorBreakdown {
  let correct = 0;
  let near = 0;
  let far = 0;
  let unanswered = 0;
  for (const q of questions) {
    const cls = classifyAnswer(q, answers[q.id]);
    if (cls === "correct") correct++;
    else if (cls === "near") near++;
    else if (cls === "far") far++;
    else unanswered++;
  }
  const wrong = near + far;
  return {
    correct,
    near,
    far,
    unanswered,
    total: questions.length,
    nearPctOfWrong: wrong > 0 ? Math.round((near / wrong) * 100) : 0,
    farPctOfWrong: wrong > 0 ? Math.round((far / wrong) * 100) : 0,
  };
}

/**
 * Splits a pasted question (stem + lettered/numbered answer choices, like
 * something copied straight out of UWorld) into a question stem and a clean
 * list of choice texts. Returns null if it couldn't find at least 2 options.
 *
 * Recognizes option lines like "A. text", "A) text", "1. text", "1) text".
 * Lines that don't start with a marker are treated as part of the question
 * stem (if before the first option) or a continuation of the previous
 * choice's text (if an option has already started, e.g. a wrapped line).
 * Trailing "(NN%)" UWorld answer-stat annotations are stripped automatically.
 */
export function parsePastedQuestion(
  raw: string
): { question: string; choices: string[] } | null {
  const lines = raw.split(/\r?\n/);
  const optionLineRegex = /^\s*(?:[A-Za-z]|\d{1,2})[.)]\s+(.+)$/;
  const stemLines: string[] = [];
  const choices: string[] = [];
  let inOptions = false;

  for (const line of lines) {
    const match = line.match(optionLineRegex);
    if (match) {
      inOptions = true;
      choices.push(match[1].trim());
    } else if (!inOptions) {
      stemLines.push(line);
    } else {
      const trimmed = line.trim();
      if (trimmed.length > 0 && choices.length > 0) {
        choices[choices.length - 1] = `${choices[choices.length - 1]} ${trimmed}`;
      }
    }
  }

  const question = stemLines.join("\n").trim();
  const cleanChoices = choices
    .map((c) => c.replace(/\s*\(\d{1,3}%\)\s*$/, "").trim())
    .filter(Boolean);

  if (!question || cleanChoices.length < 2) return null;
  return { question, choices: cleanChoices };
}

/**
 * Converts raw "elapsed seconds within the block at first answer" timestamps
 * into approximate per-question time spent, by taking the difference between
 * consecutive questions (in on-screen order) within each block.
 */
export function deriveQuestionTimes(
  blocks: AssessmentQuestion[][],
  rawElapsedAtFirstAnswer: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const block of blocks) {
    let prev = 0;
    for (const q of block) {
      const t = rawElapsedAtFirstAnswer[q.id];
      if (t === undefined) continue;
      out[q.id] = Math.max(0, t - prev);
      prev = t;
    }
  }
  return out;
}
