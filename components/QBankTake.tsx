"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { chunkIntoBlocks, formatSeconds } from "@/lib/assessments";
import type { QBankQuestion, QBankTestSession, ExamModeOption } from "@/lib/qbankTypes";
import LabValuesSearch from "./LabValuesSearch";
import AiHelper from "./AiHelper";
import ExamCalculator from "./ExamCalculator";
import ExamSettings, { type ExamTheme, type FontSize } from "./ExamSettings";
import QuestionNavigator from "./QuestionNavigator";

type Phase = "start" | "taking" | "blockDone" | "results";

const FONT_SIZE_PX: Record<FontSize, string> = { sm: "13px", md: "14px", lg: "17px" };
const SECONDS_PER_QUESTION = 90; // ~1.5 min/question, standard USMLE pacing

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
      if (range.toString().trim().length === 0)
