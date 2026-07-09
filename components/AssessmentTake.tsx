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

type Phase = "start" | "taking" | "blockDone" | "break" | "results";

export default function AssessmentTake({
  userId,
  assessment,
  existingAttempt,
}: {
  userId: string;
  assessment: Assessment;
  existingAttempt: AssessmentAttempt | null;
}) {
  const blocks = useMemo(
    () => chunkIntoBlocks(assessment.questions, assessment.questions_per_block),
    [assessment.questions, assessment.questions_per_block]
  );
  const blockSeconds = assessment.block_time_minutes * 60;
  const examSeconds = blocks.length * blockSeconds;
  const breakSecondsTotal = (assessment.break_minutes || 0) * 60;

  // Already completed this before - show their result, no retaking.
  const alreadyDone = !!existingAttempt;

  const [phase, setPhase] = useState<Phase>(alreadyDone ? "results" : "start");
  const [currentBlock, setCurrentBlock] = useState(0);
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

  // Exam clock: only ticks while actively answering a block.
  useEffect(() => {
    if (phase !== "taking") return;
    const interval = setInterval(() => {
      setExamSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
      setBlockSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

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

    function applyHighlight() {
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
    setBlockSecondsLeft(blockSeconds);
    setExamSecondsLeft(examSeconds);
    setBreakSecondsLeft(breakSecondsTotal);
    setAnswers({});
    setResult(null);
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

  const currentQuestions = blocks[currentBlock] ?? [];
  const answeredInBlock = currentQuestions.filter((q) => answers[q.id]).length;
  const isLastBlock = currentBlock >= blocks.length - 1;

  if (phase === "start") {
    return (
      <div className="card max-w-xl">
        <h1 className="text-xl font-bold mb-1">{assessment.name}</h1>
        <p className="text-sm text-slate-400 mb-6">
          {blocks.length} block{blocks.length === 1 ? "" : "s"} · {assessment.questions_per_block} questions
          per block · {assessment.block_time_minutes} minutes per block ·{" "}
          {Math.round(examSeconds / 60)} minutes of exam time
          {breakSecondsTotal > 0 ? ` + ${Math.round(breakSecondsTotal / 60)} minutes of break` : ""}
        </p>
        <p className="text-sm text-slate-300 mb-6">
          This works like a real timed exam. Each block has its own clock, plus there&apos;s
          an overall exam clock running the whole time you&apos;re answering questions.
          {breakSecondsTotal > 0
            ? ` After each block (except the last), you can either continue straight to the next block, or take a break - breaks come out of a shared ${Math.round(
                breakSecondsTotal / 60
              )}-minute pool you can split up however you want, and the exam clock pauses while you're on break.`
            : ""}{" "}
          You can&apos;t go back to a block once it&apos;s submitted, and you won&apos;t see
          your score until you&apos;ve finished the whole thing.
        </p>
        <p className="text-xs text-amber-400 mb-6">
          You only get one attempt at this - once you finish, you can&apos;t retake it.
        </p>
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

  if (phase === "taking") {
    return (
      <div className="space-y-4 pb-10">
        <div className="sticky top-0 z-10 -mx-6 px-6 py-3 bg-black/90 backdrop-blur border-b border-slate-800">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm text-slate-400">
              Block {currentBlock + 1} of {blocks.length} · {answeredInBlock}/{currentQuestions.length}{" "}
              answered
            </span>
            <div className="flex items-center gap-5">
              <button
                type="button"
                onClick={() => setShowNormalValues(true)}
                className="text-xs font-semibold text-brand-400 hover:text-brand-300 border border-slate-700 rounded-lg px-2 py-1"
              >
                Lab values
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
                  {formatSeconds(examSecondsLeft)}
                </span>
              </span>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Tip: select any text in a question or choice to highlight it - click a highlight to remove it.
        </p>

        {currentQuestions.map((q, idx) => (
          <div key={q.id} className="card">
            <p className="text-sm font-semibold mb-3" data-highlight-zone>
              {idx + 1}. {q.question}
            </p>
            <div className="space-y-2">
              {q.choices.map((c) => (
                <label
                  key={c.id}
                  className={`flex items-center gap-3 border rounded-xl px-3 py-2 cursor-pointer transition ${
                    answers[q.id] === c.id
                      ? "border-brand-400 bg-brand-900/20"
                      : "border-slate-700 hover:border-slate-600"
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    checked={answers[q.id] === c.id}
                    onChange={() => chooseAnswer(q.id, c.id)}
                    className="w-4 h-4 shrink-0"
                  />
                  <span className="text-sm" data-highlight-zone>
                    {c.text}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}

        <button type="button" onClick={endBlock} className="btn-primary" disabled={submitting}>
          {submitting ? "Submitting..." : isLastBlock ? "Finish exam" : `Submit block ${currentBlock + 1}`}
        </button>
        {!isLastBlock && (
          <p className="text-xs text-slate-500">
            You won&apos;t be able to come back to this block once you move on.
          </p>
        )}

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
      </div>
    );
  }

  // Results - shown only after every block is done (or immediately, if
  // they've already completed this assessment before).
  if (!result) return null;
  const complete = result.total > 0 && result.pct === 100;
  return (
    <div className="space-y-4 pb-10">
      <div className="card">
        <h1 className="text-xl font-bold mb-1">{assessment.name} - results</h1>
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
        {alreadyDone && (
          <p className="text-xs text-slate-500 mt-3">
            You&apos;ve already completed this assessment, so it can&apos;t be retaken.
          </p>
        )}
        <div className="flex gap-3 mt-4">
          <Link href="/assessments" className="btn-secondary">
            Back to assessments
          </Link>
        </div>
      </div>

      <AttemptReview assessment={assessment} answers={answers} questionTimes={questionTimes} />
    </div>
  );
}
