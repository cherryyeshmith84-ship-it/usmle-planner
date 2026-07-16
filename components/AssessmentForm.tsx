"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { blankChoice, blankQuestion, parsePastedQuestion } from "@/lib/assessments";
import type { Assessment, AssessmentKind, AssessmentQuestion, AssessmentQuestionMeta } from "@/lib/types";
import { DIFFICULTY_LEVELS, ERROR_TYPES, QUESTION_TYPES, type QuestionDifficulty } from "@/lib/qbankTypes";
import ImageUploadField from "./ImageUploadField";

export default function AssessmentForm({
  userId,
  initial,
}: {
  userId: string;
  initial?: Assessment;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  // Question Bank now lives in its own tagged pool (see /admin/qbank) -
  // this form only ever creates one-attempt Self Assessments.
  const kind: AssessmentKind = "self_assessment";
  const [testId, setTestId] = useState(initial?.test_id ?? "");
  const [questionsPerBlock, setQuestionsPerBlock] = useState(
    initial?.questions_per_block?.toString() ?? "20"
  );
  const [blockMinutes, setBlockMinutes] = useState(initial?.block_time_minutes?.toString() ?? "30");
  const [breakMinutes, setBreakMinutes] = useState(initial?.break_minutes?.toString() ?? "15");
  const [questions, setQuestions] = useState<AssessmentQuestion[]>(
    initial?.questions?.length ? initial.questions : [blankQuestion()]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bulkText, setBulkText] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);

  function updateQuestion(qIdx: number, patch: Partial<AssessmentQuestion>) {
    setQuestions((prev) => prev.map((q, i) => (i === qIdx ? { ...q, ...patch } : q)));
  }

  function updateChoice(qIdx: number, cIdx: number, text: string) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i !== qIdx
          ? q
          : { ...q, choices: q.choices.map((c, ci) => (ci === cIdx ? { ...c, text } : c)) }
      )
    );
  }

  function updateChoiceDistance(qIdx: number, cIdx: number, distance: "near" | "far") {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i !== qIdx
          ? q
          : { ...q, choices: q.choices.map((c, ci) => (ci === cIdx ? { ...c, distance } : c)) }
      )
    );
  }

  function updateChoiceImage(qIdx: number, cIdx: number, url: string | null) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i !== qIdx
          ? q
          : { ...q, choices: q.choices.map((c, ci) => (ci === cIdx ? { ...c, image_url: url } : c)) }
      )
    );
  }

  function updateChoiceRationale(qIdx: number, cIdx: number, rationale: string) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i !== qIdx
          ? q
          : { ...q, choices: q.choices.map((c, ci) => (ci === cIdx ? { ...c, rationale } : c)) }
      )
    );
  }

  function updateChoiceErrorNote(qIdx: number, cIdx: number, error_note: string) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i !== qIdx
          ? q
          : { ...q, choices: q.choices.map((c, ci) => (ci === cIdx ? { ...c, error_note } : c)) }
      )
    );
  }

  function updateChoiceErrorType(qIdx: number, cIdx: number, error_type: string) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i !== qIdx
          ? q
          : { ...q, choices: q.choices.map((c, ci) => (ci === cIdx ? { ...c, error_type } : c)) }
      )
    );
  }

  function updateChoiceConfusedWith(qIdx: number, cIdx: number, confused_with: string) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i !== qIdx
          ? q
          : { ...q, choices: q.choices.map((c, ci) => (ci === cIdx ? { ...c, confused_with } : c)) }
      )
    );
  }

  function updateChoiceWeakConcept(qIdx: number, cIdx: number, weak_concept: string) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i !== qIdx
          ? q
          : { ...q, choices: q.choices.map((c, ci) => (ci === cIdx ? { ...c, weak_concept } : c)) }
      )
    );
  }

  function updateChoiceKeyConcept(qIdx: number, cIdx: number, key_concept: string) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i !== qIdx
          ? q
          : { ...q, choices: q.choices.map((c, ci) => (ci === cIdx ? { ...c, key_concept } : c)) }
      )
    );
  }

  function updateQuestionMeta(qIdx: number, patch: Partial<AssessmentQuestionMeta>) {
    setQuestions((prev) =>
      prev.map((q, i) => (i !== qIdx ? q : { ...q, meta: { ...(q.meta ?? {}), ...patch } }))
    );
  }

  const VIGNETTE_TEMPLATE = `A [age]-year-old [gender] presents to the [ED/clinic/hospital] with [chief complaint].
History: [onset, duration, associated symptoms, relevant PMH]
Review of systems: [pertinent positives and negatives]
Medications: [current meds]
Physical exam: [vitals, relevant findings]
Labs/imaging: [relevant values]

What is the most likely diagnosis?`;

  function insertVignetteTemplate(qIdx: number) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i !== qIdx
          ? q
          : { ...q, question: q.question ? `${q.question}\n\n${VIGNETTE_TEMPLATE}` : VIGNETTE_TEMPLATE }
      )
    );
  }

  function handleBulkParse() {
    const parsed = parsePastedQuestion(bulkText);
    if (!parsed) {
      setBulkError(
        'Couldn\'t find at least 2 lettered/numbered options (like "A. ..." or "1. ...") in that paste. Make sure the answer choices are included, each on its own line.'
      );
      return;
    }
    setBulkError(null);
    const newQuestion: AssessmentQuestion = {
      ...blankQuestion(),
      question: parsed.question,
      choices: parsed.choices.map((text) => ({ ...blankChoice(), text })),
    };
    setQuestions((prev) => [...prev, newQuestion]);
    setBulkText("");
  }

  function addChoice(qIdx: number) {
    setQuestions((prev) =>
      prev.map((q, i) => (i !== qIdx ? q : { ...q, choices: [...q.choices, blankChoice()] }))
    );
  }

  function removeChoice(qIdx: number, cIdx: number) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        const removed = q.choices[cIdx];
        return {
          ...q,
          choices: q.choices.filter((_, ci) => ci !== cIdx),
          correct_choice_id: q.correct_choice_id === removed?.id ? "" : q.correct_choice_id,
        };
      })
    );
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, blankQuestion()]);
  }

  function removeQuestion(qIdx: number) {
    setQuestions((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== qIdx);
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Give this assessment a name.");
      return;
    }
    const cleanQuestions = questions
      .map((q) => ({
        ...q,
        question: q.question.trim(),
        choices: q.choices.map((c) => ({ ...c, text: c.text.trim() })).filter((c) => c.text.length > 0),
      }))
      .filter((q) => q.question.length > 0 && q.choices.length >= 2)
      .map((q) => ({
        ...q,
        // If the marked-correct choice got removed/cleared, don't silently
        // keep a stale id pointing at nothing.
        correct_choice_id: q.choices.some((c) => c.id === q.correct_choice_id) ? q.correct_choice_id : "",
        meta: {
          educational_objective: q.meta?.educational_objective?.trim() || undefined,
          key_takeaway: q.meta?.key_takeaway?.trim() || undefined,
          exam_trap: q.meta?.exam_trap?.trim() || undefined,
          topic: q.meta?.topic?.trim() || undefined,
          subtopic: q.meta?.subtopic?.trim() || undefined,
          primary_concept: q.meta?.primary_concept?.trim() || undefined,
          secondary_concepts: q.meta?.secondary_concepts?.trim() || undefined,
          difficulty: q.meta?.difficulty || undefined,
          question_type: q.meta?.question_type || undefined,
        },
      }));

    if (cleanQuestions.length === 0) {
      setError("Add at least one question with at least 2 answer choices.");
      return;
    }
    const missingCorrect = cleanQuestions.some((q) => !q.correct_choice_id);
    if (missingCorrect) {
      setError("Every question needs a correct answer marked (the radio button next to a choice).");
      return;
    }

    setSaving(true);
    setError(null);
    const supabase = createClient();
    const payload = {
      name: name.trim(),
      kind,
      test_id: testId.trim() || null,
      questions_per_block: questionsPerBlock ? Number(questionsPerBlock) : 20,
      block_time_minutes: blockMinutes ? Number(blockMinutes) : 30,
      break_minutes: breakMinutes ? Number(breakMinutes) : 15,
      questions: cleanQuestions,
    };

    const { error } = initial
      ? await supabase.from("assessments").update(payload).eq("id", initial.id)
      : await supabase.from("assessments").insert({ ...payload, created_by: userId });

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/admin/assessments");
    router.refresh();
  }

  async function handleDelete() {
    if (!initial) return;
    if (!confirm(`Delete "${initial.name}"? This also deletes every student's attempt at it.`)) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("assessments").delete().eq("id", initial.id);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/admin/assessments");
    router.refresh();
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="card">
        <h2 className="font-semibold mb-4">Assessment details</h2>

        <label className="label">Name</label>
        <input
          className="input mb-4"
          placeholder="e.g. Cardio block 1, Micro self-assessment"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <label className="label">Test Id (optional, shown to students during the exam)</label>
        <input
          className="input mb-4"
          placeholder="e.g. 427015382"
          value={testId}
          onChange={(e) => setTestId(e.target.value)}
        />

        <div className="grid sm:grid-cols-2 gap-4 mb-2">
          <div>
            <label className="label">Questions per block</label>
            <input
              type="number"
              min={1}
              max={100}
              className="input"
              value={questionsPerBlock}
              onChange={(e) => setQuestionsPerBlock(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Minutes per block</label>
            <input
              type="number"
              min={1}
              max={180}
              className="input"
              value={blockMinutes}
              onChange={(e) => setBlockMinutes(e.target.value)}
            />
          </div>
        </div>
        <label className="label">Total break time (minutes, shared across the whole exam)</label>
        <input
          type="number"
          min={0}
          max={120}
          className="input mb-2"
          value={breakMinutes}
          onChange={(e) => setBreakMinutes(e.target.value)}
        />
        <p className="text-xs text-slate-400">
          {(() => {
            const qpb = Math.max(1, Number(questionsPerBlock) || 20);
            const numBlocks = Math.max(1, Math.ceil(questions.length / qpb));
            const examMin = numBlocks * (Number(blockMinutes) || 30);
            const brk = Number(breakMinutes) || 0;
            return `With ${questions.length} question${questions.length === 1 ? "" : "s"} total, this becomes ${numBlocks} block${
              numBlocks === 1 ? "" : "s"
            } (${examMin} minutes of exam time + ${brk} minutes of break = ${examMin + brk} minutes total). After each block (except the last), students can continue straight to the next block or take a break - breaks come out of that shared ${brk}-minute pool and can be split across as many breaks as they want. Scores are only shown after every block is done.`;
          })()}
        </p>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-2">Paste a question</h2>
        <p className="text-xs text-slate-400 mb-3">
          Paste a full question with its lettered/numbered answer choices (e.g. copied straight
          from UWorld) - it&apos;ll split the stem and options into a new question below. You&apos;ll
          still need to mark the correct answer and add an explanation.
        </p>
        <textarea
          className="input mb-2"
          rows={6}
          placeholder={
            "A 35-year-old woman presents with...\n\nA. Choice one\nB. Choice two\nC. Choice three"
          }
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
        />
        {bulkError && <p className="text-sm text-red-400 mb-2">{bulkError}</p>}
        <button
          type="button"
          onClick={handleBulkParse}
          className="btn-secondary"
          disabled={!bulkText.trim()}
        >
          Parse &amp; add as new question
        </button>
      </div>

      <div className="space-y-4">
        {questions.map((q, qIdx) => (
          <div key={q.id} className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Question {qIdx + 1}</h3>
              {questions.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeQuestion(qIdx)}
                  className="text-sm text-slate-500 hover:text-red-400"
                >
                  Remove question
                </button>
              )}
            </div>

            <div className="flex items-center justify-between mb-1">
              <span className="label mb-0">Question text</span>
              <button
                type="button"
                onClick={() => insertVignetteTemplate(qIdx)}
                className="text-xs text-brand-400 hover:text-brand-300 font-medium"
              >
                + Insert clinical vignette template
              </button>
            </div>
            <textarea
              className="input mb-3"
              rows={3}
              placeholder="Question text"
              value={q.question}
              onChange={(e) => updateQuestion(qIdx, { question: e.target.value })}
            />

            <ImageUploadField
              label="Question image (optional - e.g. a lab-value table, X-ray, ECG)"
              value={q.question_image_url}
              onChange={(url) => updateQuestion(qIdx, { question_image_url: url })}
            />

            <p className="label mb-2">
              Answer choices - click the circle next to the correct one. For each wrong
              choice, tag whether it&apos;s a close distractor or an unrelated one, so the
              score report can tell a near-miss from a fundamentals gap.
            </p>
            <div className="space-y-2 mb-3">
              {q.choices.map((c, cIdx) => {
                const isCorrect = q.correct_choice_id === c.id;
                return (
                  <div key={c.id} className="border border-slate-800 rounded-lg p-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`correct-${q.id}`}
                        checked={isCorrect}
                        onChange={() => updateQuestion(qIdx, { correct_choice_id: c.id })}
                        className="shrink-0 w-4 h-4"
                      />
                      <input
                        className="input flex-1"
                        placeholder={`Choice ${cIdx + 1}`}
                        value={c.text}
                        onChange={(e) => updateChoice(qIdx, cIdx, e.target.value)}
                      />
                      {!isCorrect && (
                        <select
                          className="input w-auto text-xs shrink-0"
                          value={c.distance ?? "far"}
                          onChange={(e) =>
                            updateChoiceDistance(qIdx, cIdx, e.target.value as "near" | "far")
                          }
                        >
                          <option value="far">Far miss</option>
                          <option value="near">Near miss</option>
                        </select>
                      )}
                      {q.choices.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeChoice(qIdx, cIdx)}
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
            <button
              type="button"
              onClick={() => addChoice(qIdx)}
              className="text-sm text-brand-400 hover:text-brand-300 font-medium mb-4"
            >
              + Add another choice
            </button>

            <label className="label">
              Overall explanation (optional - the high-yield summary/big picture, shown above the
              per-choice explanations below)
            </label>
            <textarea
              className="input"
              rows={2}
              placeholder="High-yield chain / key distinction / bottom line"
              value={q.explanation}
              onChange={(e) => updateQuestion(qIdx, { explanation: e.target.value })}
            />

            <ImageUploadField
              label="Explanation image (optional)"
              value={q.explanation_image_url}
              onChange={(url) => updateQuestion(qIdx, { explanation_image_url: url })}
            />

            <label className="label mt-4">Key takeaway (optional - shown as a highlighted callout)</label>
            <textarea
              className="input mb-4"
              rows={2}
              placeholder={"e.g. \"Orlistat -> inhibits gastric & pancreatic lipases -> ↓ fat absorption -> steatorrhea\""}
              value={q.meta?.key_takeaway ?? ""}
              onChange={(e) => updateQuestionMeta(qIdx, { key_takeaway: e.target.value })}
            />

            <label className="label">Exam trap (optional - a common mix-up worth flagging, shown as a callout)</label>
            <textarea
              className="input mb-4"
              rows={2}
              placeholder="e.g. Don't confuse this drug's mechanism with a similar-looking one."
              value={q.meta?.exam_trap ?? ""}
              onChange={(e) => updateQuestionMeta(qIdx, { exam_trap: e.target.value })}
            />

            <label className="label">
              Educational objective (optional - the one-line &quot;point&quot; of this question)
            </label>
            <textarea
              className="input"
              rows={2}
              placeholder='e.g. "Orlistat inhibits gastric and pancreatic lipases, reducing fat absorption."'
              value={q.meta?.educational_objective ?? ""}
              onChange={(e) => updateQuestionMeta(qIdx, { educational_objective: e.target.value })}
            />

            <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
              <p className="label mb-0">
                Per-choice explanations (optional - each one is shown together with that
                choice's letter and image in the explanation section, all in one place)
              </p>
              {q.choices.map((c, cIdx) => {
                const isCorrect = q.correct_choice_id === c.id;
                const letter = String.fromCharCode(65 + cIdx);
                return (
                  <div key={c.id} className="border border-slate-800 rounded-lg p-3">
                    <p className="text-xs font-semibold mb-2 flex items-center gap-1.5 flex-wrap">
                      <span className={isCorrect ? "text-green-400" : "text-red-400"}>
                        {isCorrect ? "✓" : "✗"}
                      </span>
                      <span className="text-slate-300">
                        Choice {letter}
                        {c.text ? `: ${c.text}` : ""}
                      </span>
                      {isCorrect && <span className="text-green-400 font-normal">(Correct answer)</span>}
                    </p>
                    <textarea
                      className="input mb-2"
                      rows={2}
                      placeholder={`e.g. "${letter} is ${isCorrect ? "correct" : "incorrect"} because..."`}
                      value={c.rationale ?? ""}
                      onChange={(e) => updateChoiceRationale(qIdx, cIdx, e.target.value)}
                    />
                    <ImageUploadField
                      label={`Image for choice ${cIdx + 1} (optional)`}
                      value={c.image_url}
                      onChange={(url) => updateChoiceImage(qIdx, cIdx, url)}
                    />
                    {isCorrect ? (
                      <div className="mt-2">
                        <label className="label mb-1">Key concept</label>
                        <input
                          className="input"
                          placeholder="One-line takeaway for why this is right"
                          value={c.key_concept ?? ""}
                          onChange={(e) => updateChoiceKeyConcept(qIdx, cIdx, e.target.value)}
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
                            onChange={(e) => updateChoiceErrorNote(qIdx, cIdx, e.target.value)}
                          />
                        </div>
                        <div className="grid sm:grid-cols-3 gap-2">
                          <div>
                            <label className="label mb-1">Error type</label>
                            <select
                              className="input text-xs"
                              value={c.error_type ?? ""}
                              onChange={(e) => updateChoiceErrorType(qIdx, cIdx, e.target.value)}
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
                              onChange={(e) => updateChoiceConfusedWith(qIdx, cIdx, e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="label mb-1">Weak concept</label>
                            <input
                              className="input text-xs"
                              placeholder="e.g. GI-acting metabolic drugs"
                              value={c.weak_concept ?? ""}
                              onChange={(e) => updateChoiceWeakConcept(qIdx, cIdx, e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-800">
              <p className="label mb-2">Classification (optional - useful for search and analytics)</p>
              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="label">Topic</label>
                  <input
                    className="input"
                    placeholder="e.g. Obesity"
                    value={q.meta?.topic ?? ""}
                    onChange={(e) => updateQuestionMeta(qIdx, { topic: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Subtopic</label>
                  <input
                    className="input"
                    placeholder="e.g. Obesity pharmacotherapy"
                    value={q.meta?.subtopic ?? ""}
                    onChange={(e) => updateQuestionMeta(qIdx, { subtopic: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="label">Primary concept</label>
                  <input
                    className="input"
                    placeholder="e.g. Orlistat"
                    value={q.meta?.primary_concept ?? ""}
                    onChange={(e) => updateQuestionMeta(qIdx, { primary_concept: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Secondary concepts (comma-separated)</label>
                  <input
                    className="input"
                    placeholder="e.g. Fat absorption, Pancreatic lipase"
                    value={q.meta?.secondary_concepts ?? ""}
                    onChange={(e) => updateQuestionMeta(qIdx, { secondary_concepts: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Difficulty</label>
                  <select
                    className="input"
                    value={q.meta?.difficulty ?? ""}
                    onChange={(e) =>
                      updateQuestionMeta(qIdx, { difficulty: (e.target.value || undefined) as QuestionDifficulty | undefined })
                    }
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
                  <select
                    className="input"
                    value={q.meta?.question_type ?? ""}
                    onChange={(e) => updateQuestionMeta(qIdx, { question_type: e.target.value })}
                  >
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
          </div>
        ))}
      </div>

      <button type="button" onClick={addQuestion} className="btn-secondary">
        + Add another question
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={saving}>
          {saving ? "Saving..." : initial ? "Save changes" : "Create assessment"}
        </button>
        {initial && (
          <button
            type="button"
            onClick={handleDelete}
            className="btn-secondary text-red-400"
            disabled={saving}
          >
            Delete assessment
          </button>
        )}
      </div>
    </form>
  );
}
