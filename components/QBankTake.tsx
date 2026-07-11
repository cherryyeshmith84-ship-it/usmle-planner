"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { chunkIntoBlocks, formatSeconds } from "@/lib/assessments";
import { choiceStatsToPercents, type ChoiceStatRow } from "@/lib/qbank";
import type { QBankQuestion, QBankTestSession, ExamModeOption } from "@/lib/qbankTypes";
import LabValuesSearch from "./LabValuesSearch";
import AiHelper from "./AiHelper";
import ExamCalculator from "./ExamCalculator";
import ExamSettings, { type ExamTheme, type FontSize } from "./ExamSettings";
import QuestionNavigator from "./QuestionNavigator";

type Phase = "start" | "taking" | "blockDone" | "results";

const FONT_SIZE_PX: Record<FontSize, string> = { sm: "13px", md: "14px", lg: "17px" };
const SECONDS_PER_QUESTION = 75; // seconds per question

export default function QBankTake({
  userId,
  session,
  questions,
  initialMarked,
}: {
  userId: string;
  session: QBankTestSession;
  questions: QBankQuestion[];
  initialMarked: Record<string, boolean>;
}) {
  const blocks = useMemo(
    () => chunkIntoBlocks(questions as any, session.questions_per_block) as unknown as QBankQuestion[][],
    [questions, session.questions_per_block]
  );

  const alreadyDone = !!session.submitted_at;

  const [phase, setPhase] = useState<Phase>(alreadyDone ? "results" : "start");
  const [currentBlock, setCurrentBlock] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(session.answers ?? {});
  const [questionTimes, setQuestionTimes] = useState<Record<string, number>>(session.question_seconds ?? {});
  const [submitting, setSubmitting] = useState(false);

  const [showNormalValues, setShowNormalValues] = useState(false);
  const [showAiHelper, setShowAiHelper] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [fontSize, setFontSize] = useState<FontSize>("md");
  const [examTheme, setExamTheme] = useState<ExamTheme>("dark");
  const [splitScreen, setSplitScreen] = useState(false);

  const [flagged, setFlagged] = useState<Record<string, boolean>>(initialMarked);
  const [struckChoices, setStruckChoices] = useState<Record<string, Set<string>>>({});

  const [examMode, setExamMode] = useState<ExamModeOption>(session.mode ?? "test");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  // Percent of students who picked each choice, keyed by question id, then
  // choice id -> percent. Loaded lazily (on tutor reveal / entering results)
  // via the qbank_choice_stats Supabase function - shown as a UWorld-style
  // "42%" next to each answer choice.
  const [choiceStats, setChoiceStats] = useState<Record<string, Record<string, number>>>({});
  const loadedStatsRef = useRef<Set<string>>(new Set());

  const currentQuestions = blocks[currentBlock] ?? [];
  const blockSeconds = currentQuestions.length * SECONDS_PER_QUESTION;
  const [blockSecondsLeft, setBlockSecondsLeft] = useState(blockSeconds);

  const startedAtRef = useRef<string>(session.started_at || new Date().toISOString());
  const finalizedRef = useRef(false);
  const advancingRef = useRef(false);
  const rawElapsedRef = useRef<Record<string, number>>({});

  const answeredInBlock = currentQuestions.filter((q) => answers[q.id]).length;
  const isLastBlock = currentBlock >= blocks.length - 1;
  const currentQuestion = currentQuestions[currentQuestionIndex];
  const isFirstQuestion = currentQuestionIndex === 0;
  const isLastQuestion = currentQuestionIndex >= currentQuestions.length - 1;
  const isRevealedNow = examMode === "tutor" && !!revealed[currentQuestion?.id ?? ""];

  useEffect(() => {
    if (phase !== "taking" || isRevealedNow) return;
    const interval = setInterval(() => {
      setBlockSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, isRevealedNow]);

  useEffect(() => {
    if (phase === "taking" && blockSecondsLeft === 0) {
      endBlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockSecondsLeft]);

  useEffect(() => {
    if (phase !== "taking") return;

    function applyHighlight(e: MouseEvent) {
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

  useEffect(() => {
    if (phase !== "results") return;
    for (const q of questions) {
      loadChoiceStats(q.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function startTest() {
    setCurrentBlock(0);
    setCurrentQuestionIndex(0);
    setBlockSecondsLeft((blocks[0] ?? []).length * SECONDS_PER_QUESTION);
    setRevealed({});
    rawElapsedRef.current = {};
    finalizedRef.current = false;
    advancingRef.current = false;
    setPhase("taking");
  }

  function chooseAnswer(questionId: string, choiceId: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: choiceId }));
    if (rawElapsedRef.current[questionId] === undefined) {
      rawElapsedRef.current[questionId] = blockSeconds - blockSecondsLeft;
    }
  }

  function submitTutorAnswer(questionId: string) {
    setRevealed((prev) => ({ ...prev, [questionId]: true }));
    loadChoiceStats(questionId);
  }

  async function loadChoiceStats(questionId: string) {
    if (loadedStatsRef.current.has(questionId)) return;
    loadedStatsRef.current.add(questionId);
    const supabase = createClient();
    const { data } = await supabase.rpc("qbank_choice_stats", { p_question_id: questionId });
    const { percents } = choiceStatsToPercents((data ?? []) as ChoiceStatRow[]);
    setChoiceStats((prev) => ({ ...prev, [questionId]: percents }));
  }

  function toggleStrike(questionId: string, choiceId: string) {
    setStruckChoices((prev) => {
      const current = new Set(prev[questionId] ?? []);
      if (current.has(choiceId)) current.delete(choiceId);
      else current.add(choiceId);
      return { ...prev, [questionId]: current };
    });
  }

  async function toggleFlag(questionId: string) {
    const nextValue = !flagged[questionId];
    setFlagged((prev) => ({ ...prev, [questionId]: nextValue }));
    const supabase = createClient();
    await supabase
      .from("qbank_marks")
      .upsert({ user_id: userId, question_id: questionId, marked: nextValue, updated_at: new Date().toISOString() });
  }

  function endBlock() {
    if (advancingRef.current || finalizedRef.current) return;
    for (const q of currentQuestions) {
      if (rawElapsedRef.current[q.id] === undefined) {
        rawElapsedRef.current[q.id] = blockSeconds - blockSecondsLeft;
      }
    }
    if (currentBlock >= blocks.length - 1) {
      finalizeTest();
      return;
    }
    // Save progress at each block boundary so closing the tab mid-test and
    // coming back via "Resume" on Previous Tests doesn't lose answers.
    const supabase = createClient();
    supabase
      .from("qbank_test_sessions")
      .update({ mode: examMode, answers, question_seconds: deriveTimes() })
      .eq("id", session.id);
    setPhase("blockDone");
  }

  function goToNextBlock() {
    if (finalizedRef.current || advancingRef.current) return;
    advancingRef.current = true;
    const nextIndex = currentBlock + 1;
    const nextBlockLen = (blocks[nextIndex] ?? []).length;
    setCurrentBlock(nextIndex);
    setCurrentQuestionIndex(0);
    setBlockSecondsLeft(nextBlockLen * SECONDS_PER_QUESTION);
    setPhase("taking");
    setTimeout(() => {
      advancingRef.current = false;
    }, 300);
  }

  function deriveTimes(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const block of blocks) {
      let prev = 0;
      for (const q of block) {
        const t = rawElapsedRef.current[q.id];
        if (t === undefined) continue;
        out[q.id] = Math.max(0, t - prev);
        prev = t;
      }
    }
    return out;
  }

  async function finalizeTest() {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    setSubmitting(true);
    const total = questions.length;
    const correct = questions.filter((q) => answers[q.id] === q.correct_choice_id).length;
    const times = deriveTimes();
    const supabase = createClient();
    await supabase
      .from("qbank_test_sessions")
      .update({
        mode: examMode,
        answers,
        question_seconds: times,
        score_correct: correct,
        score_total: total,
        submitted_at: new Date().toISOString(),
      })
      .eq("id", session.id);
    setSubmitting(false);
    setQuestionTimes(times);
    setPhase("results");
  }

  if (phase === "start") {
    return (
      <div className="card max-w-xl">
        <h1 className="text-xl font-bold mb-1">Custom test</h1>
        <p className="text-sm text-slate-400 mb-6">
          {blocks.length} block{blocks.length === 1 ? "" : "s"} · {questions.length} question
          {questions.length === 1 ? "" : "s"} total · {session.questions_per_block} per block
        </p>
        <p className="text-sm text-slate-300 mb-6">
          Each block has its own clock (about 75 seconds per question). You
          can switch between Test mode (no feedback until the block ends) and Tutor mode (see
          the answer and explanation right after each question, with the clock paused while you
          read it) at any point.
        </p>
        <button type="button" onClick={startTest} className="btn-primary">
          Start test
        </button>
      </div>
    );
  }

  if (phase === "blockDone") {
    return (
      <div className="card max-w-xl">
        <h2 className="text-lg font-bold mb-2">Block {currentBlock + 1} complete</h2>
        <p className="text-sm text-slate-400 mb-6">Ready for the next block whenever you are.</p>
        <button type="button" onClick={goToNextBlock} className="btn-primary">
          Continue to block {currentBlock + 2}
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
              Block {currentBlock + 1} of {blocks.length} · Item {currentQuestionIndex + 1} of{" "}
              {currentQuestions.length} · {answeredInBlock}/{currentQuestions.length} answered
            </span>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center border border-slate-700 rounded-lg overflow-hidden text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setExamMode("test")}
                  className={`px-2 py-1 ${examMode === "test" ? "bg-brand-900/50 text-brand-200" : "text-slate-400 hover:text-slate-200"}`}
                >
                  Test
                </button>
                <button
                  type="button"
                  onClick={() => setExamMode("tutor")}
                  className={`px-2 py-1 border-l border-slate-700 ${examMode === "tutor" ? "bg-brand-900/50 text-brand-200" : "text-slate-400 hover:text-slate-200"}`}
                >
                  Tutor
                </button>
              </div>
              <button
                type="button"
                onClick={() => toggleFlag(currentQuestion.id)}
                className={`text-xs font-semibold border rounded-lg px-2 py-1 ${
                  isFlagged ? "border-amber-500 text-amber-400 bg-amber-900/20" : "border-slate-700 text-brand-400 hover:text-brand-300"
                }`}
              >
                {isFlagged ? "Marked" : "Mark"}
              </button>
              <button type="button" onClick={() => setShowNormalValues(true)} className="text-xs font-semibold text-brand-400 hover:text-brand-300 border border-slate-700 rounded-lg px-2 py-1">
                Lab values
              </button>
              <button type="button" onClick={() => setShowAiHelper(true)} className="text-xs font-semibold text-brand-400 hover:text-brand-300 border border-slate-700 rounded-lg px-2 py-1">
                AI Help
              </button>
              <button type="button" onClick={() => setShowCalculator(true)} className="text-xs font-semibold text-brand-400 hover:text-brand-300 border border-slate-700 rounded-lg px-2 py-1">
                Calculator
              </button>
              <button type="button" onClick={() => setShowSettings(true)} className="text-xs font-semibold text-brand-400 hover:text-brand-300 border border-slate-700 rounded-lg px-2 py-1">
                Settings
              </button>
              <span className="text-xs text-slate-400">
                Block time{" "}
                <span className={`font-bold tabular-nums text-sm ml-1 ${blockSecondsLeft <= 60 ? "text-amber-400" : "text-white"}`}>
                  {isRevealedNow ? "Paused" : formatSeconds(blockSecondsLeft)}
                </span>
              </span>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          {examMode === "tutor"
            ? "Tutor mode: submit an answer to see if it's correct and read the explanation - the clock pauses until you move to another question."
            : "Test mode: no feedback until you end the block."}{" "}
          Select text to highlight it (click a highlight to remove it) - double-click an answer choice to strike it out.
        </p>

        <div className="flex gap-4 items-start">
          <QuestionNavigator
            items={currentQuestions.map((q, i) => ({ index: i, answered: !!answers[q.id], flagged: !!flagged[q.id] }))}
            currentIndex={currentQuestionIndex}
            onSelect={setCurrentQuestionIndex}
          />

          <div className="flex-1 min-w-0 space-y-4">
            <div className="card">
              <div className={splitScreen ? "grid grid-cols-2 gap-6" : ""}>
                <p className="text-sm font-semibold mb-3" data-highlight-zone style={{ fontSize: FONT_SIZE_PX[fontSize] }}>
                  {currentQuestionIndex + 1}. {currentQuestion.question}
                </p>
                <div className="space-y-2">
                  {currentQuestion.choices.map((c) => {
                    const isStruck = struck.has(c.id);
                    const isChosen = chosen === c.id;
                    const isCorrectChoice = c.id === currentQuestion.correct_choice_id;
                    let borderClass = "border-slate-700 hover:border-slate-600";
                    if (isRevealedNow && isCorrectChoice) borderClass = "border-green-600 bg-green-900/20";
                    else if (isRevealedNow && isChosen) borderClass = "border-red-600 bg-red-900/20";
                    else if (isChosen) borderClass = "border-brand-400 bg-brand-900/20";
                    return (
                      <label
                        key={c.id}
                        className={`flex items-center gap-3 border rounded-xl px-3 py-2 transition ${borderClass} ${isRevealedNow ? "cursor-default" : "cursor-pointer"}`}
                      >
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
                        {isRevealedNow && (
                          <span className="ml-auto shrink-0 flex items-center gap-2">
                            {choiceStats[currentQuestion.id]?.[c.id] !== undefined && (
                              <span className="text-xs text-slate-400">
                                {choiceStats[currentQuestion.id][c.id]}%
                              </span>
                            )}
                            {isCorrectChoice && <span className="text-xs text-green-400">Correct</span>}
                            {isChosen && !isCorrectChoice && <span className="text-xs text-red-400">Your answer</span>}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              {examMode === "tutor" && !isRevealedNow && (
                <button type="button" onClick={() => submitTutorAnswer(currentQuestion.id)} disabled={!chosen} className="btn-primary mt-4">
                  Submit answer
                </button>
              )}

              {isRevealedNow && (
                <div className="mt-4 pt-4 border-t border-slate-800">
                  <p className={`text-sm font-semibold mb-2 ${answeredCorrectly ? "text-green-400" : "text-red-400"}`}>
                    {answeredCorrectly ? "Correct" : "Incorrect"}
                  </p>
                  <p className="text-sm text-slate-300 whitespace-pre-line">{currentQuestion.explanation}</p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => setCurrentQuestionIndex((i) => Math.max(0, i - 1))} disabled={isFirstQuestion} className="btn-secondary">
                Previous
              </button>
              <button
                type="button"
                onClick={() => setCurrentQuestionIndex((i) => Math.min(currentQuestions.length - 1, i + 1))}
                disabled={isLastQuestion}
                className="btn-secondary"
              >
                Next
              </button>
              <button type="button" onClick={endBlock} className="btn-primary" disabled={submitting}>
                {submitting ? "Submitting..." : isLastBlock ? "Finish test" : `End block ${currentBlock + 1}`}
              </button>
            </div>
            {!isLastBlock && <p className="text-xs text-slate-500">You won&apos;t be able to come back to this block once you end it.</p>}
          </div>
        </div>

        {showNormalValues && (
          <div className="fixed inset-0 z-20 bg-black/70 flex items-center justify-center px-4" onClick={() => setShowNormalValues(false)}>
            <div className="card max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">Lab values</h2>
                <button type="button" onClick={() => setShowNormalValues(false)} className="text-slate-400 hover:text-white text-sm">
                  Close
                </button>
              </div>
              <p className="text-xs text-slate-500 mb-3">Standard adult reference ranges - actual lab ranges vary by assay/lab.</p>
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
      </div>
    );
  }

  // Results
  const total = questions.length;
  const correct = questions.filter((q) => answers[q.id] === q.correct_choice_id).length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

  return (
    <div className="space-y-4 pb-10">
      <div className="card">
        <h1 className="text-xl font-bold mb-1">Test results</h1>
        <div className="flex items-center gap-4 mt-3">
          <span className={`text-3xl font-bold ${pct === 100 ? "text-green-400" : pct >= 50 ? "text-brand-300" : "text-red-400"}`}>{pct}%</span>
          <span className="text-sm text-slate-400">{correct}/{total} correct</span>
        </div>
        <div className="flex flex-wrap gap-3 mt-4">
          <Link href="/qbank" className="btn-primary">
            Create another test
          </Link>
          <Link href="/qbank/previous" className="btn-secondary">
            Previous tests
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        {questions.map((q, idx) => {
          const chosen = answers[q.id];
          const isCorrect = chosen === q.correct_choice_id;
          const seconds = questionTimes[q.id];
          return (
            <div key={q.id} className="card">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold">{idx + 1}. {q.question}</p>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {seconds !== undefined && (
                    <span className="text-xs font-semibold rounded-full px-2 py-1 bg-slate-800 text-slate-400">{formatSeconds(seconds)}</span>
                  )}
                  <span className={`text-xs font-semibold rounded-full px-2 py-1 ${isCorrect ? "bg-green-900/40 text-green-400" : chosen ? "bg-red-900/40 text-red-400" : "bg-slate-800 text-slate-400"}`}>
                    {isCorrect ? "Correct" : chosen ? "Incorrect" : "Not answered"}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5 mb-2">
                {q.choices.map((c) => {
                  const isThisCorrect = c.id === q.correct_choice_id;
                  const isThisChosen = c.id === chosen;
                  const pct = choiceStats[q.id]?.[c.id];
                  return (
                    <p
                      key={c.id}
                      className={`text-sm px-2 py-1 rounded flex items-center justify-between gap-2 ${
                        isThisCorrect ? "bg-green-900/20 text-green-300" : isThisChosen ? "bg-red-900/20 text-red-300" : "text-slate-400"
                      }`}
                    >
                      <span>
                        {c.text}
                        {isThisCorrect ? " (correct)" : isThisChosen ? " (your answer)" : ""}
                      </span>
                      {pct !== undefined && <span className="text-xs text-slate-500 shrink-0">{pct}%</span>}
                    </p>
                  );
                })}
              </div>
              {q.explanation && <p className="text-sm text-slate-300 border-t border-slate-800 pt-2 whitespace-pre-line">{q.explanation}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
