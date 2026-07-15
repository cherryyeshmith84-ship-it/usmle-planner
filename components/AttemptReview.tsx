"use client";

import { useState } from "react";
import { buildErrorBreakdown, classifyAnswer, formatSeconds } from "@/lib/assessments";
import type { Assessment } from "@/lib/types";

/**
 * Small text link (UWorld-style "Exhibit" link) that opens an image full-size
 * in a lightbox overlay when clicked, instead of the image sitting inline and
 * taking up space in the question/choice list.
 */
function ImageLink({ url, label, onOpen }: { url: string; label: string; onOpen: (url: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(url)}
      className="text-xs font-medium text-brand-400 hover:text-brand-300 underline underline-offset-2"
    >
      {label}
    </button>
  );
}

/**
 * Full question-by-question review of one attempt: which option was picked,
 * whether it was correct/a near-miss/a far-miss, and how long it took.
 * Used both on the student's own results screen and on the admin's
 * per-student attempt detail page.
 */
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
  // Whichever image (question/choice/explanation) is currently open in the
  // full-size lightbox overlay - null means the lightbox is closed.
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

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
            {q.question_image_url && (
              <div className="mb-3">
                <ImageLink url={q.question_image_url} label="View image" onOpen={setLightboxUrl} />
              </div>
            )}
            <div className="space-y-2 mb-3">
              {q.choices.map((c, i) => {
                const isThisCorrect = c.id === q.correct_choice_id;
                const isThisChosen = c.id === chosen;
                return (
                  <div
                    key={c.id}
                    className={`border rounded-xl px-3 py-2 text-sm ${
                      isThisCorrect
                        ? "border-green-700 bg-green-900/20 text-green-300"
                        : isThisChosen
                        ? "border-red-700 bg-red-900/20 text-red-300"
                        : "border-slate-700 text-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span>
                        {String.fromCharCode(65 + i)}. {c.text}
                      </span>
                      {isThisCorrect && <span className="text-xs text-green-400 ml-auto">Correct answer</span>}
                      {isThisChosen && !isThisCorrect && (
                        <span className="text-xs text-red-400 ml-auto">Chosen answer</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {q.explanation_image_url && (
              <div className="mb-2">
                <ImageLink url={q.explanation_image_url} label="View image" onOpen={setLightboxUrl} />
              </div>
            )}
            {q.explanation && (
              <p className="text-sm text-slate-400 border-t border-slate-800 pt-3">{q.explanation}</p>
            )}
            {/* Per-choice images live here, in the explanation section,
                each labeled by its own letter - not attached under the
                answer option itself. */}
            {q.choices.some((c) => c.image_url) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                {q.choices.map((c, i) =>
                  c.image_url ? (
                    <ImageLink
                      key={c.id}
                      url={c.image_url}
                      label={`View image (Choice ${String.fromCharCode(65 + i)})`}
                      onOpen={setLightboxUrl}
                    />
                  ) : null
                )}
              </div>
            )}
          </div>
        );
      })}

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-30 bg-black/85 flex items-center justify-center px-4 py-8"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-white text-2xl leading-none hover:text-slate-300"
          >
            &times;
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt=""
            className="max-w-full max-h-full rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
