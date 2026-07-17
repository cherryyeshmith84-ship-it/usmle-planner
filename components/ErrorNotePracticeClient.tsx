"use client";

import { useState } from "react";
import type { GeneratedPracticeQuestion } from "@/app/api/generate-practice-question/route";

/**
 * The interactive half of the Error Notes "practice this concept" page: a
 * button that asks the AI to write a brand-new question on the exact
 * concept the student just missed (same or harder difficulty, their
 * choice), then lets them answer it and see per-choice feedback - all
 * generated fresh each time, not pulled from the existing question pool,
 * so it's a genuinely new attempt rather than a repeat of one they might
 * have half-memorized.
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
  const [error, setError] = useState<string | null>(null);
  const [practiceQuestion, setPracticeQuestion] = useState<GeneratedPracticeQuestion | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    setSelectedIdx(null);
    setRevealed(false);
    try {
      const res = await fetch("/api/generate-practice-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept, weakConcept, errorNote, originalQuestion, harder }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong generating a question.");
        setPracticeQuestion(null);
      } else {
        setPracticeQuestion(data.practiceQuestion);
      }
    } catch {
      setError("Couldn't reach the AI. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {!practiceQuestion && (
        <div className="card">
          <p className="text-sm font-semibold mb-2">Practice this concept with a new AI-written question</p>
          <p className="text-xs text-slate-400 mb-3">
            Generates a brand-new question on the same concept - a different scenario, not the one
            you just saw - so you can check whether it's actually stuck.
          </p>
          <label className="flex items-center gap-2 text-sm text-slate-300 mb-3">
            <input
              type="checkbox"
              checked={harder}
              onChange={(e) => setHarder(e.target.checked)}
              className="w-4 h-4"
            />
            Make it harder than the one I missed
          </label>
          {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
          <button type="button" onClick={generate} className="btn-primary" disabled={loading}>
            {loading ? "Writing a question..." : "Generate practice question"}
          </button>
        </div>
      )}

      {practiceQuestion && (
        <div className="card">
          <p className="text-sm font-semibold mb-3">{practiceQuestion.question}</p>
          <div className="space-y-2 mb-4">
            {practiceQuestion.choices.map((c, i) => {
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
            <button
              type="button"
              onClick={() => setRevealed(true)}
              disabled={selectedIdx === null}
              className="btn-primary"
            >
              Submit answer
            </button>
          ) : (
            <div className="space-y-3 pt-3 border-t border-slate-800">
              <p
                className={`text-sm font-semibold ${
                  practiceQuestion.choices[selectedIdx!]?.correct ? "text-green-400" : "text-red-400"
                }`}
              >
                {practiceQuestion.choices[selectedIdx!]?.correct ? "Correct" : "Incorrect"}
              </p>
              {practiceQuestion.keyTakeaway && (
                <div className="p-2 rounded bg-brand-900/20 border border-brand-800/40">
                  <p className="text-xs font-semibold text-brand-300 mb-1">Key takeaway</p>
                  <p className="text-sm text-slate-200">{practiceQuestion.keyTakeaway}</p>
                </div>
              )}
              <div className="space-y-2">
                {practiceQuestion.choices.map((c, i) => (
                  <p key={i} className="text-sm text-slate-300">
                    <span className={`font-semibold ${c.correct ? "text-green-400" : "text-slate-400"}`}>
                      {String.fromCharCode(65 + i)}
                      {c.correct ? " (correct)" : ""}:{" "}
                    </span>
                    {c.explanation}
                  </p>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setPracticeQuestion(null);
                    setError(null);
                  }}
                  className="btn-secondary"
                >
                  Try another
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
