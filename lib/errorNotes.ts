// Shared helpers behind Error Notes: turning a raw wrong-choice + its Error
// DNA tags into a plain-language explanation of the actual mistake, instead
// of just dumping the tag fields. Used by both the Error Notes list page and
// the per-mistake AI practice page.

/**
 * Pulls out just the final question ("Which of the following...?") from a
 * full vignette, so a student can be shown a reminder of exactly what was
 * being asked without re-reading the whole stem. Falls back to the last
 * ~200 characters if there's no "?" to anchor on.
 */
export function extractQuestionAsk(questionText: string): string {
  const trimmed = (questionText || "").trim();
  if (!trimmed) return "";
  const qIdx = trimmed.lastIndexOf("?");
  if (qIdx === -1) return trimmed.length > 200 ? `...${trimmed.slice(-200)}` : trimmed;
  const before = trimmed.slice(0, qIdx);
  const sentenceStart = Math.max(before.lastIndexOf(". "), before.lastIndexOf("\n"));
  const start = sentenceStart === -1 ? 0 : sentenceStart + 2;
  return trimmed.slice(start, qIdx + 1).trim();
}

/**
 * Builds the "here's what actually went wrong" recap: what they picked and
 * why that choice is tempting, what the question was really asking, and why
 * the correct answer is the correct answer - the same shape as the example
 * the coach asked for ("they picked increased PTH because of MEN1, but the
 * question asked why they're getting diarrhea - that's the VIPoma/VIP").
 */
export function buildReframedExplanation(input: {
  chosenText: string;
  correctText: string;
  confusedWith: string | null;
  weakConcept: string | null;
  correctKeyConcept: string | null;
  questionAsk: string;
}): string {
  const { chosenText, correctText, confusedWith, weakConcept, correctKeyConcept, questionAsk } = input;
  const becausePart = confusedWith
    ? `probably because it fits with ${confusedWith}`
    : weakConcept
    ? `a mix-up around ${weakConcept}`
    : "a related but different concept";
  const askPart = questionAsk ? ` But re-read what was actually being asked: "${questionAsk}"` : "";
  const correctPart = correctKeyConcept
    ? ` The correct answer is "${correctText}" - ${correctKeyConcept}`
    : ` The correct answer is "${correctText}."`;
  return `You picked "${chosenText}" - ${becausePart}.${askPart}${correctPart}`;
}
