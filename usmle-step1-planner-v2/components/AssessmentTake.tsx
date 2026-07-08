"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatSeconds, scoreAttempt, type ScoreResult } from "@/lib/assessments";
import type { Assessment } from "@/lib/types";

type Phase = "start" | "taking" | "results";

export default function AssessmentTake({
  userId,
  assessment,
}: {
  userId: string;
  assessment: Assessment;
}) {
  const [phase, setPhase] = useState<Phase>("start");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState(assessment.time_limit_minutes * 60);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const startedAtRef = useRef<string | null>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (phase !== "taking") return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (phase === "taking" && secondsLeft === 0 && !submittedRef.current) {
      handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, phase]);

  function startAssessment() {
    startedAtRef.current = new Date().toISOString();
    setSecondsLeft(assessment.time_limit_minutes * 60);
    setAnswers({});
    setResult(null);
    submittedRef.current = false;
    setPhase("taking");
  }

  function chooseAnswer(questionId: string, choiceId: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: choiceId }));
  }

  async function handleSubmit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
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

  const answeredCount = Object.keys(answers).length;

  if (phase === "start") {
    return (
      <div className="card max-w-xl">
        <h1 className="text-xl font-bold mb-1">{assessment.name}</h1>
        <p className="text-sm text-slate-400 mb-6">
          {assessment.questions.length} question{assessment.questions.length === 1 ? "" : "s"} ·{" "}
          {assessment.time_limit_minutes} minute time limit
        </p>
        <p className="text-sm text-slate-300 mb-6">
          Once you start, the timer runs continuously and auto-submits when it hits zero.
          Answer as many as you can - you&apos;ll see your score and the correct answers
          right after you submit.
        </p>
        <button type="button" onClick={startAssessment} className="btn-primary">
          Start assessment
        </button>
      </div>
    );
  }

  if (phase === "taking") {
    return (
      <div className="space-y-4 pb-10">
        <div className="sticky top-0 z-10 -mx-6 px-6 py-3 bg-black/90 backdrop-blur border-b border-slate-800 flex items-center justify-between">
          <span className="text-sm text-slate-400">
            {answeredCount}/{assessment.questions.length} answered
          </span>
          <span
            className={`text-lg font-bold tabular-nums ${
              secondsLeft <= 60 ? "text-red-400" : "text-white"
            }`}
          >
            {formatSeconds(secondsLeft)}
          </span>
        </div>

        {assessment.questions.map((q, idx) => (
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

        <button type="button" onClick={handleSubmit} className="btn-primary" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit assessment"}
        </button>
      </div>
    );
  }

  // Results
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
            {result.correct}/{result.total} correct
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
