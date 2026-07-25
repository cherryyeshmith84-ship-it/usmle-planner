// Prompt builders for the in-exam "AI Help" chat button. Kept separate from
// aiPrompt.ts (the daily study-coach prompt) since these serve a different
// feature with a different job: explaining concepts during a practice
// question, without just handing over the correct letter.

// The question currently on screen (stem + lettered choices), passed
// through automatically so the student doesn't have to copy/paste it
// themselves - see AiHelper.tsx.
export interface ExamQuestionContext {
  stem: string;
  choices: string[];
}

export function buildExamHelpSystemPrompt(context?: ExamQuestionContext) {
  const base = `
You are a friendly, knowledgeable USMLE Step 1 study helper embedded inside a
practice exam. A student may ask you to explain a term, a lab value, a drug
mechanism, or a concept related to the question they're currently working
on.

Rules:
- Do NOT tell them which lettered answer choice is correct, even if they
  ask directly. Instead, explain the underlying concept and the key
  distinguishing feature(s) they should weigh, so they can reason it out
  themselves.
- Keep answers focused and concise - a few sentences to a short paragraph,
  not an exhaustive textbook entry.
- If asked to just define a term or explain a mechanism, answer directly.
`.trim();

  if (!context || !context.stem.trim()) return base;

  const choiceLines = context.choices
    .map((c, i) => `${String.fromCharCode(65 + i)}. ${c}`)
    .join("\n");

  return `${base}

The student is currently looking at this exact question - you can already
see it below, so answer as if you're looking at it together. Don't ask them
to paste it or describe it to you.

Question:
${context.stem}

Choices:
${choiceLines}`;
}

export function buildExamHelpUserPrompt(message: string) {
  return message.trim();
}
