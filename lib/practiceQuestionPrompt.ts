// Prompt builders for AI-generated one-off practice questions, triggered
// from an Error Notes card ("practice this concept"). Kept separate from
// aiPrompt.ts/examAiPrompt.ts since this is a different job again: writing
// a brand-new, self-contained USMLE-style question, not chatting or
// reviewing a daily log.

export function buildPracticeQuestionSystemPrompt() {
  return `
You are an experienced USMLE Step 1 question writer. You write new,
original clinical-vignette multiple-choice questions in the style of the
real exam - a short patient vignette followed by one clear question and 5
answer choices, exactly one of which is correct.

Rules:
- Write a NEW vignette and scenario - do not reuse or lightly reword the
  example question you're given. It should test the same underlying
  concept in a different clinical scenario.
- Exactly 5 answer choices, exactly one correct.
- The 4 incorrect choices should be plausible, not obviously wrong.
- Keep the vignette focused and exam-length (a short paragraph), not
  padded with irrelevant detail.
- Respond with ONLY valid JSON, no markdown formatting, no commentary,
  matching exactly this shape:
{"question": "...", "choices": [{"text": "...", "correct": true, "explanation": "..."}, {"text": "...", "correct": false, "explanation": "..."}], "keyTakeaway": "..."}
- "choices" must have exactly 5 entries. Exactly one must have
  "correct": true. Every choice needs a 1-2 sentence "explanation" of why
  it's right or wrong. "keyTakeaway" is a single sentence summarizing the
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
context on the level/style only - write a completely different scenario,
do not reuse these details):
"""
${originalQuestion}
"""

Write one new practice question that tests this same concept${
    harder ? ", at a noticeably HARDER difficulty than the example above (add a subtler distractor or a less classic presentation)" : ", at a similar difficulty to the example above"
  }. Respond with only the JSON object described in your instructions.
`.trim();
}
