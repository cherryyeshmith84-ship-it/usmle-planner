"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  blankQBankChoice,
  blankQBankQuestion,
  choiceStatsToPercents,
  parseFullQBankQuestionTemplate,
  type ChoiceStatRow,
} from "@/lib/qbank";
import {
  DIFFICULTY_LEVELS,
  ERROR_TYPES,
  QUESTION_TYPES,
  STEP1_SUBJECTS,
  STEP1_SYSTEMS,
  type QBankQuestion,
  type QuestionAdminStatus,
  type QuestionDifficulty,
} from "@/lib/qbankTypes";
import ImageUploadField from "./ImageUploadField";

interface StudentAnswerRow {
  userId: string;
  name: string;
  choiceId: string | undefined;
  submittedAt: string | null;
}

/**
 * Small text link that opens an image full-size in a lightbox overlay -
 * used only inside the "Preview as student" modal below, so the admin can
 * check an uploaded image the same way a student would see it.
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

export default function QBankQuestionForm({
  userId,
  initial,
}: {
  userId: string;
  initial?: QBankQuestion;
}) {
  const router = useRouter();
  const blank = blankQBankQuestion();
  const [question, setQuestion] = useState(initial?.question ?? blank.question);
  const [questionImageUrl, setQuestionImageUrl] = useState<string | null>(
    initial?.question_image_url ?? null
  );
  const [choices, setChoices] = useState(initial?.choices ?? blank.choices);
  const [correctChoiceId, setCorrectChoiceId] = useState(initial?.correct_choice_id ?? "");
  const [explanation, setExplanation] = useState(initial?.explanation ?? "");
  const [explanationImageUrl, setExplanationImageUrl] = useState<string | null>(
    initial?.explanation_image_url ?? null
  );
  const [subjects, setSubjects] = useState<string[]>(initial?.subjects ?? []);
  const [systems, setSystems] = useState<string[]>(initial?.systems ?? []);

  // Main-explanation extras (section 2 of the editor spec) - kept in the
  // question's "meta" jsonb blob rather than their own columns.
  const [educationalObjective, setEducationalObjective] = useState(initial?.meta?.educational_objective ?? "");
  const [keyTakeaway, setKeyTakeaway] = useState(initial?.meta?.key_takeaway ?? "");
  const [examTrap, setExamTrap] = useState(initial?.meta?.exam_trap ?? "");

  // Classification extras (section 4) - Subjects/Systems above already act
  // as Discipline/System tags, these add finer categorization.
  const [topic, setTopic] = useState(initial?.meta?.topic ?? "");
  const [subtopic, setSubtopic] = useState(initial?.meta?.subtopic ?? "");
  const [primaryConcept, setPrimaryConcept] = useState(initial?.meta?.primary_concept ?? "");
  const [secondaryConceptsText, setSecondaryConceptsText] = useState(
    (initial?.meta?.secondary_concepts ?? []).join(", ")
  );
  const [difficulty, setDifficulty] = useState<QuestionDifficulty | "">(initial?.meta?.difficulty ?? "");
  const [questionType, setQuestionType] = useState(initial?.meta?.question_type ?? "");

  // Concept Library entries, fetched once so Topic/Subtopic/Primary concept
  // below can suggest the canonical spelling instead of relying on memory -
  // a typo here ("Vipoma" vs "VIPoma") silently fragments Master Grid and
  // Smart Review later, since they group by exact string match. Suggestions
  // only - typing a new value not yet in the library still works, it just
  // won't be offered as an existing option until it's added there too.
  const [conceptOptions, setConceptOptions] = useState<
    { system: string; topic: string; subtopic: string | null; concept: string }[]
  >([]);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("concept_library")
      .select("system, topic, subtopic, concept")
      .then(({ data }) => setConceptOptions(data ?? []));
  }, []);

  const topicOptions = useMemo(
    () => Array.from(new Set(conceptOptions.map((c) => c.topic))).sort(),
    [conceptOptions]
  );
  const subtopicOptions = useMemo(
    () =>
      Array.from(new Set(conceptOptions.map((c) => c.subtopic).filter((s): s is string => !!s))).sort(),
    [conceptOptions]
  );
  const conceptNameOptions = useMemo(
    () => Array.from(new Set(conceptOptions.map((c) => c.concept))).sort(),
    [conceptOptions]
  );

  // Admin publish workflow (section 1 status + section 7 buttons).
  const [status, setStatus] = useState<QuestionAdminStatus>(initial?.meta?.status ?? "draft");

  const [bulkText, setBulkText] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "Preview as student" modal (section 6) - simulates the take-a-question
  // screen using whatever is currently typed in the form, without saving.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewChoiceId, setPreviewChoiceId] = useState<string | null>(null);
  const [previewLightbox, setPreviewLightbox] = useState<string | null>(null);

  // Aggregate "who picked what" breakdown for this question, across every
  // submitted Question Bank test - only loaded when editing an existing
  // question (a brand-new one has no answers to report on yet).
  const [choicePercents, setChoicePercents] = useState<Record<string, number>>({});
  const [choiceCounts, setChoiceCounts] = useState<Record<string, number>>({});
  const [statsTotal, setStatsTotal] = useState(0);
  const [statsLoading, setStatsLoading] = useState(!!initial);

  // Admin-only: exactly which student picked which choice for this
  // question. Relies on the existing RLS policy on qbank_test_sessions
  // ("user_id = auth.uid() or is_admin()"), which already lets an admin
  // account read every student's submitted sessions directly - no new
  // Supabase function needed. Never shown to students.
  const [studentAnswers, setStudentAnswers] = useState<StudentAnswerRow[]>([]);

  useEffect(() => {
    if (!initial) return;
    setStatsLoading(true);
    const supabase = createClient();
    supabase
      .rpc("qbank_choice_stats", { p_question_id: initial.id })
      .then(({ data }) => {
        const { percents, counts, total } = choiceStatsToPercents((data ?? []) as ChoiceStatRow[]);
        setChoicePercents(percents);
        setChoiceCounts(counts);
        setStatsTotal(total);
        setStatsLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.id]);

  useEffect(() => {
    if (!initial) return;
    const supabase = createClient();
    (async () => {
      const { data: sessions } = await supabase
        .from("qbank_test_sessions")
        .select("user_id, answers, submitted_at")
        .not("submitted_at", "is", null)
        .contains("question_ids", [initial.id]);
      if (!sessions || sessions.length === 0) {
        setStudentAnswers([]);
        return;
      }
      const userIds = Array.from(new Set(sessions.map((s) => s.user_id)));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      const nameById: Record<string, string> = {};
      for (const p of profiles ?? []) {
        nameById[p.id] = p.full_name || p.email || "Unknown student";
      }
      const rows: StudentAnswerRow[] = sessions
        .map((s) => ({
          userId: s.user_id,
          name: nameById[s.user_id] ?? "Unknown student",
          choiceId: (s.answers as Record<string, string> | null)?.[initial.id],
          submittedAt: s.submitted_at as string | null,
        }))
        .filter((r): r is StudentAnswerRow => !!r.choiceId)
        .sort((a, b) =>
          a.submittedAt && b.submittedAt
            ? new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
            : 0
        );
      setStudentAnswers(rows);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.id]);

  function toggleTag(list: string[], setList: (v: string[]) => void, tag: string) {
    setList(list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]);
  }

  function handleBulkParse() {
    const parsed = parseFullQBankQuestionTemplate(bulkText);
    if (!parsed) {
      setBulkError(
        'Couldn\'t find at least 2 lettered/numbered options (like "A. ..." or "1. ...") in that paste. Make sure the answer choices are included, each on its own line.'
      );
      return;
    }
    setBulkError(null);
    setQuestion(parsed.question);
    const newChoices = parsed.choices.map((c) => ({
      ...blankQBankChoice(),
      text: c.text,
      distance: c.distance,
      rationale: c.rationale,
      error_note: c.error_note,
      error_type: c.error_type,
      confused_with: c.confused_with,
      weak_concept: c.weak_concept,
      key_concept: c.key_concept,
    }));
    setChoices(newChoices);
    setCorrectChoiceId(parsed.correctIndex >= 0 ? newChoices[parsed.correctIndex].id : "");
    setEducationalObjective(parsed.educationalObjective);
    setExplanation(parsed.explanation);
    setKeyTakeaway(parsed.keyTakeaway);
    setExamTrap(parsed.examTrap);
    setSubjects(parsed.subjects);
    setSystems(parsed.systems);
    setTopic(parsed.topic);
    setSubtopic(parsed.subtopic);
    setPrimaryConcept(parsed.primaryConcept);
    setSecondaryConceptsText(parsed.secondaryConcepts.join(", "));
    setDifficulty(parsed.difficulty);
    setQuestionType(parsed.questionType);
    setBulkText("");
  }

  function updateChoice(idx: number, text: string) {
    setChoices((prev) => prev.map((c, i) => (i === idx ? { ...c, text } : c)));
  }

  function updateChoiceDistance(idx: number, distance: "near" | "far") {
    setChoices((prev) => prev.map((c, i) => (i === idx ? { ...c, distance } : c)));
  }

  function updateChoiceImage(idx: number, url: string | null) {
    setChoices((prev) => prev.map((c, i) => (i === idx ? { ...c, image_url: url } : c)));
  }

  function updateChoiceRationale(idx: number, rationale: string) {
    setChoices((prev) => prev.map((c, i) => (i === idx ? { ...c, rationale } : c)));
  }

  function updateChoiceErrorNote(idx: number, error_note: string) {
    setChoices((prev) => prev.map((c, i) => (i === idx ? { ...c, error_note } : c)));
  }

  function updateChoiceErrorType(idx: number, error_type: string) {
    setChoices((prev) => prev.map((c, i) => (i === idx ? { ...c, error_type } : c)));
  }

  function updateChoiceConfusedWith(idx: number, confused_with: string) {
    setChoices((prev) => prev.map((c, i) => (i === idx ? { ...c, confused_with } : c)));
  }

  function updateChoiceWeakConcept(idx: number, weak_concept: string) {
    setChoices((prev) => prev.map((c, i) => (i === idx ? { ...c, weak_concept } : c)));
  }

  function updateChoiceKeyConcept(idx: number, key_concept: string) {
    setChoices((prev) => prev.map((c, i) => (i === idx ? { ...c, key_concept } : c)));
  }

  function addChoice() {
    setChoices((prev) => [...prev, blankQBankChoice()]);
  }

  function removeChoice(idx: number) {
    setChoices((prev) => {
      const removed = prev[idx];
      const next = prev.filter((_, i) => i !== idx);
      if (removed?.id === correctChoiceId) setCorrectChoiceId("");
      return next;
    });
  }

  /** Returns an error string if this status can't be saved yet, else null. */
  function validateForStatus(nextStatus: QuestionAdminStatus, cleanChoices: typeof choices): string | null {
    if (!question.trim()) return "Add the question text.";
    if (cleanChoices.length < 2) return "Add at least 2 answer choices.";
    // Drafts are allowed to be incomplete - that's the point of a draft.
    if (nextStatus === "draft") return null;
    if (!cleanChoices.some((c) => c.id === correctChoiceId)) {
      return "Mark which choice is correct (the radio button next to a choice).";
    }
    if (subjects.length === 0 && systems.length === 0) {
      return "Tag this question with at least one subject or system.";
    }
    if (nextStatus === "published") {
      if (!correctChoiceId) return "Add a correct answer before publishing.";
      if (!explanation.trim()) return "Add a main explanation before publishing.";
    }
    return null;
  }

  async function saveWithStatus(nextStatus: QuestionAdminStatus) {
    const cleanChoices = choices.map((c) => ({ ...c, text: c.text.trim() })).filter((c) => c.text.length > 0);
    const validationError = validateForStatus(nextStatus, cleanChoices);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    const supabase = createClient();
    const secondaryConcepts = secondaryConceptsText
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const payload = {
      question: question.trim(),
      question_image_url: questionImageUrl,
      choices: cleanChoices,
      correct_choice_id: cleanChoices.some((c) => c.id === correctChoiceId) ? correctChoiceId : "",
      explanation: explanation.trim(),
      explanation_image_url: explanationImageUrl,
      subjects,
      systems,
      meta: {
        educational_objective: educationalObjective.trim() || undefined,
        key_takeaway: keyTakeaway.trim() || undefined,
        exam_trap: examTrap.trim() || undefined,
        topic: topic.trim() || undefined,
        subtopic: subtopic.trim() || undefined,
        primary_concept: primaryConcept.trim() || undefined,
        secondary_concepts: secondaryConcepts.length > 0 ? secondaryConcepts : undefined,
        difficulty: difficulty || undefined,
        question_type: questionType || undefined,
        status: nextStatus,
      },
    };

    const { error } = initial
      ? await supabase.from("qbank_questions").update(payload).eq("id", initial.id)
      : await supabase.from("qbank_questions").insert({ ...payload, created_by: userId });

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setStatus(nextStatus);
    router.push("/admin/qbank");
    router.refresh();
  }

  async function handleDelete() {
    if (!initial) return;
    if (!confirm("Delete this question? This can't be undone.")) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("qbank_questions").delete().eq("id", initial.id);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/admin/qbank");
    router.refresh();
  }

  // Quality checklist (section 7) - informational, doesn't block Save Draft
  // or Send for Review. Only Publish is actually blocked (see
  // validateForStatus above), when the correct answer or main explanation
  // is missing.
  const wrongChoices = choices.filter((c) => c.id !== correctChoiceId);
  const checklist = [
    { label: "Correct answer selected", ok: !!correctChoiceId },
    {
      label: "All options have explanations",
      ok: choices.length > 0 && choices.every((c) => (c.rationale ?? "").trim().length > 0),
    },
    {
      label: "All wrong options have Error Notes",
      ok: wrongChoices.length === 0 || wrongChoices.every((c) => (c.error_note ?? "").trim().length > 0),
    },
    { label: "System and discipline selected", ok: subjects.length > 0 && systems.length > 0 },
    { label: "Educational objective completed", ok: educationalObjective.trim().length > 0 },
  ];

  const statusLabel: Record<QuestionAdminStatus, string> = {
    draft: "Draft",
    under_review: "Under Review",
    published: "Published",
  };

  return (
    <div className="space-y-6">
      <div className="card flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs text-slate-500">Question ID</p>
          <p className="text-sm text-slate-300">{initial?.id ?? "(assigned on save)"}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Status</p>
          <span
            className={`text-xs font-semibold rounded-full px-2 py-1 ${
              status === "published"
                ? "bg-green-900/40 text-green-400"
                : status === "under_review"
                ? "bg-amber-900/40 text-amber-400"
                : "bg-slate-800 text-slate-400"
            }`}
          >
            {statusLabel[status]}
          </span>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-2">Paste a question</h2>
        <p className="text-xs text-slate-400 mb-3">
          Paste a fully written question - stem, lettered choices, correct answer, distractor
          classification, educational objective, main explanation, key takeaway, exam trap,
          per-choice explanations (with error notes), subjects/systems checkboxes, and the
          classification block - and every field below fills itself in. You can also paste just
          the stem and choices if that&apos;s all you have; everything else is optional.
        </p>
        <textarea
          className="input mb-2"
          rows={10}
          placeholder={
            "A 35-year-old woman presents with...\n\nA. Choice one\nB. Choice two\nC. Choice three\n\nCorrect answer\nB. Choice two\n\n(the rest of the template - Distractor Classification, Educational Objective, Main Explanation, Per-Choice Explanations, Subjects, Systems, Classification - is optional but will all be picked up if it's there)"
          }
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
        />
        {bulkError && <p className="text-sm text-red-400 mb-2">{bulkError}</p>}
        <button type="button" onClick={handleBulkParse} className="btn-secondary" disabled={!bulkText.trim()}>
          Parse into fields below
        </button>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-4">Question</h2>
        <label className="label">Question text</label>
        <textarea
          className="input mb-4"
          rows={4}
          placeholder="Question text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />

        <ImageUploadField
          label="Question image (optional - e.g. a lab-value table, X-ray, ECG)"
          value={questionImageUrl}
          onChange={setQuestionImageUrl}
        />

        <p className="label mb-2">
          Answer choices - click the circle next to the correct one. For each wrong
          choice, tag whether it&apos;s a close distractor or an unrelated one, so the
          score report can tell a near-miss from a fundamentals gap.
        </p>
        <div className="space-y-2 mb-3">
          {choices.map((c, idx) => {
            const isCorrect = correctChoiceId === c.id;
            return (
              <div key={c.id} className="border border-slate-800 rounded-lg p-2">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct-choice"
                    checked={isCorrect}
                    onChange={() => setCorrectChoiceId(c.id)}
                    className="shrink-0 w-4 h-4"
                  />
                  <input
                    className="input flex-1"
                    placeholder={`Choice ${idx + 1}`}
                    value={c.text}
                    onChange={(e) => updateChoice(idx, e.target.value)}
                  />
                  {!isCorrect && (
                    <select
                      className="input w-auto text-xs shrink-0"
                      value={c.distance ?? "far"}
                      onChange={(e) => updateChoiceDistance(idx, e.target.value as "near" | "far")}
                    >
                      <option value="far">Far miss</option>
                      <option value="near">Near miss</option>
                    </select>
                  )}
                  {choices.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeChoice(idx)}
                      className="text-slate-500 hover:text-red-400 text-sm px-2"
                    >
                      &times;
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <button type="button" onClick={addChoice} className="text-sm text-brand-400 hover:text-brand-300 font-medium mb-4">
          + Add another choice
        </button>

        <label className="label">
          Educational objective (optional - the one-line "point" of this question)
        </label>
        <textarea
          className="input mb-4"
          rows={2}
          placeholder='e.g. "Orlistat inhibits gastric and pancreatic lipases, reducing fat absorption."'
          value={educationalObjective}
          onChange={(e) => setEducationalObjective(e.target.value)}
        />

        <label className="label">
          Main explanation (optional - the high-yield summary/big picture, shown above the
          per-choice explanations below)
        </label>
        <textarea
          className="input"
          rows={3}
          placeholder="High-yield chain / key distinction / bottom line"
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
        />

        <ImageUploadField
          label="Explanation image (optional)"
          value={explanationImageUrl}
          onChange={setExplanationImageUrl}
        />

        <label className="label mt-4">Key takeaway (optional - shown as a highlighted callout)</label>
        <textarea
          className="input mb-4"
          rows={2}
          placeholder={"e.g. \"Orlistat -> inhibits gastric & pancreatic lipases -> ↓ fat absorption -> steatorrhea\""}
          value={keyTakeaway}
          onChange={(e) => setKeyTakeaway(e.target.value)}
        />

        <label className="label">Exam trap (optional - a common mix-up worth flagging, shown as a callout)</label>
        <textarea
          className="input"
          rows={2}
          placeholder="e.g. Don't confuse this drug's mechanism with a similar-looking one."
          value={examTrap}
          onChange={(e) => setExamTrap(e.target.value)}
        />

        <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
          <p className="label mb-0">
            Per-choice explanations (optional - each one is shown together with that choice's
            letter and image in the explanation section, all in one place)
          </p>
          {choices.map((c, idx) => {
            const isCorrect = correctChoiceId === c.id;
            const letter = String.fromCharCode(65 + idx);
            return (
              <div key={c.id} className="border border-slate-800 rounded-lg p-3">
                <p className="text-xs font-semibold mb-2 flex items-center gap-1.5 flex-wrap">
                  <span className={isCorrect ? "text-green-400" : "text-red-400"}>{isCorrect ? "✓" : "✗"}</span>
                  <span className="text-slate-300">
                    Choice {letter}
                    {c.text ? `: ${c.text}` : ""}
                  </span>
                  {isCorrect && <span className="text-green-400 font-normal">(Correct answer)</span>}
                </p>
                <label className="label mb-1">Why this option is {isCorrect ? "correct" : "wrong"}</label>
                <textarea
                  className="input mb-2"
                  rows={2}
                  placeholder={`e.g. "${letter} is ${isCorrect ? "correct" : "incorrect"} because..."`}
                  value={c.rationale ?? ""}
                  onChange={(e) => updateChoiceRationale(idx, e.target.value)}
                />
                <ImageUploadField
                  label={`Image for choice ${idx + 1} (optional)`}
                  value={c.image_url}
                  onChange={(url) => updateChoiceImage(idx, url)}
                />
                {isCorrect ? (
                  <div className="mt-2">
                    <label className="label mb-1">Key concept</label>
                    <input
                      className="input"
                      placeholder="One-line takeaway for why this is right"
                      value={c.key_concept ?? ""}
                      onChange={(e) => updateChoiceKeyConcept(idx, e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    <div>
                      <label className="label mb-1">Error note</label>
                      <textarea
                        className="input"
                        rows={2}
                        placeholder='e.g. "Acarbose -> carbs, Orlistat -> fats"'
                        value={c.error_note ?? ""}
                        onChange={(e) => updateChoiceErrorNote(idx, e.target.value)}
                      />
                    </div>
                    <div className="grid sm:grid-cols-3 gap-2">
                      <div>
                        <label className="label mb-1">Error type</label>
                        <select
                          className="input text-xs"
                          value={c.error_type ?? ""}
                          onChange={(e) => updateChoiceErrorType(idx, e.target.value)}
                        >
                          <option value="">Not set</option>
                          {ERROR_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label mb-1">Confused with</label>
                        <input
                          className="input text-xs"
                          placeholder="e.g. Orlistat"
                          value={c.confused_with ?? ""}
                          onChange={(e) => updateChoiceConfusedWith(idx, e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="label mb-1">Weak concept</label>
                        <input
                          className="input text-xs"
                          placeholder="e.g. GI-acting metabolic drugs"
                          value={c.weak_concept ?? ""}
                          onChange={(e) => updateChoiceWeakConcept(idx, e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {initial && (
        <div className="card">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold">Student answers so far</h2>
            <Link
              href={`/admin/qbank/${initial.id}/performance`}
              className="text-xs font-medium text-brand-400 hover:text-brand-300"
            >
              View performance &rarr;
            </Link>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            {statsLoading
              ? "Loading..."
              : statsTotal > 0
              ? `${statsTotal} student answer${statsTotal === 1 ? "" : "s"} recorded, across everyone who has taken this question.`
              : "No one has answered this question yet."}
          </p>
          {!statsLoading && statsTotal > 0 && (
            <div className="space-y-1.5">
              {choices.map((c) => {
                const isCorrect = c.id === correctChoiceId;
                const pct = choicePercents[c.id] ?? 0;
                const count = choiceCounts[c.id] ?? 0;
                return (
                  <div
                    key={c.id}
                    className={`flex items-center justify-between gap-2 text-sm px-2 py-1 rounded ${
                      isCorrect ? "bg-green-900/20 text-green-300" : "text-slate-300"
                    }`}
                  >
                    <span className="truncate">
                      {c.text || "(blank choice)"}
                      {isCorrect ? " (correct)" : ""}
                    </span>
                    <span className="text-xs text-slate-400 shrink-0">
                      {pct}% ({count})
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {!statsLoading && studentAnswers.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-800">
              <p className="text-xs text-slate-500 mb-2">Who chose what (visible to admins only):</p>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {studentAnswers.map((row) => {
                  const choiceIdx = choices.findIndex((c) => c.id === row.choiceId);
                  const choiceLetter = choiceIdx >= 0 ? String.fromCharCode(65 + choiceIdx) : "?";
                  const isCorrect = row.choiceId === correctChoiceId;
                  return (
                    <div
                      key={row.userId}
                      className="flex items-center justify-between gap-2 text-sm px-2 py-1 rounded bg-slate-900/40"
                    >
                      <span className="truncate">{row.name}</span>
                      <span className={`text-xs shrink-0 ${isCorrect ? "text-green-400" : "text-red-400"}`}>
                        Chose {choiceLetter}
                        {isCorrect ? " (correct)" : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h2 className="font-semibold mb-1">Subjects</h2>
        <p className="text-xs text-slate-400 mb-3">
          Tag every discipline this question touches on - it can have more than one.
        </p>
        <div className="grid sm:grid-cols-2 gap-2">
          {STEP1_SUBJECTS.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={subjects.includes(s)}
                onChange={() => toggleTag(subjects, setSubjects, s)}
                className="w-4 h-4"
              />
              {s}
            </label>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-1">Systems</h2>
        <p className="text-xs text-slate-400 mb-3">
          Tag every organ system this question touches on - it can have more than one, and it
          can also share subjects/systems with other questions (a question can come under both).
        </p>
        <div className="grid sm:grid-cols-2 gap-2">
          {STEP1_SYSTEMS.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={systems.includes(s)}
                onChange={() => toggleTag(systems, setSystems, s)}
                className="w-4 h-4"
              />
              {s}
            </label>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold">Classification</h2>
          <Link href="/admin/concepts" className="text-xs font-medium text-brand-400 hover:text-brand-300">
            Manage Concept Library &rarr;
          </Link>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Finer-grained tags on top of Subjects/Systems above - useful for search and future
          performance analytics. Topic/Subtopic/Primary concept suggest existing names from the
          Concept Library as you type - pick a suggestion instead of retyping it to keep Master
          Grid and Smart Review from splitting one concept into near-duplicates. All optional.
        </p>
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Topic</label>
            <input
              className="input"
              list="topic-options"
              placeholder="e.g. Obesity"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <datalist id="topic-options">
              {topicOptions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label">Subtopic</label>
            <input
              className="input"
              list="subtopic-options"
              placeholder="e.g. Obesity pharmacotherapy"
              value={subtopic}
              onChange={(e) => setSubtopic(e.target.value)}
            />
            <datalist id="subtopic-options">
              {subtopicOptions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Primary concept</label>
            <input
              className="input"
              list="concept-options"
              placeholder="e.g. Orlistat"
              value={primaryConcept}
              onChange={(e) => setPrimaryConcept(e.target.value)}
            />
            <datalist id="concept-options">
              {conceptNameOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label">Secondary concepts (comma-separated)</label>
            <input
              className="input"
              placeholder="e.g. Fat absorption, Pancreatic lipase"
              value={secondaryConceptsText}
              onChange={(e) => setSecondaryConceptsText(e.target.value)}
            />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Difficulty</label>
            <select
              className="input"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as QuestionDifficulty | "")}
            >
              <option value="">Not set</option>
              {DIFFICULTY_LEVELS.map((d) => (
                <option key={d} value={d}>
                  {d[0].toUpperCase() + d.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Question type</label>
            <select className="input" value={questionType} onChange={(e) => setQuestionType(e.target.value)}>
              <option value="">Not set</option>
              {QUESTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Question quality</h2>
        <div className="space-y-1.5 mb-3">
          {checklist.map((item) => (
            <p
              key={item.label}
              className={`text-sm flex items-center gap-2 ${item.ok ? "text-green-400" : "text-slate-500"}`}
            >
              <span>{item.ok ? "✓" : "○"}</span> {item.label}
            </p>
          ))}
          {!explanationImageUrl && (
            <p className="text-sm text-amber-400 flex items-center gap-2">
              <span>⚠</span> No explanation image added
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setPreviewChoiceId(null);
            setPreviewOpen(true);
          }}
          className="btn-secondary"
        >
          Preview as student
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-secondary" disabled={saving} onClick={() => saveWithStatus("draft")}>
          {saving ? "Saving..." : "Save draft"}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={saving}
          onClick={() => saveWithStatus("under_review")}
        >
          Send for review
        </button>
        <button type="button" className="btn-primary" disabled={saving} onClick={() => saveWithStatus("published")}>
          Publish
        </button>
        {initial && (
          <button type="button" onClick={handleDelete} className="btn-secondary text-red-400" disabled={saving}>
            Delete question
          </button>
        )}
      </div>

      {previewOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/80 flex items-center justify-center px-4 py-8"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="card max-w-2xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Preview as student</h2>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                Close
              </button>
            </div>
            <p className="text-sm font-semibold mb-3">{question || "(no question text yet)"}</p>
            {questionImageUrl && (
              <div className="mb-3">
                <ImageLink url={questionImageUrl} label="View image" onOpen={setPreviewLightbox} />
              </div>
            )}
            <div className="space-y-2 mb-4">
              {choices.map((c, i) => {
                const isChosen = previewChoiceId === c.id;
                const isCorrect = c.id === correctChoiceId;
                let borderClass = "border-slate-700 hover:border-slate-600";
                if (previewChoiceId) {
                  if (isCorrect) borderClass = "border-green-600 bg-green-900/20";
                  else if (isChosen) borderClass = "border-red-600 bg-red-900/20";
                }
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={!!previewChoiceId}
                    onClick={() => setPreviewChoiceId(c.id)}
                    className={`w-full text-left border rounded-xl px-3 py-2 text-sm transition ${borderClass}`}
                  >
                    {String.fromCharCode(65 + i)}. {c.text || "(blank choice)"}
                  </button>
                );
              })}
            </div>
            {previewChoiceId && (
              <div className="pt-3 border-t border-slate-800 space-y-3">
                <p
                  className={`text-sm font-semibold ${
                    previewChoiceId === correctChoiceId ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {previewChoiceId === correctChoiceId ? "Correct" : "Incorrect"}
                </p>
                {educationalObjective && (
                  <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
                    <p className="text-xs font-semibold text-slate-400 mb-1">Educational objective</p>
                    <p className="text-sm text-slate-300">{educationalObjective}</p>
                  </div>
                )}
                {explanationImageUrl && (
                  <ImageLink url={explanationImageUrl} label="View image" onOpen={setPreviewLightbox} />
                )}
                {explanation && <p className="text-sm text-slate-300 whitespace-pre-line">{explanation}</p>}
                {keyTakeaway && (
                  <div className="p-2 rounded bg-brand-900/20 border border-brand-800/40">
                    <p className="text-xs font-semibold text-brand-300 mb-1">Key takeaway</p>
                    <p className="text-sm text-slate-200 whitespace-pre-line">{keyTakeaway}</p>
                  </div>
                )}
                {examTrap && (
                  <div className="p-2 rounded bg-amber-900/20 border border-amber-800/40">
                    <p className="text-xs font-semibold text-amber-300 mb-1">Exam trap</p>
                    <p className="text-sm text-slate-200 whitespace-pre-line">{examTrap}</p>
                  </div>
                )}
                <div className="space-y-2">
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
                              <ImageLink url={c.image_url} label="View image" onOpen={setPreviewLightbox} />
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
              </div>
            )}
          </div>
        </div>
      )}

      {previewLightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center px-4 py-8"
          onClick={() => setPreviewLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewLightbox(null)}
            className="absolute top-4 right-4 text-white text-2xl leading-none hover:text-slate-300"
          >
            &times;
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewLightbox}
            alt=""
            className="max-w-full max-h-full rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
