"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { GeneratedPracticeQuestion } from "@/app/api/generate-practice-question/route";
import { PRACTICE_SET_SIZE } from "@/lib/practiceQuestionPrompt";

// Asking the AI to write all 10 questions before showing anything made
// generation feel slow. Instead, ask for a small first batch (shows up
// fast) and kick off the rest in the background at the same time - by the
// time the student finishes the first few, the rest have usually arrived.
// Kept to just 1 question so that first screen appears as fast as possible.
const FIRST_BATCH_SIZE = 1;

/**
 * Steps 2 and 3 of the Error Notes "Master This Weakness" flow (step 1,
 * "Quick Fix", is the plain-language mistake recap rendered by the parent
 * page above this component). Step 2, "Targeted Practice", asks the AI to
 * write a fresh set of questions on the exact concept the student just
 * missed - generated new each time, not pulled from the pool, so it's a
 * genuine re-test rather than a repeat of one they might have
 * half-memorized. Step 3, "Retest Later", logs every answer to
 * concept_practice_attempts so Smart Review can factor real practice
 * performance into this concept's mastery state later, instead of ending
 * the session with nothing to show for it beyond an in-the-moment score.
 */
export default function ErrorNotePracticeClient({
  concept,
  weakConcept,
  errorNote,
  originalQuestion,
  userId,
}: {
  concept: string;
  weakConcept: string | null;
  errorNote: string | null;
  originalQuestion: string;
  userId: string;
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
    const isCorrect = !!questions[currentIdx].choices[selectedIdx]?.correct;
    if (isCorrect) setCorrectCount((c) => c + 1);

    // Log this attempt so Smart Review can eventually confirm retention
    // from real practice results, not just the in-session score. Best
    // effort - a logging failure shouldn't block the student from
    // continuing their practice set.
    const supabase = createClient();
    supabase
      .from("concept_practice_attempts")
      .insert({ user_id: userId, concept, correct: isCorrect, harder })
      .then(() => {});
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
      {!finished && (
        <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide">
          Step 2 of 3 &middot; Targeted Practice
        </p>
      )}

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
        <div className="space-y-4">
          <div className="card text-center">
            <p className="text-xs text-slate-500 mb-1">Targeted Practice complete</p>
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

          <div className="card border-purple-900/40">
            <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-2">
              Step 3 of 3 &middot; Retest Later
            </p>
            <p className="text-sm text-slate-300 mb-3">
              Every answer from this set has been logged against{" "}
              <span className="font-semibold text-slate-200">{concept}</span>. Getting it right
              once here isn&apos;t the same as retention - Smart Review will bring this concept
              back on its own after some time to confirm you&apos;ve actually got it, instead of
              taking today&apos;s score as the final word.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/smart-review" className="btn-secondary text-sm">
                Go to Smart Review
              </Link>
              <Link href="/error-notes" className="btn-secondary text-sm">
                Back to Error Notes
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
