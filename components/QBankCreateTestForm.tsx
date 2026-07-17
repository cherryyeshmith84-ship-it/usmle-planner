"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { filterPool, shuffle, type StatusCounts } from "@/lib/qbank";
import { STEP1_SUBJECTS, STEP1_SYSTEMS, type QBankQuestion, type QuestionStatus } from "@/lib/qbankTypes";

const STATUS_OPTIONS: { key: string; label: string }[] = [
  { key: "unused", label: "Unused" },
  { key: "incorrect", label: "Incorrect" },
  { key: "marked", label: "Marked" },
  { key: "omitted", label: "Omitted" },
  { key: "correct", label: "Correct" },
];

export default function QBankCreateTestForm({
  questions,
  statuses,
  marked,
  statusCounts,
  subjectCounts,
  systemCounts,
  userId,
}: {
  questions: QBankQuestion[];
  statuses: Record<string, QuestionStatus>;
  marked: Record<string, boolean>;
  statusCounts: StatusCounts;
  subjectCounts: Record<string, number>;
  systemCounts: Record<string, number>;
  userId: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"test" | "tutor">("test");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(["unused"]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedSystems, setSelectedSystems] = useState<string[]>([]);
  const [numQuestions, setNumQuestions] = useState("40");
  const [questionsPerBlock, setQuestionsPerBlock] = useState("40");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matching = useMemo(
    () =>
      filterPool({
        questions,
        statuses,
        marked,
        statusFilter: selectedStatuses,
        subjects: selectedSubjects,
        systems: selectedSystems,
      }),
    [questions, statuses, marked, selectedStatuses, selectedSubjects, selectedSystems]
  );

  function toggle(list: string[], setList: (v: string[]) => void, key: string) {
    setList(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  }

  async function handleGenerate() {
    setError(null);
    const count = Math.max(1, Number(numQuestions) || 0);
    if (matching.length === 0) {
      setError("No questions match those filters - try widening your selection.");
      return;
    }
    const perBlock = Math.max(1, Number(questionsPerBlock) || count);
    const picked = shuffle(matching).slice(0, Math.min(count, matching.length));

    setGenerating(true);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("qbank_test_sessions")
      .insert({
        user_id: userId,
        mode,
        question_ids: picked.map((q) => q.id),
        questions_per_block: perBlock,
        subjects: selectedSubjects,
        systems: selectedSystems,
        status_filter: selectedStatuses,
      })
      .select()
      .single();
    setGenerating(false);

    if (insertError || !data) {
      setError(insertError?.message ?? "Couldn't create the test - try again.");
      return;
    }
    router.push(`/qbank/take/${data.id}`);
  }

  return (
    <>
      {/* pb-28 leaves room so the sticky bottom bar never covers the last card */}
      <div className="space-y-4 pb-28">
        <div className="card">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h2 className="font-semibold">Mode</h2>
            <p className="text-sm text-slate-400">
              <span className="text-slate-200 font-semibold">{matching.length}</span> question
              {matching.length === 1 ? "" : "s"} match your filters
            </p>
          </div>
          <div className="flex items-center border border-slate-700 rounded-lg overflow-hidden w-fit text-sm font-semibold">
            <button
              type="button"
              onClick={() => setMode("test")}
              className={`px-4 py-2 ${mode === "test" ? "bg-brand-900/50 text-brand-200" : "text-slate-400 hover:text-slate-200"}`}
            >
              Timed (Test)
            </button>
            <button
              type="button"
              onClick={() => setMode("tutor")}
              className={`px-4 py-2 border-l border-slate-700 ${mode === "tutor" ? "bg-brand-900/50 text-brand-200" : "text-slate-400 hover:text-slate-200"}`}
            >
              Tutor
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Tutor mode shows the answer and explanation right after each question, with the clock
            paused while you read it. Timed mode holds all feedback until the block ends. You can
            switch between the two mid-test too.
          </p>

          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-4 mb-2">
            Question status
          </p>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <label
                key={opt.key}
                className={`flex items-center gap-2 text-sm border rounded-lg px-3 py-2 cursor-pointer ${
                  selectedStatuses.includes(opt.key)
                    ? "border-brand-400 bg-brand-900/20 text-brand-200"
                    : "border-slate-700 text-slate-300"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedStatuses.includes(opt.key)}
                  onChange={() => toggle(selectedStatuses, setSelectedStatuses, opt.key)}
                  className="w-4 h-4"
                />
                {opt.label}{" "}
                <span className="text-slate-500">
                  ({statusCounts[opt.key as keyof StatusCounts] ?? 0})
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <h2 className="font-semibold mb-3">Subjects</h2>
              <div className="space-y-2">
                {STEP1_SUBJECTS.filter((s) => (subjectCounts[s] ?? 0) > 0).map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={selectedSubjects.includes(s)}
                      onChange={() => toggle(selectedSubjects, setSelectedSubjects, s)}
                      className="w-4 h-4"
                    />
                    {s} <span className="text-slate-500">({subjectCounts[s]})</span>
                  </label>
                ))}
                {STEP1_SUBJECTS.every((s) => (subjectCounts[s] ?? 0) === 0) && (
                  <p className="text-sm text-slate-500">No tagged questions yet.</p>
                )}
              </div>
            </div>

            <div className="sm:border-l sm:border-slate-800 sm:pl-6">
              <h2 className="font-semibold mb-3">Systems</h2>
              <div className="space-y-2">
                {STEP1_SYSTEMS.filter((s) => (systemCounts[s] ?? 0) > 0).map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={selectedSystems.includes(s)}
                      onChange={() => toggle(selectedSystems, setSelectedSystems, s)}
                      className="w-4 h-4"
                    />
                    {s} <span className="text-slate-500">({systemCounts[s]})</span>
                  </label>
                ))}
                {STEP1_SYSTEMS.every((s) => (systemCounts[s] ?? 0) === 0) && (
                  <p className="text-sm text-slate-500">No tagged questions yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {/* Sticky bottom action bar - stays visible while scrolling through filters above */}
      <div className="sticky bottom-0 z-10 -mx-6 px-6 py-4 bg-black/90 backdrop-blur border-t border-slate-800">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div className="flex items-end gap-4 flex-wrap">
            <div>
              <label className="label">Number of questions</label>
              <input
                type="number"
                min={1}
                max={Math.max(1, matching.length)}
                className="input w-28"
                value={numQuestions}
                onChange={(e) => setNumQuestions(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Per block</label>
              <input
                type="number"
                min={1}
                max={100}
                className="input w-24"
                value={questionsPerBlock}
                onChange={(e) => setQuestionsPerBlock(e.target.value)}
              />
            </div>
            <p className="text-sm text-slate-400 pb-2.5">
              {matching.length} match your filters
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || matching.length === 0}
            className="btn-primary"
          >
            {generating ? "Generating..." : "Generate test"}
          </button>
        </div>
      </div>
    </>
  );
}
