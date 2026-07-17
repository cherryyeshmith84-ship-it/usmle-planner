// Prompt builders for AI-generated practice question SETS, triggered from
// an Error Notes card ("practice this concept"). Kept separate from
// aiPrompt.ts/examAiPrompt.ts since this is a different job again: writing
// a batch of brand-new, self-contained USMLE-style questions, not chatting
// or reviewing a daily log.

export const PRACTICE_SET_SIZE = 15;

export function buildPracticeQuestionSystemPrompt() {
  return `
You are an experienced USMLE Step 1 question writer. You write new,
original clinical-vignette multiple-choice questions in the style of the
real exam - a short patient vignette followed by one clear question and 5
answer choices, exactly one of which is correct.

You will be asked to write a SET of ${PRACTICE_SET_SIZE} such questions at
once, all testing the same underlying concept. Rules:
- Every question in the set must test the same core concept, but each one
  needs its own distinct vignette - vary the patient demographics,
  presentation, and specific wording of the distractors across all
  ${PRACTICE_SET_SIZE} so none of them feel like a reworded copy of another,
  and none should reuse or lightly reword the example question you're given.
- Exactly 5 answer choices per question, exactly one correct.
- The 4 incorrect choices per question should be plausible, not obviously
  wrong.
- Keep each vignette focused and exam-length (a short paragraph), not
  padded with irrelevant detail.
- Respond with ONLY valid JSON, no markdown formatting, no code fences, no
  commentary before or after - matching exactly this shape:
{"questions": [{"question": "...", "choices": [{"text": "...", "correct": true, "explanation": "..."}, {"text": "...", "correct": false, "explanation": "..."}], "keyTakeaway": "..."}]}
- "questions" must have exactly ${PRACTICE_SET_SIZE} entries. Each entry's
  "choices" must have exactly 5 entries, exactly one with "correct": true.
  Every choice needs a 1-2 sentence "explanation" of why it's right or
  wrong. "keyTakeaway" is a single sentence summarizing that question's
  core teaching point.
`.trim();
}

export function buildPracticeQuestionUserPrompt(opts: {
  concept: string;
  weakConcept: string | null;
  errorNote: string | null;
  originalQuestion: string;
  harder: boolean;
}) {
  const { concept, weakConcept, errorNote, originalQuestion, harder } = opts;
  return `
The student keeps missing questions related to this concept: ${concept}
${weakConcept ? `Specifically, their weak spot is: ${weakConcept}` : ""}
${errorNote ? `The mix-up they keep making: ${errorNote}` : ""}

Here is an example of a question on this concept they got wrong (for
context on the level/style only - write ${PRACTICE_SET_SIZE} completely
different scenarios, do not reuse these details):
"""
${originalQuestion}
"""

Write a set of ${PRACTICE_SET_SIZE} new practice questions that all test
this same concept${
    harder
      ? ", at a noticeably HARDER difficulty than the example above (subtler distractors, less classic presentations)"
      : ", at a similar difficulty to the example above"
  }. Respond with only the JSON object described in your instructions.
`.trim();
}
