"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { parsePastedQuestion } from "@/lib/assessments";
import { blankQBankChoice, blankQBankQuestion } from "@/lib/qbank";
import { STEP1_SUBJECTS, STEP1_SYSTEMS, type QBankQuestion } from "@/lib/qbankTypes";

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
  const [choices, setChoices] = useState(initial?.choices ?? blank.choices);
  const [correctChoiceId, setCorrectChoiceId] = useState(initial?.correct_choice_id ?? "");
  const [explanation, setExplanation] = useState(initial?.explanation ?? "");
  const [subjects, setSubjects] = useState<string[]>(initial?.subjects ?? []);
  const [systems, setSystems] = useState<string[]>(initial?.systems ?? []);
  const [bulkText, setBulkText] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTag(list: string[], setList: (v: string[]) => void, tag: string) {
    setList(list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]);
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
    setQuestion(parsed.question);
    setChoices(parsed.choices.map((text) => ({ ...blankQBankChoice(), text })));
    setCorrectChoiceId("");
    setBulkText("");
  }

  function updateChoice(idx: number, text: string) {
    setChoices((prev) => prev.map((c, i) => (i === idx ? { ...c, text } : c)));
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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const cleanChoices = choices.map((c) => ({ ...c, text: c.text.trim() })).filter((c) => c.text.length > 0);
    if (!question.trim()) {
      setError("Add the question text.");
      return;
    }
    if (cleanChoices.length < 2) {
      setError("Add at least 2 answer choices.");
      return;
    }
    if (!cleanChoices.some((c) => c.id === correctChoiceId)) {
      setError("Mark which choice is correct (the radio button next to a choice).");
      return;
    }
    if (subjects.length === 0 && systems.length === 0) {
      setError("Tag this question with at least one subject or system.");
      return;
    }

    setSaving(true);
    setError(null);
    const supabase = createClient();
    const payload = {
      question: question.trim(),
      choices: cleanChoices,
      correct_choice_id: correctChoiceId,
      explanation: explanation.trim(),
      subjects,
      systems,
    };

    const { error } = initial
      ? await supabase.from("qbank_questions").update(payload).eq("id", initial.id)
      : await supabase.from("qbank_questions").insert({ ...payload, created_by: userId });

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
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

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="card">
        <h2 className="font-semibold mb-2">Paste a question</h2>
        <p className="text-xs text-slate-400 mb-3">
          Paste a full question with its lettered/numbered answer choices - it&apos;ll split the
          stem and options into the fields below automatically.
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

        <p className="label mb-2">
          Answer choices - click the circle next to the correct one.
        </p>
        <div className="space-y-2 mb-3">
          {choices.map((c, idx) => (
            <div key={c.id} className="flex items-center gap-2">
              <input
                type="radio"
                name="correct-choice"
                checked={correctChoiceId === c.id}
                onChange={() => setCorrectChoiceId(c.id)}
                className="shrink-0 w-4 h-4"
              />
              <input
                className="input flex-1"
                placeholder={`Choice ${idx + 1}`}
                value={c.text}
                onChange={(e) => updateChoice(idx, e.target.value)}
              />
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
          ))}
        </div>
        <button type="button" onClick={addChoice} className="text-sm text-brand-400 hover:text-brand-300 font-medium mb-4">
          + Add another choice
        </button>

        <label className="label">Explanation (shown after the student submits)</label>
        <textarea
          className="input"
          rows={3}
          placeholder="Why this is the right answer"
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
        />
      </div>

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

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={saving}>
          {saving ? "Saving..." : initial ? "Save changes" : "Add question to pool"}
        </button>
        {initial && (
          <button type="button" onClick={handleDelete} className="btn-secondary text-red-400" disabled={saving}>
            Delete question
          </button>
        )}
      </div>
    </form>
  );
}
