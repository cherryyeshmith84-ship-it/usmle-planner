"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  chunkIntoBlocks,
  deriveQuestionTimes,
  formatSeconds,
  scoreAttempt,
  type ScoreResult,
} from "@/lib/assessments";
import type { Assessment, AssessmentAttempt } from "@/lib/types";
import AttemptReview from "./AttemptReview";
import LabValuesSearch from "./LabValuesSearch";
import AiHelper from "./AiHelper";
import ExamCalculator from "./ExamCalculator";
import ExamSettings, { type ExamTheme, type FontSize } from "./ExamSettings";
import QuestionNavigator from "./QuestionNavigator";

type Phase = "start" | "taking" | "blockDone" | "break" | "results";
type ExamMode = "test" | "tutor";

// Inline font-size override applied to question/choice text - deliberately
// bypasses the fixed Tailwind text-sm class via inline style (which always
// wins) so the "Medium" setting matches the previous default exactly.
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

export default function AssessmentTake({
  userId,
  assessment,
  existingAttempt,
  allowRetake = false,
  backHref = "/assessments",
}: {
  userId: string;
  assessment: Assessment;
  existingAttempt: AssessmentAttempt | null;
  // Question Bank items are retakeable - Self Assessments are one-shot.
  allowRetake?: boolean;
  backHref?: string;
}) {
  const blocks = useMemo(
    () => chunkIntoBlocks(assessment.questions, assessment.questions_per_block),
    [assessment.questions, assessment.questions_per_block]
  );
  const blockSeconds = assessment.block_time_minutes * 60;
  const examSeconds = blocks.length * blockSeconds;
  const breakSecondsTotal = (assessment.break_minutes || 0) * 60;

  // Already completed this before - show their result, no retaking. Doesn't
  // apply when allowRetake is set (Question Bank items can always be redone).
  const alreadyDone = !allowRetake && !!existingAttempt;

  const [phase, setPhase] = useState<Phase>(alreadyDone ? "results" : "start");
  const [currentBlock, setCurrentBlock] = useState(0);
  // Which question within the current block is on screen right now - the
  // exam shows one question at a time (like UWorld), not the whole block
  // scrolled out like a PDF.
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [blockSecondsLeft, setBlockSecondsLeft] = useState(blockSeconds);
  const [examSecondsLeft, setExamSecondsLeft] = useState(examSeconds);
  const [breakSecondsLeft, setBreakSecondsLeft] = useState(breakSecondsTotal);
  const [answers, setAnswers] = useState<Record<string, string>>(existingAttempt?.answers ?? {});
  const [result, setResult] = useState<ScoreResult | null>(
    alreadyDone
      ? { correct: existingAttempt!.score_correct, total: existingAttempt!.score_total, pct: existingAttempt!.score_total > 0 ? Math.round((existingAttempt!.score_correct / existingAttempt!.score_total) * 100) : 0 }
      : null
  );
  const [submitting, setSubmitting] = useState(false);
  const [showNormalValues, setShowNormalValues] = useState(false);
  const [showAiHelper, setShowAiHelper] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Whichever image (question/choice/explanation) is currently open in the
  // full-size lightbox overlay - null means the lightbox is closed.
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // In-exam display preferences - live only in this component's state, so
  // they reset to defaults on a fresh page load (not persisted).
  const [fontSize, setFontSize] = useState<FontSize>("md");
  const [examTheme, setExamTheme] = useState<ExamTheme>("dark");
  const [splitScreen, setSplitScreen] = useState(false);

  // Question id -> true if flagged "review later" via the flag button.
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  // Question id -> set of choice ids the student has struck out (double-click
  // a choice to toggle). Struck choices stay visible and clickable - this
  // is just a visual "ruled this out" mark, like UWorld's strikethrough tool.
  const [struckChoices, setStruckChoices] = useState<Record<string, Set<string>>>({});

  // Test mode (default): behaves like a real timed block - no feedback until
  // the block ends. Tutor mode: submit an answer to immediately see if it
  // was correct plus the explanation, and the clock pauses while reading it.
  const [examMode, setExamMode] = useState<ExamMode>("test");
  // Question id -> true once the student has "submitted" that question in
  // tutor mode (locks the answer and reveals correctness + explanation).
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const startedAtRef = useRef<string | null>(null);
  const finalizedRef = useRef(false);
  const advancingRef = useRef(false);
  // Raw tracking during a live attempt: question id -> seconds elapsed
  // *within its block* at the moment it was first answered. Converted into
  // actual per-question time spent (via deriveQuestionTimes) at submit time.
  const rawElapsedRef = useRef<Record<string, number>>({});
  // Final per-question seconds spent, ready to display on the results screen -
  // either pulled straight from a past submitted attempt, or computed fresh
  // when this attempt is finalized below.
  const [questionTimes, setQuestionTimes] = useState<Record<string, number>>(
    existingAttempt?.question_seconds ?? {}
  );

  // Derived state needed by the timer effects below, so it's computed early
  // (plain consts, not hooks, so this is safe to place before the effects).
  const currentQuestions = blocks[currentBlock] ?? [];
  const answeredInBlock = currentQuestions.filter((q) => answers[q.id]).length;
  const isLastBlock = currentBlock >= blocks.length - 1;
  const currentQuestion = currentQuestions[currentQuestionIndex];
  const isFirstQuestion = currentQuestionIndex === 0;
  const isLastQuestion = currentQuestionIndex >= currentQuestions.length - 1;
  // True while viewing a tutor-mode explanation - the clock pauses during
  // this, and resumes automatically once they move to a different question.
  const isRevealedNow = examMode === "tutor" && !!revealed[currentQuestion?.id ?? ""];

  // Exam clock: only ticks while actively answering a block, and pauses
  // while reading a tutor-mode explanation.
  useEffect(() => {
    if (phase !== "taking" || isRevealedNow) return;
    const interval = setInterval(() => {
      setExamSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
      setBlockSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, isRevealedNow]);

  // Break clock: only ticks while on a break, separate from the exam clock.
  useEffect(() => {
    if (phase !== "break") return;
    const interval = setInterval(() => {
      setBreakSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // Break pool ran out - send them back in.
  useEffect(() => {
    if (phase === "break" && breakSecondsLeft === 0) {
      goToNextBlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakSecondsLeft, phase]);

  // Exam clock hit zero - end everything right now, regardless of block progress.
  useEffect(() => {
    if (phase === "taking" && examSecondsLeft === 0) {
      finalizeExam();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examSecondsLeft, phase]);

  // Block clock hit zero - end the block (same as clicking submit).
  useEffect(() => {
    if (phase === "taking" && blockSecondsLeft === 0 && examSecondsLeft > 0) {
      endBlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockSecondsLeft]);

  // Text highlighting, like the real exam: select text inside the question
  // or an answer choice and it gets marked in yellow. Click a highlighted
  // bit again to remove just that highlight.
  useEffect(() => {
    if (phase !== "taking") return;

    function applyHighlight(e: MouseEvent) {
      // e.detail > 1 means this mouseup is part of a double/triple click
      // (browser auto-selects a word) - that's the strike-out gesture, not
      // a highlight drag-select, so skip it here.
      if (e.detail > 1) return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      const anchorEl =
        range.commonAncestorContainer.nodeType === 3
          ? range.commonAncestorContainer.parentElement
          : (range.commonAncestorContainer as HTMLElement);
      if (!anchorEl || !anchorEl.closest("[data-highlight-zone]")) return;
      if (range.toString().trim().length === 0) return;

      const mark = document.createElement("mark");
      mark.className = "bg-yellow-300/70 text-black rounded px-0.5 cursor-pointer";
      mark.title = "Click to remove highlight";
      try {
        range.surroundContents(mark);
      } catch {
        try {
          const content = range.extractContents();
          mark.appendChild(content);
          range.insertNode(mark);
        } catch {
          return;
        }
      }
      selection.removeAllRanges();
    }

    function removeHighlightOnClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "MARK" && target.closest("[data-highlight-zone]")) {
        const parent = target.parentNode;
        if (!parent) return;
        while (target.firstChild) parent.insertBefore(target.firstChild, target);
        parent.removeChild(target);
        parent.normalize();
      }
    }

    document.addEventListener("mouseup", applyHighlight);
    document.addEventListener("click", removeHighlightOnClick);
    return () => {
      document.removeEventListener("mouseup", applyHighlight);
      document.removeEventListener("click", removeHighlightOnClick);
    };
  }, [phase]);

  function startAssessment() {
    startedAtRef.current = new Date().toISOString();
    setCurrentBlock(0);
    setCurrentQuestionIndex(0);
    setBlockSecondsLeft(blockSeconds);
    setExamSecondsLeft(examSeconds);
    setBreakSecondsLeft(breakSecondsTotal);
    setAnswers({});
    setResult(null);
    setFlagged({});
    setStruckChoices({});
    setExamMode("test");
    setRevealed({});
    rawElapsedRef.current = {};
    setQuestionTimes({});
    finalizedRef.current = false;
    advancingRef.current = false;
    setPhase("taking");
  }

  function chooseAnswer(questionId: string, choiceId: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: choiceId }));
    // Only record the *first* time they land on an answer for this question -
    // later changes of mind shouldn't reset the clock used to gauge time spent.
    if (rawElapsedRef.current[questionId] === undefined) {
      rawElapsedRef.current[questionId] = blockSeconds - blockSecondsLeft;
    }
  }

  function submitTutorAnswer(questionId: string) {
    setRevealed((prev) => ({ ...prev, [questionId]: true }));
  }

  function toggleStrike(questionId: string, choiceId: string) {
    setStruckChoices((prev) => {
      const current = new Set(prev[questionId] ?? []);
      if (current.has(choiceId)) current.delete(choiceId);
      else current.add(choiceId);
      return { ...prev, [questionId]: current };
    });
  }

  function toggleFlag(questionId: string) {
    setFlagged((prev) => ({ ...prev, [questionId]: !prev[questionId] }));
  }

  /** Called when a block's time is up or the student submits it manually. */
  function endBlock() {
    if (advancingRef.current || finalizedRef.current) return;
    // Any question in this block that was never answered still gets a mark
    // at "now", so the time-spent math below has something to diff against.
    for (const q of currentQuestions) {
      if (rawElapsedRef.current[q.id] === undefined) {
        rawElapsedRef.current[q.id] = blockSeconds - blockSecondsLeft;
      }
    }
    if (currentBlock >= blocks.length - 1) {
      finalizeExam();
      return;
    }
    setPhase("blockDone");
  }

  function goToNextBlock() {
    if (finalizedRef.current || advancingRef.current) return;
    advancingRef.current = true;
    setCurrentBlock((prev) => prev + 1);
    setCurrentQuestionIndex(0);
    setBlockSecondsLeft(blockSeconds);
    setPhase("taking");
    setTimeout(() => {
      advancingRef.current = false;
    }, 300);
  }

  function startBreak() {
    if (breakSecondsLeft <= 0) return;
    setPhase("break");
  }

  async function finalizeExam() {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    setSubmitting(true);
    const score = scoreAttempt(assessment.questions, answers);
    const times = deriveQuestionTimes(blocks, rawElapsedRef.current);
    const supabase = createClient();
    await supabase.from("assessment_attempts").insert({
      assessment_id: assessment.id,
      user_id: userId,
      started_at: startedAtRef.current || new Date().toISOString(),
      submitted_at: new Date().toISOString(),
      answers,
      score_correct: score.correct,
      score_total: score.total,
      question_seconds: times,
    });
    setSubmitting(false);
    setResult(score);
    setQuestionTimes(times);
    setPhase("results");
  }

  if (phase === "start") {
    return (
      <div className="card max-w-xl">
        <h1 className="text-xl font-bold mb-1">{assessment.name}</h1>
        {assessment.test_id && (
          <p className="text-xs text-slate-500 mb-3">Test Id: {assessment.test_id}</p>
        )}
        <p className="text-sm text-slate-400 mb-6">
          {blocks.length} block{blocks.length === 1 ? "" : "s"} · {assessment.questions_per_block} questions
          per block · {assessment.block_time_minutes} minutes per block ·{" "}
          {Math.round(examSeconds / 60)} minutes of exam time
          {breakSecondsTotal > 0 ? ` + ${Math.round(breakSecondsTotal / 60)} minutes of break` : ""}
        </p>
        <p className="text-sm text-slate-300 mb-6">
          This works like a real timed exam. Each block has its own clock, plus there&apos;s
          an overall exam clock running the whole time you&apos;re answering questions. You can
          switch between Test mode (no feedback until the block ends) and Tutor mode (see the
          answer and explanation right after each question, with the clock paused while you
          read it) at any point during the exam.
          {breakSecondsTotal > 0
            ? ` After each block (except the last), you can either continue straight to the next block, or take a break - breaks come out of a shared ${Math.round(
                breakSecondsTotal / 60
              )}-minute pool you can split up however you want, and the exam clock pauses while you're on break.`
            : ""}{" "}
          {allowRetake
            ? "You can practice this as many times as you want."
            : "You can't go back to a block once it's submitted, and you won't see your final score until you've finished the whole thing."}
        </p>
        {!allowRetake && (
          <p className="text-xs text-amber-400 mb-6">
            You only get one attempt at this - once you finish, you can&apos;t retake it.
          </p>
        )}
        <button type="button" onClick={startAssessment} className="btn-primary">
          Start exam
        </button>
      </div>
    );
  }

  if (phase === "blockDone") {
    return (
      <div className="card max-w-xl">
        <h2 className="text-lg font-bold mb-2">Block {currentBlock + 1} complete</h2>
        <p className="text-sm text-slate-400 mb-6">
          {breakSecondsLeft > 0
            ? `You have ${formatSeconds(breakSecondsLeft)} of break time left in your shared pool. You can take some of it now, or go straight to the next block.`
            : "You're out of break time - continuing straight to the next block."}
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={goToNextBlock} className="btn-primary">
            Continue to block {currentBlock + 2}
          </button>
          {breakSecondsLeft > 0 && (
            <button type="button" onClick={startBreak} className="btn-secondary">
              Take a break
            </button>
          )}
        </div>
      </div>
    );
  }

  if (phase === "break") {
    return (
      <div className="card max-w-xl">
        <h2 className="text-lg font-bold mb-2">On break</h2>
        <p className="text-sm text-slate-400 mb-2">
          Break time remaining in your shared pool:
        </p>
        <p className="text-3xl font-bold tabular-nums mb-6">{formatSeconds(breakSecondsLeft)}</p>
        <p className="text-sm text-slate-300 mb-6">
          The exam clock is paused. Come back whenever you&apos;re ready - you don&apos;t
          have to use all of it now.
        </p>
        <button type="button" onClick={goToNextBlock} className="btn-primary">
          End break and continue to block {currentBlock + 2}
        </button>
      </div>
    );
  }

  if (phase === "taking" && currentQuestion) {
    const struck = struckChoices[currentQuestion.id] ?? new Set<string>();
    const isFlagged = !!flagged[currentQuestion.id];
    const chosen = answers[currentQuestion.id];
    const answeredCorrectly = chosen === currentQuestion.correct_choice_id;

    return (
      <div className="space-y-4 pb-10" data-exam-theme={examTheme}>
        <div className="sticky top-0 z-10 -mx-6 px-6 py-3 bg-black/90 backdrop-blur border-b border-slate-800">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm text-slate-400">
              {assessment.test_id && (
                <span className="text-slate-500 mr-2">Test Id: {assessment.test_id}</span>
              )}
              Block {currentBlock + 1} of {blocks.length} · Item {currentQuestionIndex + 1} of{" "}
              {currentQuestions.length} · {answeredInBlock}/{currentQuestions.length} answered
            </span>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center border border-slate-700 rounded-lg overflow-hidden text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setExamMode("test")}
                  className={`px-2 py-1 ${
                    examMode === "test"
                      ? "bg-brand-900/50 text-brand-200"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Test
                </button>
                <button
                  type="button"
                  onClick={() => setExamMode("tutor")}
                  className={`px-2 py-1 border-l border-slate-700 ${
                    examMode === "tutor"
                      ? "bg-brand-900/50 text-brand-200"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Tutor
                </button>
              </div>
              <button
                type="button"
                onClick={() => toggleFlag(currentQuestion.id)}
                className={`text-xs font-semibold border rounded-lg px-2 py-1 ${
                  isFlagged
                    ? "border-amber-500 text-amber-400 bg-amber-900/20"
                    : "border-slate-700 text-brand-400 hover:text-brand-300"
                }`}
              >
                {isFlagged ? "Flagged" : "Flag for review"}
              </button>
              <button
                type="button"
                onClick={() => setShowNormalValues(true)}
                className="text-xs font-semibold text-brand-400 hover:text-brand-300 border border-slate-700 rounded-lg px-2 py-1"
              >
                Lab values
              </button>
              <button
                type="button"
                onClick={() => setShowAiHelper(true)}
                className="text-xs font-semibold text-brand-400 hover:text-brand-300 border border-slate-700 rounded-lg px-2 py-1"
              >
                AI Help
              </button>
              <button
                type="button"
                onClick={() => setShowCalculator(true)}
                className="text-xs font-semibold text-brand-400 hover:text-brand-300 border border-slate-700 rounded-lg px-2 py-1"
              >
                Calculator
              </button>
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="text-xs font-semibold text-brand-400 hover:text-brand-300 border border-slate-700 rounded-lg px-2 py-1"
              >
                Settings
              </button>
              <span className="text-xs text-slate-400">
                Block time{" "}
                <span
                  className={`font-bold tabular-nums text-sm ml-1 ${
                    blockSecondsLeft <= 60 ? "text-amber-400" : "text-white"
                  }`}
                >
                  {formatSeconds(blockSecondsLeft)}
                </span>
              </span>
              <span className="text-xs text-slate-400">
                Exam time{" "}
                <span
                  className={`font-bold tabular-nums text-sm ml-1 ${
                    examSecondsLeft <= 300 ? "text-red-400" : "text-white"
                  }`}
                >
                  {isRevealedNow ? "Paused" : formatSeconds(examSecondsLeft)}
                </span>
              </span>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          {examMode === "tutor"
            ? "Tutor mode: submit an answer to see if it's correct and read the explanation - the clock pauses until you move to another question."
            : "Test mode: no feedback until you end the block."}{" "}
          Select text to highlight it (click a highlight to remove it) - double-click an answer
          choice to strike it out.
        </p>

        <div className="flex gap-4 items-start">
          <QuestionNavigator
            items={currentQuestions.map((q, i) => ({
              index: i,
              answered: !!answers[q.id],
              flagged: !!flagged[q.id],
            }))}
            currentIndex={currentQuestionIndex}
            onSelect={setCurrentQuestionIndex}
          />

          <div className="flex-1 min-w-0 space-y-4">
            {/* key={currentQuestion.id} forces React to fully unmount and
                rebuild this card on every question change, instead of trying
                to patch it - text highlighting inserts <mark> tags straight
                into the DOM, bypassing React, and without this remount those
                manual edits corrupt the next question's rendered text. */}
            <div className="card" key={currentQuestion.id}>
              <div className={splitScreen ? "grid grid-cols-2 gap-6" : ""}>
                <p
                  className="text-sm font-semibold mb-3"
                  data-highlight-zone
                  style={{ fontSize: FONT_SIZE_PX[fontSize] }}
                >
                  {currentQuestionIndex + 1}. {currentQuestion.question}
                </p>
                {currentQuestion.question_image_url && (
                  <div className="mb-3">
                    <ImageLink url={currentQuestion.question_image_url} label="View image" onOpen={setLightboxUrl} />
                  </div>
                )}
                <div className="space-y-2">
                  {currentQuestion.choices.map((c) => {
                    const isStruck = struck.has(c.id);
                    const isChosen = chosen === c.id;
                    const isCorrectChoice = c.id === currentQuestion.correct_choice_id;
                    let borderClass = "border-slate-700 hover:border-slate-600";
                    if (isRevealedNow && isCorrectChoice) {
                      borderClass = "border-green-600 bg-green-900/20";
                    } else if (isRevealedNow && isChosen) {
                      borderClass = "border-red-600 bg-red-900/20";
                    } else if (isChosen) {
                      borderClass = "border-brand-400 bg-brand-900/20";
                    }
                    return (
                      <label
                        key={c.id}
                        className={`flex flex-col gap-2 border rounded-xl px-3 py-2 transition ${borderClass} ${
                          isRevealedNow ? "cursor-default" : "cursor-pointer"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name={`q-${currentQuestion.id}`}
                            checked={isChosen}
                            disabled={isRevealedNow}
                            onChange={() => chooseAnswer(currentQuestion.id, c.id)}
                            className="w-4 h-4 shrink-0"
                          />
                          <span
                            className={`text-sm ${isStruck ? "line-through opacity-50" : ""}`}
                            data-highlight-zone
                            style={{ fontSize: FONT_SIZE_PX[fontSize] }}
                            onDoubleClick={(e) => {
                              if (isRevealedNow) return;
                              e.preventDefault();
                              window.getSelection()?.removeAllRanges();
                              toggleStrike(currentQuestion.id, c.id);
                            }}
                          >
                            {c.text}
                          </span>
                          {isRevealedNow && isCorrectChoice && (
                            <span className="text-xs text-green-400 ml-auto shrink-0">Correct</span>
                          )}
                          {isRevealedNow && isChosen && !isCorrectChoice && (
                            <span className="text-xs text-red-400 ml-auto shrink-0">Your answer</span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {examMode === "tutor" && !isRevealedNow && (
                <button
                  type="button"
                  onClick={() => submitTutorAnswer(currentQuestion.id)}
                  disabled={!chosen}
                  className="btn-primary mt-4"
                >
                  Submit answer
                </button>
              )}

              {isRevealedNow && (
                <div className="mt-4 pt-4 border-t border-slate-800">
                  <p
                    className={`text-sm font-semibold mb-2 ${
                      answeredCorrectly ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {answeredCorrectly ? "Correct" : "Incorrect"}
                  </p>
                  {currentQuestion.explanation_image_url && (
                    <div className="mb-2">
                      <ImageLink url={currentQuestion.explanation_image_url} label="View image" onOpen={setLightboxUrl} />
                    </div>
                  )}
                  <p className="text-sm text-slate-300">{currentQuestion.explanation}</p>
                  {/* Per-choice images live here, in the explanation section,
                      each labeled by its own letter - not attached under the
                      answer option itself. */}
                  {currentQuestion.choices.some((c) => c.image_url) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                      {currentQuestion.choices.map((c, i) =>
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
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setCurrentQuestionIndex((i) => Math.max(0, i - 1))}
                disabled={isFirstQuestion}
                className="btn-secondary"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() =>
                  setCurrentQuestionIndex((i) => Math.min(currentQuestions.length - 1, i + 1))
                }
                disabled={isLastQuestion}
                className="btn-secondary"
              >
                Next
              </button>
              <button type="button" onClick={endBlock} className="btn-primary" disabled={submitting}>
                {submitting ? "Submitting..." : isLastBlock ? "Finish exam" : `End block ${currentBlock + 1}`}
              </button>
            </div>
            {!isLastBlock && (
              <p className="text-xs text-slate-500">
                You won&apos;t be able to come back to this block once you end it.
              </p>
            )}
          </div>
        </div>

        {showNormalValues && (
          <div
            className="fixed inset-0 z-20 bg-black/70 flex items-center justify-center px-4"
            onClick={() => setShowNormalValues(false)}
          >
            <div
              className="card max-w-lg w-full max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">Lab values</h2>
                <button
                  type="button"
                  onClick={() => setShowNormalValues(false)}
                  className="text-slate-400 hover:text-white text-sm"
                >
                  Close
                </button>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Standard adult reference ranges - actual lab ranges vary by assay/lab.
              </p>
              <LabValuesSearch compact />
            </div>
          </div>
        )}

        {showAiHelper && <AiHelper onClose={() => setShowAiHelper(false)} />}
        {showCalculator && <ExamCalculator onClose={() => setShowCalculator(false)} />}
        {showSettings && (
          <ExamSettings
            fontSize={fontSize}
            setFontSize={setFontSize}
            theme={examTheme}
            setTheme={setExamTheme}
            splitScreen={splitScreen}
            setSplitScreen={setSplitScreen}
            onClose={() => setShowSettings(false)}
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

  // Results - shown only after every block is done (or immediately, if
  // they've already completed this assessment before and can't retake).
  if (!result) return null;
  const complete = result.total > 0 && result.pct === 100;
  return (
    <div className="space-y-4 pb-10">
      <div className="card">
        <h1 className="text-xl font-bold mb-1">{assessment.name} - results</h1>
        {assessment.test_id && (
          <p className="text-xs text-slate-500">Test Id: {assessment.test_id}</p>
        )}
        <div className="flex items-center gap-4 mt-3">
          <span
            className={`text-3xl font-bold ${
              complete ? "text-green-400" : result.pct >= 50 ? "text-brand-300" : "text-red-400"
            }`}
          >
            {result.pct}%
          </span>
          <span className="text-sm text-slate-400">
            {result.correct}/{result.total} correct across all {blocks.length} block
            {blocks.length === 1 ? "" : "s"}
          </span>
        </div>
        {!allowRetake && alreadyDone && (
          <p className="text-xs text-slate-500 mt-3">
            You&apos;ve already completed this assessment, so it can&apos;t be retaken.
          </p>
        )}
        <div className="flex flex-wrap gap-3 mt-4">
          {allowRetake && (
            <button type="button" onClick={startAssessment} className="btn-primary">
              Practice again
            </button>
          )}
          <Link href={backHref} className="btn-secondary">
            {allowRetake ? "Back to question bank" : "Back to assessments"}
          </Link>
        </div>
      </div>

      <AttemptReview assessment={assessment} answers={answers} questionTimes={questionTimes} />
    </div>
  );
}
