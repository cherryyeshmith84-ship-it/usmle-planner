import type { QBankQuestion, QBankTestSession, QuestionStatus } from "./qbankTypes";

export function newQBankId() {
  return Math.random().toString(36).slice(2, 10);
}

export function blankQBankChoice() {
  return { id: newQBankId(), text: "" };
}

export function blankQBankQuestion(): Omit<QBankQuestion, "id"> {
  return {
    question: "",
    choices: [blankQBankChoice(), blankQBankChoice(), blankQBankChoice(), blankQBankChoice()],
    correct_choice_id: "",
    explanation: "",
    subjects: [],
    systems: [],
  };
}

/**
 * For every question in the pool, works out its status for this student:
 * - "unused": never appeared in a submitted test
 * - "correct" / "incorrect": based on the most recent submitted test that
 *   included it (whichever came later wins, so retaking updates the status)
 * - "omitted": appeared in a submitted test but was left blank
 *
 * "Marked" is tracked separately (a question can be marked AND correct at
 * the same time), so it's returned as its own map.
 */
export function computeQuestionStatuses(
  questions: QBankQuestion[],
  sessions: QBankTestSession[],
  markedIds: Set<string>
): { statuses: Record<string, QuestionStatus>; marked: Record<string, boolean> } {
  const statuses: Record<string, QuestionStatus> = {};
  for (const q of questions) statuses[q.id] = "unused";

  // Only submitted sessions count toward status - an in-progress session
  // shouldn't mark its questions as "used" until it's actually finished.
  const submitted = sessions
    .filter((s) => !!s.submitted_at)
    .sort((a, b) => new Date(a.submitted_at!).getTime() - new Date(b.submitted_at!).getTime());

  for (const session of submitted) {
    for (const qid of session.question_ids) {
      const answer = session.answers?.[qid];
      const question = questions.find((q) => q.id === qid);
      if (!question) continue;
      if (!answer) {
        statuses[qid] = "omitted";
      } else {
        statuses[qid] = answer === question.correct_choice_id ? "correct" : "incorrect";
      }
    }
  }

  const marked: Record<string, boolean> = {};
  for (const id of markedIds) marked[id] = true;

  return { statuses, marked };
}

export interface StatusCounts {
  unused: number;
  correct: number;
  incorrect: number;
  omitted: number;
  marked: number;
}

export function countByStatus(
  questions: QBankQuestion[],
  statuses: Record<string, QuestionStatus>,
  marked: Record<string, boolean>
): StatusCounts {
  const counts: StatusCounts = { unused: 0, correct: 0, incorrect: 0, omitted: 0, marked: 0 };
  for (const q of questions) {
    const s = statuses[q.id] ?? "unused";
    counts[s]++;
    if (marked[q.id]) counts.marked++;
  }
  return counts;
}

export function countByTag(questions: QBankQuestion[], field: "subjects" | "systems"): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const q of questions) {
    for (const tag of q[field]) {
      counts[tag] = (counts[tag] ?? 0) + 1;
    }
  }
  return counts;
}

/** Fisher-Yates shuffle - doesn't mutate the input array. */
export function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function filterPool(options: {
  questions: QBankQuestion[];
  statuses: Record<string, QuestionStatus>;
  marked: Record<string, boolean>;
  statusFilter: string[]; // subset of "unused" | "correct" | "incorrect" | "omitted" | "marked"
  subjects: string[];
  systems: string[];
}): QBankQuestion[] {
  const { questions, statuses, marked, statusFilter, subjects, systems } = options;
  return questions.filter((q) => {
    if (statusFilter.length > 0) {
      const s = statuses[q.id] ?? "unused";
      const matchesStatus =
        statusFilter.includes(s) || (statusFilter.includes("marked") && marked[q.id]);
      if (!matchesStatus) return false;
    }
    if (subjects.length > 0 && !q.subjects.some((s) => subjects.includes(s))) return false;
    if (systems.length > 0 && !q.systems.some((s) => systems.includes(s))) return false;
    return true;
  });
}
