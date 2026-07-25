"use client";

import { useState } from "react";
import { buildErrorBreakdown, classifyAnswer, formatSeconds } from "@/lib/assessments";
import { splitAnswerTableRow } from "@/lib/qbank";
import type { Assessment } from "@/lib/types";
import QuestionNavigator from "./QuestionNavigator";
import AiHelper from "./AiHelper";
import type { ExamTheme, FontSize } from "./ExamSettings";

// Mirrors the same map in QBankTake.tsx/AssessmentTake.tsx - kept local
// rather than shared since it's a one-line lookup, same convention as the
// rest of this codebase's small per-file helpers.
const FONT_SIZE_PX: Record<FontSize, string> = { sm: "13px", md: "14px", lg: "17px" };

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
 * Renders each choice's own short explanation (typed by the admin directly
 * under that choice in the editor) plus its image link, one line per choice,
 * right inside the explanation section - so "why B is wrong" and B's image
 * sit together, instead of the admin having to place manual markers.
 * Choices with neither a rationale nor an image are skipped entirely.
 */
function ChoiceExplanations({
  choices,
  correctChoiceId,
  onOpen,
}: {
  choices: {
    id: string;
    rationale?: string | null;
    image_url?: string | null;
    error_note?: string | null;
    key_concept?: string | null;
  }[];
  correctChoiceId: string;
  onOpen: (url: string) => void;
}) {
  const relevant = choices.filter((c) => c.rationale || c.image_url || c.error_note || c.key_concept);
  if (relevant.length === 0) return null;
  return (
    <div className="mt-3 space-y-2">
      {choices.map((c, i) => {
        if (!c.rationale && !c.image_url && !c.error_note && !c.key_concept) return null;
        const isCorrect = c.id === correctChoiceId;
        return (
          <div key={c.id} className="text-sm text-slate-300">
            <p>
              <span className={`font-semibold ${isCorrect ? "text-green-400" : "text-slate-400"}`}>
                Choice {String.fromCharCode(65 + i)}
                {isCorrect ? " (correct)" : ""}:{" "}
              </span>
              {c.rationale}
              {c.image_url && (
                <span className="ml-2 align-middle">
                  <ImageLink url={c.image_url} label="View image" onOpen={onOpen} />
                </span>
              )}
            </p>
            {c.error_note && <p className="text-xs text-amber-400 mt-1">Error note: {c.error_note}</p>}
            {isCorrect && c.key_concept && (
              <p className="text-xs text-brand-300 mt-1">Key concept: {c.key_concept}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Full question-by-question review of one attempt: which option was picked,
 * whether it was correct/a near-miss/a far-miss, and how long it took. Used
 * both on the student's own results screen and on the admin's per-student
 * attempt detail page.
 *
 * Only one question's full detail is shown at a time - pick a number from
 * the side rail to open it, same click-to-expand pattern as the Question
 * Bank's results screen, instead of dumping every question's explanation
 * onto the page continuously.
 */
export default function AttemptReview({
  assessment,
  answers,
  questionTimes,
  fontSize = "md",
  examTheme = "dark",
  splitScreen = false,
}: {
  assessment: Assessment;
  answers: Record<string, string>;
  questionTimes: Record<string, number>;
  // Same in-exam display preferences as the taking screen (see
  // AssessmentTake.tsx/QBankTake.tsx's Settings panel) - optional since the
  // admin's per-student attempt page uses this component without them and
  // just gets the defaults.
  fontSize?: FontSize;
  examTheme?: ExamTheme;
  splitScreen?: boolean;
}) {
  const breakdown = buildErrorBreakdown(assessment.questions, answers);
  const wrongCount = breakdown.near + breakdown.far;
  const times = Object.values(questionTimes);
  const avgSeconds = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  // Whichever image (question/choice/explanation) is currently open in the
  // full-size lightbox overlay - null means the lightbox is closed.
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // Which question (by index into assessment.questions) is currently
  // expanded in the review panel - null means nothing is open yet.
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  // "Ask AI" lives here (rather than in the parent AssessmentTake) so it can
  // automatically see whichever question is currently expanded, instead of
  // needing that state passed down from a component that doesn't have it.
  const [showAiHelper, setShowAiHelper] = useState(false);
  const reviewQuestion = expandedIdx !== null ? assessment.questions[expandedIdx] : null;

  return (
    <div className="space-y-4" data-exam-theme={examTheme}>
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

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-slate-500">
          Click a question number on the left to see that question&apos;s explanation. Click it again to collapse.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setExpandedIdx((i) => (i === null ? 0 : Math.max(0, i - 1)))}
            disabled={expandedIdx === 0}
            className="text-xs font-semibold text-brand-400 hover:text-brand-300 border border-slate-700 rounded-lg px-3 py-1.5 disabled:opacity-40 disabled:hover:text-brand-400"
          >
            &larr; Previous
          </button>
          <button
            type="button"
            onClick={() =>
              setExpandedIdx((i) => (i === null ? 0 : Math.min(assessment.questions.length - 1, i + 1)))
            }
            disabled={expandedIdx === assessment.questions.length - 1}
            className="text-xs font-semibold text-brand-400 hover:text-brand-300 border border-slate-700 rounded-lg px-3 py-1.5 disabled:opacity-40 disabled:hover:text-brand-400"
          >
            Next &rarr;
          </button>
          <button
            type="button"
            onClick={() => setShowAiHelper(true)}
            className="text-xs font-semibold text-brand-400 hover:text-brand-300 border border-slate-700 rounded-lg px-3 py-1.5"
          >
            AI Help
          </button>
        </div>
      </div>

      <div className="flex gap-4 items-start">
        <QuestionNavigator
          items={assessment.questions.map((q, idx) => {
            const chosen = answers[q.id];
            const cls = classifyAnswer(q, chosen);
            const status: "correct" | "incorrect" | "unanswered" =
              cls === "correct" ? "correct" : cls === "unanswered" ? "unanswered" : "incorrect";
            return { index: idx, answered: !!chosen, flagged: false, status };
          })}
          currentIndex={expandedIdx}
          onSelect={(idx) => setExpandedIdx(idx === expandedIdx ? null : idx)}
        />

        <div className="flex-1 min-w-0">
          {expandedIdx === null ? (
            <div className="card text-sm text-slate-400">
              Pick a question number to review its explanation.
            </div>
          ) : (
            (() => {
              const q = assessment.questions[expandedIdx];
              const chosen = answers[q.id];
              const cls = classifyAnswer(q, chosen);
              const seconds = questionTimes[q.id];
              const tookLong = avgSeconds > 0 && seconds !== undefined && seconds > avgSeconds * 1.5;
              return (
                <div className="card">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold" style={{ fontSize: FONT_SIZE_PX[fontSize] }}>
                      {expandedIdx + 1}. {q.question}
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
                  {q.meta?.educational_objective && (
                    <div className="mb-3 p-2 rounded bg-slate-900/60 border border-slate-800">
                      <p className="text-xs font-semibold text-slate-400 mb-1">Educational objective</p>
                      <p className="text-sm text-slate-300">{q.meta.educational_objective}</p>
                    </div>
                  )}
                  <div className={splitScreen ? "grid grid-cols-2 gap-6" : ""}>
                  {q.question_image_url && (
                    <div className="mb-3">
                      <ImageLink url={q.question_image_url} label="View image" onOpen={setLightboxUrl} />
                    </div>
                  )}
                  {q.meta?.answer_table_columns && q.meta.answer_table_columns.length > 0 ? (
                    <div className="overflow-x-auto mb-3">
                      <table className="w-full text-sm border-collapse" style={{ fontSize: FONT_SIZE_PX[fontSize] }}>
                        <thead>
                          <tr className="border-b border-slate-700">
                            <th className="text-left py-1.5 pr-3 text-slate-500 font-semibold w-8"></th>
                            {q.meta.answer_table_columns.map((col) => (
                              <th key={col} className="text-left py-1.5 px-3 text-slate-500 font-semibold">
                                {col}
                              </th>
                            ))}
                            <th className="w-24"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {q.choices.map((c, i) => {
                            const isThisCorrect = c.id === q.correct_choice_id;
                            const isThisChosen = c.id === chosen;
                            const cells = splitAnswerTableRow(c.text, q.meta!.answer_table_columns!);
                            return (
                              <tr
                                key={c.id}
                                className={`border-b border-slate-800 ${
                                  isThisCorrect
                                    ? "bg-green-900/20 text-green-300"
                                    : isThisChosen
                                    ? "bg-red-900/20 text-red-300"
                                    : "text-slate-300"
                                }`}
                              >
                                <td className="py-1.5 pr-3 font-semibold">{String.fromCharCode(65 + i)}</td>
                                {cells.map((cell, ci) => (
                                  <td key={ci} className="py-1.5 px-3">
                                    {cell}
                                  </td>
                                ))}
                                <td className="py-1.5 px-3 text-xs text-right">
                                  {isThisCorrect ? "correct answer" : isThisChosen ? "chosen answer" : ""}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
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
                              <span style={{ fontSize: FONT_SIZE_PX[fontSize] }}>
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
                  )}
                  </div>
                  {q.explanation_image_url && (
                    <div className="mb-2">
                      <ImageLink url={q.explanation_image_url} label="View image" onOpen={setLightboxUrl} />
                    </div>
                  )}
                  {q.explanation && (
                    <p className="text-sm text-slate-400 border-t border-slate-800 pt-3">{q.explanation}</p>
                  )}
                  {q.meta?.key_takeaway && (
                    <div className="mt-2 p-2 rounded bg-brand-900/20 border border-brand-800/40">
                      <p className="text-xs font-semibold text-brand-300 mb-1">Key takeaway</p>
                      <p className="text-sm text-slate-200 whitespace-pre-line">{q.meta.key_takeaway}</p>
                    </div>
                  )}
                  {q.meta?.exam_trap && (
                    <div className="mt-2 p-2 rounded bg-amber-900/20 border border-amber-800/40">
                      <p className="text-xs font-semibold text-amber-300 mb-1">Exam trap</p>
                      <p className="text-sm text-slate-200 whitespace-pre-line">{q.meta.exam_trap}</p>
                    </div>
                  )}
                  <ChoiceExplanations choices={q.choices} correctChoiceId={q.correct_choice_id} onOpen={setLightboxUrl} />
                </div>
              );
            })()
          )}
        </div>
      </div>

      {showAiHelper && (
        <AiHelper
          onClose={() => setShowAiHelper(false)}
          questionContext={
            reviewQuestion
              ? { stem: reviewQuestion.question, choices: reviewQuestion.choices.map((c) => c.text) }
              : undefined
          }
        />
      )}

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
