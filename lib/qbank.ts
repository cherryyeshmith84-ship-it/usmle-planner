import { parsePastedQuestion } from "./assessments";
import {
  DIFFICULTY_LEVELS,
  ERROR_TYPES,
  QUESTION_TYPES,
  STEP1_SUBJECTS,
  STEP1_SYSTEMS,
  type QBankQuestion,
  type QBankTestSession,
  type QuestionDifficulty,
  type QuestionStatus,
} from "./qbankTypes";

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
    meta: {},
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

export interface ChoiceStatRow {
  choice_id: string;
  choice_count: number;
}

/**
 * Turns the raw per-choice answer counts returned by the qbank_choice_stats
 * Supabase function into percentages of the total number of students who
 * answered - used to show a UWorld-style "42%" next to each choice.
 */
export function choiceStatsToPercents(rows: ChoiceStatRow[]): {
  percents: Record<string, number>;
  counts: Record<string, number>;
  total: number;
} {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    if (!row.choice_id) continue;
    counts[row.choice_id] = row.choice_count;
    total += row.choice_count;
  }
  const percents: Record<string, number> = {};
  for (const cid of Object.keys(counts)) {
    percents[cid] = total > 0 ? Math.round((counts[cid] / total) * 100) : 0;
  }
  return { percents, counts, total };
}

// ---------------------------------------------------------------------------
// Full authored-question template parser
// ---------------------------------------------------------------------------

/**
 * Finds each given label's line in `text` (independently, so labels can be
 * searched in any order - the result is assembled by where each one actually
 * falls in the source, not the order given here) and returns the text
 * between each label and whichever other found label comes next by position.
 * Labels that aren't found are simply absent from the result. Anything
 * before the first found label comes back under the empty-string key.
 */
function splitByLabels(text: string, labels: { key: string; regex: RegExp }[]): Record<string, string> {
  const found: { key: string; start: number; end: number }[] = [];
  for (const { key, regex } of labels) {
    const m = regex.exec(text);
    if (m) found.push({ key, start: m.index, end: m.index + m[0].length });
  }
  found.sort((a, b) => a.start - b.start);
  const result: Record<string, string> = {};
  if (found.length === 0) {
    result[""] = text.trim();
    return result;
  }
  result[""] = text.slice(0, found[0].start).trim();
  for (let i = 0; i < found.length; i++) {
    const next = found[i + 1];
    result[found[i].key] = text.slice(found[i].end, next ? next.start : text.length).trim();
  }
  return result;
}

// Hyphen, en dash, or em dash - admins paste this template from different
// sources (docs, chat apps) that render the "A — Close distractor" separator
// differently.
const DASH = "[-–—]";

/**
 * Splits a stem from its answer choices two ways: first the classic
 * lettered/numbered format ("A. text" / "1) text"), and if that finds
 * nothing, a fallback for a bare list of choices with no marker at all -
 * one option per line, straight under the vignette (e.g. a plain list of
 * drug names). The fallback finds the boundary at the LAST "?" in the text,
 * since the vignette's closing question is a reliable divider between the
 * stem and the option list regardless of how the rest is formatted.
 */
function parseStemAndChoicesFlexible(preamble: string): { question: string; choices: string[] } | null {
  const lettered = parsePastedQuestion(preamble);
  if (lettered) return lettered;

  const qIdx = preamble.lastIndexOf("?");
  if (qIdx === -1) return null;
  const question = preamble.slice(0, qIdx + 1).trim();
  const choices = preamble
    .slice(qIdx + 1)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!question || choices.length < 2) return null;
  return { question, choices };
}

export interface ParsedQBankChoice {
  text: string;
  distance?: "near" | "far";
  rationale?: string;
  error_note?: string;
  error_type?: string;
  confused_with?: string;
  weak_concept?: string;
  key_concept?: string;
}

export interface ParsedQBankTemplate {
  question: string;
  choices: ParsedQBankChoice[];
  correctIndex: number; // -1 if it couldn't be determined
  educationalObjective: string;
  explanation: string;
  keyTakeaway: string;
  examTrap: string;
  subjects: string[];
  systems: string[];
  topic: string;
  subtopic: string;
  primaryConcept: string;
  secondaryConcepts: string[];
  difficulty: QuestionDifficulty | "";
  questionType: string;
}

/**
 * Parses the full authored-question template (vignette + lettered choices +
 * correct answer + distractor classification + educational objective + main
 * explanation + key takeaway + exam trap + per-choice explanations with
 * Error DNA fields + subjects/systems checklists + classification block)
 * into every field the Question Editor form has - so an admin can paste one
 * fully-written question and have the whole form fill itself in, instead of
 * retyping each piece by hand into its own box.
 *
 * Degrades gracefully: any section not present in the paste is just left
 * blank rather than failing the whole parse, as long as the question stem
 * and at least 2 lettered choices are found (same minimum bar as the plain
 * parsePastedQuestion helper this builds on).
 */
export function parseFullQBankQuestionTemplate(raw: string): ParsedQBankTemplate | null {
  const top = splitByLabels(raw, [
    { key: "correctAnswer", regex: /^\s*Correct answer\s*:?\s*$/im },
    { key: "distractorClassification", regex: /^\s*\d*\.?\s*Distractor Classification\s*$/im },
    { key: "questionImage", regex: /^\s*\d*\.?\s*Question Image\s*$/im },
    { key: "educationalObjective", regex: /^\s*\d*\.?\s*Educational Objective\s*$/im },
    { key: "mainExplanation", regex: /^\s*\d*\.?\s*Main Explanation\s*$/im },
    { key: "explanationImage", regex: /^\s*\d*\.?\s*Explanation Image\s*$/im },
    { key: "keyTakeaway", regex: /^\s*\d*\.?\s*Key Takeaway\s*$/im },
    { key: "examTrap", regex: /^\s*\d*\.?\s*Exam Trap\s*$/im },
    { key: "perChoiceExplanations", regex: /^\s*\d*\.?\s*Per-Choice Explanations\s*$/im },
    { key: "subjects", regex: /^\s*\d*\.?\s*Subjects\b.*$/im },
    { key: "systems", regex: /^\s*\d*\.?\s*Systems\b.*$/im },
    { key: "classification", regex: /^\s*\d*\.?\s*Classification\s*$/im },
  ]);

  const stemAndChoices = parseStemAndChoicesFlexible(top[""] ?? raw);
  if (!stemAndChoices) return null;

  const letters = stemAndChoices.choices.map((_, i) => String.fromCharCode(65 + i));

  // Correct answer letter - prefer the explicit "Correct answer" block,
  // fall back to whichever letter the Distractor Classification block
  // marks as "Correct" if that block is missing or unreadable.
  let correctLetter: string | null = null;
  const correctAnswerMatch = (top.correctAnswer ?? "").match(/^\s*\(?([A-Za-z])\)?[.)]/);
  if (correctAnswerMatch) correctLetter = correctAnswerMatch[1].toUpperCase();

  // Handles both "A — Close distractor" and a bulleted "* A. Cabergoline —
  // Close distractor" (repeating the choice text before the dash) - the
  // classification is always whatever comes after the LAST dash on the line.
  const distractorMap = new Map<string, string>();
  const distractorRegex = new RegExp(`^\\s*[*•]?\\s*\\(?([A-Za-z])\\)?[.)]?[^\\n]*${DASH}\\s*([^\\n]+)$`, "gm");
  let dm: RegExpExecArray | null;
  while ((dm = distractorRegex.exec(top.distractorClassification ?? ""))) {
    distractorMap.set(dm[1].toUpperCase(), dm[2].trim());
  }
  if (!correctLetter) {
    for (const [letter, label] of distractorMap.entries()) {
      if (/correct/i.test(label) && !/incorrect/i.test(label)) {
        correctLetter = letter;
        break;
      }
    }
  }

  // Per-choice explanation blocks, keyed by letter. Tries "Choice A — text"
  // headers first; if none are found, falls back to a bare "A. text" header
  // (no "Choice" word, no dash) - the other format seen in these pastes.
  const perChoiceText = top.perChoiceExplanations ?? "";
  const headers: { letter: string; start: number; end: number }[] = [];
  let cm: RegExpExecArray | null;
  const choiceHeaderRegex = new RegExp(`^\\s*Choice\\s+([A-Za-z])\\s*${DASH}.*$`, "gim");
  while ((cm = choiceHeaderRegex.exec(perChoiceText))) {
    headers.push({ letter: cm[1].toUpperCase(), start: cm.index, end: cm.index + cm[0].length });
  }
  if (headers.length === 0) {
    const bareHeaderRegex = /^\s*\(?([A-Za-z])\)?[.)]\s+\S.*$/gm;
    while ((cm = bareHeaderRegex.exec(perChoiceText))) {
      headers.push({ letter: cm[1].toUpperCase(), start: cm.index, end: cm.index + cm[0].length });
    }
  }
  const choiceBlocks = new Map<string, string>();
  for (let i = 0; i < headers.length; i++) {
    const next = headers[i + 1];
    choiceBlocks.set(headers[i].letter, perChoiceText.slice(headers[i].end, next ? next.start : perChoiceText.length));
  }

  let correctIndex = correctLetter ? letters.indexOf(correctLetter) : -1;
  if (correctIndex === -1) {
    // Last-resort fallback: a per-choice block whose first line explicitly
    // says "Correct" without "Incorrect".
    for (const letter of letters) {
      const firstLine = (choiceBlocks.get(letter) ?? "").trim().split(/\r?\n/)[0] ?? "";
      if (/correct/i.test(firstLine) && !/incorrect/i.test(firstLine)) {
        correctIndex = letters.indexOf(letter);
        break;
      }
    }
  }

  // Each label can appear either alone on its own line with the value below
  // ("Error Note\n<value>") or inline with a colon ("Error note: <value>") -
  // no trailing "$" anchor here so the match only consumes the label itself
  // (plus an optional colon and the whitespace/newline after it), leaving
  // the value - wherever it starts - as everything up to the next label.
  const choiceSubLabels = [
    { key: "imageForChoice", regex: /^\s*Image for choice\b[^\n:]*:?\s*/im },
    { key: "errorNote", regex: /^\s*Error note\s*:?\s*/im },
    { key: "errorType", regex: /^\s*Error type\s*:?\s*/im },
    { key: "confusedWith", regex: /^\s*Confused with\s*:?\s*/im },
    { key: "weakConcept", regex: /^\s*Weak concept\s*:?\s*/im },
  ];

  const choices: ParsedQBankChoice[] = stemAndChoices.choices.map((text, i) => {
    const letter = letters[i];
    const isCorrect = i === correctIndex;
    const block = choiceBlocks.get(letter) ?? "";
    const sub = splitByLabels(block, choiceSubLabels);
    // Strip the leading "❌ Incorrect - ..." / "✅ Correct" marker line off
    // the rationale, however the emoji happened to survive copy/paste.
    const rationale = (sub[""] ?? "").replace(/^[^\n]*?\b(Incorrect|Correct)\b[^\n]*\n?/i, "").trim();

    const classification = distractorMap.get(letter) ?? "";
    const distance: "near" | "far" | undefined = /close/i.test(classification)
      ? "near"
      : /far/i.test(classification)
      ? "far"
      : undefined;

    const errorNoteText = sub.errorNote ?? "";
    const errorTypeText = sub.errorType ?? "";

    if (isCorrect) {
      return {
        text,
        rationale: rationale || undefined,
        // The template puts the correct choice's one-line takeaway under
        // "Error Note" too (to keep every choice block the same shape) -
        // the form's field for the correct choice is "Key concept", so
        // that's where it belongs.
        key_concept: errorNoteText || undefined,
      };
    }

    return {
      text,
      distance,
      rationale: rationale || undefined,
      error_note: errorNoteText || undefined,
      error_type: ERROR_TYPES.find((t) => t.toLowerCase() === errorTypeText.toLowerCase()) || undefined,
      confused_with: sub.confusedWith || undefined,
      weak_concept: sub.weakConcept || undefined,
    };
  });

  const classificationText = top.classification ?? "";
  function field(label: string): string {
    const m = classificationText.match(new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, "im"));
    return m ? m[1].trim() : "";
  }
  const topic = field("Topic");
  const subtopic = field("Subtopic");
  const primaryConcept = field("Primary Concept");
  const secondaryConceptsRaw = field("Secondary Concepts");
  const secondaryConcepts = secondaryConceptsRaw
    ? secondaryConceptsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const difficultyRaw = field("Difficulty").toLowerCase();
  const difficulty = (DIFFICULTY_LEVELS as readonly string[]).includes(difficultyRaw)
    ? (difficultyRaw as QuestionDifficulty)
    : "";
  const questionTypeRaw = field("Question Type");
  const questionType = QUESTION_TYPES.find((t) => t.toLowerCase() === questionTypeRaw.toLowerCase()) || questionTypeRaw;

  function checkedTags(text: string, known: readonly string[]): string[] {
    const out: string[] = [];
    const regex = /^\s*[☑✅✔][ \t]*(.+)$/gm; // checked box / checkmark glyphs
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text))) {
      const rawTag = m[1].trim();
      const match = known.find((k) => k.toLowerCase() === rawTag.toLowerCase());
      if (match && !out.includes(match)) out.push(match);
    }
    return out;
  }
  const subjects = checkedTags(top.subjects ?? "", STEP1_SUBJECTS);
  const systems = checkedTags(top.systems ?? "", STEP1_SYSTEMS);

  return {
    question: stemAndChoices.question,
    choices,
    correctIndex,
    educationalObjective: top.educationalObjective ?? "",
    explanation: top.mainExplanation ?? "",
    keyTakeaway: top.keyTakeaway ?? "",
    examTrap: top.examTrap ?? "",
    subjects,
    systems,
    topic,
    subtopic,
    primaryConcept,
    secondaryConcepts,
    difficulty,
    questionType,
  };
}
