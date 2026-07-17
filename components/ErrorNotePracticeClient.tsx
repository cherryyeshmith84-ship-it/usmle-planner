"use client";

import { useState } from "react";
import type { GeneratedPracticeQuestion } from "@/app/api/generate-practice-question/route";
import { PRACTICE_SET_SIZE } from "@/lib/practiceQuestionPrompt";

// Asking the AI to write all 10 questions before showing anything made
// generation feel slow. Instead, ask for a small first batch (shows up
// fast) and kick off the rest in the background at the same time - by the
// time the student finishes the first few, the rest have usually arrived.
const FIRST_BATCH_SIZE = 3;

/**
 * The interactive half of the Error Notes "practice this concept" page: a
 * button that asks the AI to write a set of new questions on the exact
 * concept the student just missed (same or harder difficulty, their
 * choice), then walks them through them one at a time with immediate
 * per-choice feedback and a score at the end - all generated fresh each
 * time, not pulled from the existing question pool, so it's a genuinely new
 * attempt rather than a repeat of one they might have half-memorized.
 */
export default function ErrorNotePracticeClient({
  concept,
  weakConcept,
  errorNote,
  originalQuestion,
}: {
  concept: string;
  weakConcept: string | null;
  errorNote: string | null;
  originalQuestion: string;
}) {
  const [harder, setHarder] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<GeneratedPracticeQuestion[] | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);

  async function fetchBatch(count: number): Promise<GeneratedPracticeQuestion[]> {
    try {
      const res = await fetch("/api/generate-practice-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept, weakConcept, errorNote, originalQuestion, harder, count }),
      });
      const data = await res.json();
      if (!res.ok) return [];
      return data.questions ?? [];
    } catch {
      return [];
    }
  }

  async function generate() {
    setLoading(true);
    setError(null);
    setQuestions(null);
    setCurrentIdx(0);
    setSelectedIdx(null);
    setRevealed(false);
    setCorrectCount(0);

    const firstCount = Math.min(FIRST_BATCH_SIZE, PRACTICE_SET_SIZE);
    const restCount = PRACTICE_SET_SIZE - firstCount;

    // Fire both requests together - the second doesn't wait on the first,
    // it just isn't shown until the student reaches it.
    const firstPromise = fetchBatch(firstCount);
    const restPromise = restCount > 0 ? fetchBatch(restCount) : Promise.resolve<GeneratedPracticeQuestion[]>([]);
    if (restCount > 0) setLoadingMore(true);

    const first = await firstPromise;
    setLoading(false);

    if (first.length === 0) {
      setError("AI couldn't write any usable questions right now. Try again.");
      setLoadingMore(false);
      return;
    }
    setQuestions(first);

    if (restCount > 0) {
      const rest = await restPromise;
      setQuestions((prev) => (prev ? [...prev, ...rest] : rest));
      setLoadingMore(false);
    }
  }

  function submitAnswer() {
    if (selectedIdx === null || !questions) return;
    setRevealed(true);
    if (questions[currentIdx].choices[selectedIdx]?.correct) {
      setCorrectCount((c) => c + 1);
    }
  }

  function nextQuestion() {
    setSelectedIdx(null);
    setRevealed(false);
    setCurrentIdx((i) => i + 1);
  }

  function startOver() {
    setQuestions(null);
    setError(null);
    setLoadingMore(false);
  }

  const atEnd = !!questions && currentIdx >= questions.length;
  const finished = atEnd && !loadingMore;
  const waitingForMore = atEnd && loadingMore;
  const currentQuestion = questions && !atEnd ? questions[currentIdx] : null;

  return (
    <div className="space-y-4">
      {!questions && (
        <div className="card">
          <p className="text-sm font-semibold mb-2">
            Practice this concept with {PRACTICE_SET_SIZE} new AI-written questions
          </p>
          <p className="text-xs text-slate-400 mb-3">
            The first {FIRST_BATCH_SIZE} show up quickly so you can start right away - the rest
            write themselves in the background while you're answering.
          </p>
          <label className="flex items-center gap-2 text-sm text-slate-300 mb-3">
            <input
              type="checkbox"
              checked={harder}
              onChange={(e) => setHarder(e.target.checked)}
              className="w-4 h-4"
            />
            Make them harder than the one I missed
          </label>
          {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
          <button type="button" onClick={generate} className="btn-primary" disabled={loading}>
            {loading ? "Writing questions..." : "Generate practice questions"}
          </button>
        </div>
      )}

      {currentQuestion && (
        <div className="card">
          <p className="text-xs text-slate-500 mb-3">
            Question {currentIdx + 1} of {PRACTICE_SET_SIZE}
            {loadingMore ? " (more loading...)" : ""}
          </p>
          <p className="text-sm font-semibold mb-3">{currentQuestion.question}</p>
          <div className="space-y-2 mb-4">
            {currentQuestion.choices.map((c, i) => {
              const isChosen = selectedIdx === i;
              let borderClass = "border-slate-700 hover:border-slate-600";
              if (revealed) {
                if (c.correct) borderClass = "border-green-600 bg-green-900/20";
                else if (isChosen) borderClass = "border-red-600 bg-red-900/20";
              } else if (isChosen) {
                borderClass = "border-brand-400 bg-brand-900/20";
              }
              return (
                <button
                  key={i}
                  type="button"
                  disabled={revealed}
                  onClick={() => setSelectedIdx(i)}
                  className={`w-full text-left border rounded-xl px-3 py-2 text-sm transition ${borderClass}`}
                >
                  {String.fromCharCode(65 + i)}. {c.text}
                </button>
              );
            })}
          </div>

          {!revealed ? (
            <button type="button" onClick={submitAnswer} disabled={selectedIdx === null} className="btn-primary">
              Submit answer
            </button>
          ) : (
            <div className="space-y-3 pt-3 border-t border-slate-800">
              <p
                className={`text-sm font-semibold ${
                  currentQuestion.choices[selectedIdx!]?.correct ? "text-green-400" : "text-red-400"
                }`}
              >
                {currentQuestion.choices[selectedIdx!]?.correct ? "Correct" : "Incorrect"}
              </p>
              {currentQuestion.keyTakeaway && (
                <div className="p-2 rounded bg-brand-900/20 border border-brand-800/40">
                  <p className="text-xs font-semibold text-brand-300 mb-1">Key takeaway</p>
                  <p className="text-sm text-slate-200">{currentQuestion.keyTakeaway}</p>
                </div>
              )}
              <div className="space-y-2">
                {currentQuestion.choices.map((c, i) => (
                  <p key={i} className="text-sm text-slate-300">
                    <span className={`font-semibold ${c.correct ? "text-green-400" : "text-slate-400"}`}>
                      {String.fromCharCode(65 + i)}
                      {c.correct ? " (correct)" : ""}:{" "}
                    </span>
                    {c.explanation}
                  </p>
                ))}
              </div>
              <button type="button" onClick={nextQuestion} className="btn-primary mt-2">
                {currentIdx + 1 >= (questions?.length ?? 0) && !loadingMore ? "See results" : "Next question"}
              </button>
            </div>
          )}
        </div>
      )}

      {waitingForMore && (
        <div className="card text-center">
          <p className="text-sm text-slate-400">Writing the next questions...</p>
        </div>
      )}

      {finished && (
        <div className="card text-center">
          <p className="text-xs text-slate-500 mb-1">Set complete</p>
          <p className="text-3xl font-bold mb-1">
            {correctCount}/{questions!.length}
          </p>
          <p className="text-sm text-slate-400 mb-4">correct on this concept</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <button type="button" onClick={generate} className="btn-primary" disabled={loading}>
              {loading ? "Writing questions..." : "Generate another set"}
            </button>
            <button type="button" onClick={startOver} className="btn-secondary">
              Change difficulty
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
