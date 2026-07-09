"use client";

import { buildErrorBreakdown, classifyAnswer, formatSeconds } from "@/lib/assessments";
import type { Assessment } from "@/lib/types";

export default function AttemptReview({
  assessment,
  answers,
  questionTimes,
}: {
  assessment: Assessment;
  answers: Record<string, string>;
  questionTimes: Record<string, number>;
}) {
  const breakdown = buildErrorBreakdown(assessment.questions, answers);
  const wrongCount = breakdown.near + breakdown.far;
  const times = Object.values(questionTimes);
  const avgSeconds = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;

  return (
    <div className="space-y-4">
      {wrongCount > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-2">Error pattern</h2>
          <p className="text-sm text-slate-400 mb-3">
            Of the {wrongCount} question{wrongCount === 1 ? "" : "s"} missed
            {breakdown.unanswered > 0 ? ` (${breakdown.unanswered} left blank)` : ""}:
          </p>
          <div className="flex gap-6 mb-3">
            <div>
              <p className="text-2xl font-bold text-amber-400">{breakdown.nearPctOfWrong}%</p>
              <p className="text-xs text-slate-400">near misses - close distractor picked</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-400">{breakdown.farPctOfWrong}%</p>
              <p className="text-xs text-slate-400">far misses - unrelated option picked</p>
            </div>
          </div>
          <p className="text-sm text-slate-300 border-t border-slate-800 pt-3">
            {breakdown.near >= breakdown.far
              ? "Most misses were close calls - in the right ballpark but not making the fine distinction between two similar answers. Worth drilling side-by-side comparisons of look-alike diagnoses/drugs."
              : "Most misses were far from the correct answer - these look like gaps in the fundamentals rather than fine-distinction errors. Worth revisiting these topics from first principles."}
          </p>
        </div>
      )}

      {assessment.questions.map((q, idx) => {
        const chosen = answers[q.id];
        const cls = classifyAnswer(q, chosen);
        const seconds = questionTimes[q.id];
        const tookLong = avgSeconds > 0 && seconds !== undefined && seconds > avgSeconds * 1.5;
        return (
          <div key={q.id} className="card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">
                {idx + 1}. {q.question}
              </p>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {seconds !== undefined && (
                  <span
                    className={`text-xs font-semibold rounded-full px-2 py-1 ${
                      tookLong ? "bg-amber-900/40 text-amber-400" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {formatSeconds(seconds)}
                    {tookLong ? " · slow" : ""}
                  </span>
                )}
                <span
                  className={`text-xs font-semibold rounded-full px-2 py-1 ${
                    cls === "correct"
                      ? "bg-green-900/40 text-green-400"
                      : cls === "near"
                      ? "bg-amber-900/40 text-amber-400"
                      : cls === "far"
                      ? "bg-red-900/40 text-red-400"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {cls === "correct"
                    ? "Correct"
                    : cls === "near"
                    ? "Near miss"
                    : cls === "far"
                    ? "Far miss"
                    : "Not answered"}
                </span>
              </div>
            </div>
            <div className="space-y-2 mb-3">
              {q.choices.map((c) => {
                const isThisCorrect = c.id === q.correct_choice_id;
                const isThisChosen = c.id === chosen;
                return (
                  <div
                    key={c.id}
                    className={`flex items-center gap-2 border rounded-xl px-3 py-2 text-sm ${
                      isThisCorrect
                        ? "border-green-700 bg-green-900/20 text-green-300"
                        : isThisChosen
                        ? "border-red-700 bg-red-900/20 text-red-300"
                        : "border-slate-700 text-slate-300"
                    }`}
                  >
                    {c.text}
                    {isThisCorrect && <span className="text-xs text-green-400 ml-auto">Correct answer</span>}
                    {isThisChosen && !isThisCorrect && (
                      <span className="text-xs text-red-400 ml-auto">Chosen answer</span>
                    )}
                  </div>
                );
              })}
            </div>
            {q.explanation && (
              <p className="text-sm text-slate-400 border-t border-slate-800 pt-3">{q.explanation}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
