"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { chunkIntoBlocks, formatSeconds, scoreAttempt, type ScoreResult } from "@/lib/assessments";
import type { Assessment } from "@/lib/types";

type Phase = "start" | "taking" | "results";

export default function AssessmentTake({
  userId,
  assessment,
}: {
  userId: string;
  assessment: Assessment;
}) {
  const blocks = useMemo(
    () => chunkIntoBlocks(assessment.questions, assessment.questions_per_block),
    [assessment.questions, assessment.questions_per_block]
  );
  const blockSeconds = assessment.block_time_minutes * 60;
  const examSeconds = blocks.length * blockSeconds;

  const [phase, setPhase] = useState<Phase>("start");
  const [currentBlock, setCurrentBlock] = useState(0);
  const [blockSecondsLeft, setBlockSecondsLeft] = useState(blockSeconds);
  const [examSecondsLeft, setExamSecondsLeft] = useState(examSeconds);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const startedAtRef = useRef<string | null>(null);
  const finalizedRef = useRef(false);
  const advancingRef = useRef(false);

  // Master tick: counts down both timers together while the exam is in progress.
  useEffect(() => {
    if (phase !== "taking") return;
    const interval = setInterval(() => {
      setExamSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
      setBlockSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // Exam clock hit zero - end everything right now, regardless of block progress.
  useEffect(() => {
    if (phase === "taking" && examSecondsLeft === 0) {
      finalizeExam();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examSecondsLeft, phase]);

  // Block clock hit zero - move to the next block (or finish, if this was the last one).
  useEffect(() => {
    if (phase === "taking" && blockSecondsLeft === 0 && examSecondsLeft > 0) {
      goToNextBlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockSecondsLeft]);

  function startAssessment() {
    startedAtRef.current = new Date().toISOString();
    setCurrentBlock(0);
    setBlockSecondsLeft(blockSeconds);
    setExamSecondsLeft(examSeconds);
    setAnswers({});
    setResult(null);
    finalizedRef.current = false;
    advancingRef.current = false;
    setPhase("taking");
  }

  function chooseAnswer(questionId: string, choiceId: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: choiceId }));
  }

  function goToNextBlock() {
    if (advancingRef.current || finalizedRef.current) return;
    if (currentBlock >= blocks.length - 1) {
      finalizeExam();
      return;
    }
    advancingRef.current = true;
    setCurrentBlock((prev) => prev + 1);
    setBlockSecondsLeft(blockSeconds);
    setTimeout(() => {
      advancingRef.current = false;
    }, 300);
  }

  async function finalizeExam() {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    setSubmitting(true);
    const score = scoreAttempt(assessment.questions, answers);
    const supabase = createClient();
    await supabase.from("assessment_attempts").insert({
      assessment_id: assessment.id,
      user_id: userId,
      started_at: startedAtRef.current || new Date().toISOString(),
      submitted_at: new Date().toISOString(),
      answers,
      score_correct: score.correct,
      score_total: score.total,
    });
    setSubmitting(false);
    setResult(score);
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
          {Math.round(examSeconds / 60)} minutes total
        </p>
        <p className="text-sm text-slate-300 mb-6">
          This works like a real timed exam. Each block has its own clock, and there&apos;s
          also an overall exam clock running the whole time. You move forward block by
          block - once a block&apos;s time is up (or you finish it), it moves on to the
          next one automatically, and you can&apos;t go back. You won&apos;t see your score
          until you&apos;ve completed every block.
        </p>
        <button type="button" onClick={startAssessment} className="btn-primary">
          Start exam
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

        {currentQuestions.map((q, idx) => (
          <div key={q.id} className="card">
            <p className="text-sm font-semibold mb-3">
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
                  <span className="text-sm">{c.text}</span>
                </label>
              ))}
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={goToNextBlock}
          className="btn-primary"
          disabled={submitting}
        >
          {submitting
            ? "Submitting..."
            : isLastBlock
            ? "Finish exam"
            : `Submit block ${currentBlock + 1} and continue`}
        </button>
        {!isLastBlock && (
          <p className="text-xs text-slate-500">
            You won&apos;t be able to come back to this block once you move on.
          </p>
        )}
      </div>
    );
  }

  // Results - shown only now, after every block is done.
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
        <div className="flex gap-3 mt-4">
          <button type="button" onClick={startAssessment} className="btn-secondary">
            Retake
          </button>
          <Link href="/assessments" className="btn-secondary">
            Back to assessments
          </Link>
        </div>
      </div>

      {assessment.questions.map((q, idx) => {
        const chosen = answers[q.id];
        const isCorrect = chosen === q.correct_choice_id;
        return (
          <div key={q.id} className="card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">
                {idx + 1}. {q.question}
              </p>
              <span
                className={`text-xs font-semibold rounded-full px-2 py-1 shrink-0 ml-2 ${
                  isCorrect ? "bg-green-900/40 text-green-400" : "bg-red-900/40 text-red-400"
                }`}
              >
                {isCorrect ? "Correct" : chosen ? "Incorrect" : "Not answered"}
              </span>
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
                      <span className="text-xs text-red-400 ml-auto">Your answer</span>
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
