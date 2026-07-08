"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { blankChoice, blankQuestion, chunkIntoBlocks } from "@/lib/assessments";
import type { Assessment, AssessmentQuestion } from "@/lib/types";

export default function AssessmentForm({
  userId,
  initial,
}: {
  userId: string;
  initial?: Assessment;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [questionsPerBlock, setQuestionsPerBlock] = useState(
    initial?.questions_per_block?.toString() ?? "20"
  );
  const [blockMinutes, setBlockMinutes] = useState(initial?.block_time_minutes?.toString() ?? "30");
  const [questions, setQuestions] = useState<AssessmentQuestion[]>(
    initial?.questions?.length ? initial.questions : [blankQuestion()]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      questions_per_block: questionsPerBlock ? Number(questionsPerBlock) : 20,
      block_time_minutes: blockMinutes ? Number(blockMinutes) : 30,
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
        <p className="text-xs text-slate-400">
          {(() => {
            const qpb = Math.max(1, Number(questionsPerBlock) || 20);
            const numBlocks = Math.max(1, Math.ceil(questions.length / qpb));
            const totalMin = numBlocks * (Number(blockMinutes) || 30);
            return `With ${questions.length} question${questions.length === 1 ? "" : "s"} total, this becomes ${numBlocks} block${
              numBlocks === 1 ? "" : "s"
            } (${totalMin} minutes total). Students get a per-block timer plus an overall exam timer, and only see their score after finishing every block.`;
          })()}
        </p>
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

            <textarea
              className="input mb-3"
              rows={3}
              placeholder="Question text"
              value={q.question}
              onChange={(e) => updateQuestion(qIdx, { question: e.target.value })}
            />

            <p className="label mb-2">
              Answer choices - click the circle next to the correct one
            </p>
            <div className="space-y-2 mb-3">
              {q.choices.map((c, cIdx) => (
                <div key={c.id} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${q.id}`}
                    checked={q.correct_choice_id === c.id}
                    onChange={() => updateQuestion(qIdx, { correct_choice_id: c.id })}
                    className="shrink-0 w-4 h-4"
                  />
                  <input
                    className="input flex-1"
                    placeholder={`Choice ${cIdx + 1}`}
                    value={c.text}
                    onChange={(e) => updateChoice(qIdx, cIdx, e.target.value)}
                  />
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
              ))}
            </div>
            <button
              type="button"
              onClick={() => addChoice(qIdx)}
              className="text-sm text-brand-400 hover:text-brand-300 font-medium mb-4"
            >
              + Add another choice
            </button>

            <label className="label">Explanation (shown to the student after they submit)</label>
            <textarea
              className="input"
              rows={2}
              placeholder="Why this is the right answer, optional but helpful"
              value={q.explanation}
              onChange={(e) => updateQuestion(qIdx, { explanation: e.target.value })}
            />
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
