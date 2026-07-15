"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { parsePastedQuestion } from "@/lib/assessments";
import { blankQBankChoice, blankQBankQuestion, choiceStatsToPercents, type ChoiceStatRow } from "@/lib/qbank";
import { STEP1_SUBJECTS, STEP1_SYSTEMS, type QBankQuestion } from "@/lib/qbankTypes";
import ImageUploadField from "./ImageUploadField";

interface StudentAnswerRow {
  userId: string;
  name: string;
  choiceId: string | undefined;
  submittedAt: string | null;
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
  const [bulkText, setBulkText] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  function updateChoiceDistance(idx: number, distance: "near" | "far") {
    setChoices((prev) => prev.map((c, i) => (i === idx ? { ...c, distance } : c)));
  }

  function updateChoiceImage(idx: number, url: string | null) {
    setChoices((prev) => prev.map((c, i) => (i === idx ? { ...c, image_url: url } : c)));
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
      question_image_url: questionImageUrl,
      choices: cleanChoices,
      correct_choice_id: correctChoiceId,
      explanation: explanation.trim(),
      explanation_image_url: explanationImageUrl,
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
                <div className="mt-2 pl-6">
                  <ImageUploadField
                    label={`Image for choice ${idx + 1} (optional - e.g. an EKG/image the option itself refers to)`}
                    value={c.image_url}
                    onChange={(url) => updateChoiceImage(idx, url)}
                  />
                </div>
              </div>
            );
          })}
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

        <ImageUploadField
          label="Explanation image (optional)"
          value={explanationImageUrl}
          onChange={setExplanationImageUrl}
        />
      </div>

      {initial && (
        <div className="card">
          <h2 className="font-semibold mb-1">Student answers so far</h2>
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
