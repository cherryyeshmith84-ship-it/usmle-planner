"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { STEP1_SUBJECTS, STEP1_SYSTEMS } from "@/lib/qbankTypes";
import { EXAM_TYPE_LABEL, type ParsedScoreReport, type ScoreReportExamType } from "@/lib/scoreReports";

/**
 * Add-a-score-report flow for a regular NBME/UWSA/Free120/UWorld
 * self-assessment result. Used to also offer an AI-read-a-screenshot path
 * (file upload -> AI parse -> review/edit -> save) alongside this manual
 * one - that upload path has been removed entirely per explicit request,
 * leaving only manual entry: click "Enter a score manually", fill in the
 * fields (only percent and date really matter, everything else is
 * optional), save. No file, no AI call, no image_paths stored.
 */
export default function ScoreReportUpload({ userId }: { userId: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<"idle" | "review" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<ParsedScoreReport | null>(null);

  function updateDraft(patch: Partial<ParsedScoreReport>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function updateSystemPct(system: string, value: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = { ...prev.system_breakdown };
      if (value === "") {
        delete next[system];
      } else {
        next[system] = Math.max(0, Math.min(100, Number(value)));
      }
      return { ...prev, system_breakdown: next };
    });
  }

  function updateDisciplinePct(discipline: string, value: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = { ...(prev.discipline_breakdown ?? {}) };
      if (value === "") {
        delete next[discipline];
      } else {
        next[discipline] = Math.max(0, Math.min(100, Number(value)));
      }
      return { ...prev, discipline_breakdown: next };
    });
  }

  function startManual() {
    setError(null);
    setDoneMsg(null);
    setDraft({
      exam_type: "other",
      exam_name: "",
      taken_date: null,
      overall_score: null,
      overall_percent: null,
      system_breakdown: {},
      discipline_breakdown: {},
    });
    setStage("review");
  }

  async function save() {
    if (!draft) return;
    setStage("saving");
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("score_reports").insert({
      user_id: userId,
      exam_type: draft.exam_type,
      exam_name: draft.exam_name || "Score report",
      taken_date: draft.taken_date,
      overall_score: draft.overall_score,
      overall_percent: draft.overall_percent,
      system_breakdown: draft.system_breakdown,
      discipline_breakdown: draft.discipline_breakdown ?? {},
      image_paths: [],
    });
    if (insertError) {
      setStage("review");
      setError(insertError.message);
      return;
    }
    setDraft(null);
    setStage("idle");
    setDoneMsg("Saved score report.");
    router.refresh();
  }

  function cancel() {
    setStage("idle");
    setDraft(null);
    setError(null);
  }

  if (stage === "idle") {
    return (
      <div className="card">
        <p className="text-sm font-semibold mb-1">Add a score report</p>
        <p className="text-xs text-slate-400 mb-3">
          Enter your NBME, UWSA, Free 120, UWorld, or any other platform's self-assessment result by
          hand to track your weak and strong systems over time.
        </p>
        <button type="button" onClick={startManual} className="btn-primary text-sm">
          Enter a score manually
        </button>
        {doneMsg && <p className="text-xs text-green-400 mt-2">{doneMsg}</p>}
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      </div>
    );
  }

  if (!draft) return null;

  return (
    <div className="card space-y-4">
      <div>
        <p className="text-sm font-semibold">Enter your score</p>
        <p className="text-xs text-slate-400">
          Percent and date are the only fields you really need - everything else is optional.
        </p>
        {error && <p className="text-xs text-amber-400 mt-1">{error}</p>}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Exam type</label>
          <select
            value={draft.exam_type}
            onChange={(e) => updateDraft({ exam_type: e.target.value as ScoreReportExamType })}
            className="input"
          >
            {(Object.keys(EXAM_TYPE_LABEL) as ScoreReportExamType[])
              // "question_level" is a separate kind of upload with its own
              // per-question content_breakdown this form doesn't compute,
              // so it's left out of this dropdown to avoid confusion.
              .filter((t) => t !== "question_level")
              .map((t) => (
                <option key={t} value={t}>
                  {EXAM_TYPE_LABEL[t]}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="label">Exam name</label>
          <input
            type="text"
            value={draft.exam_name}
            onChange={(e) => updateDraft({ exam_name: e.target.value })}
            className="input"
            placeholder="e.g. NBME Form 28"
          />
        </div>
        <div>
          <label className="label">Date taken</label>
          <input
            type="date"
            value={draft.taken_date ?? ""}
            onChange={(e) => updateDraft({ taken_date: e.target.value || null })}
            className="input"
          />
        </div>
        <div>
          <label className="label">Overall % correct</label>
          <input
            type="number"
            value={draft.overall_percent ?? ""}
            onChange={(e) =>
              updateDraft({ overall_percent: e.target.value === "" ? null : Number(e.target.value) })
            }
            className="input"
            min={0}
            max={100}
          />
        </div>
        <div>
          <label className="label">Overall score (raw, if shown)</label>
          <input
            type="number"
            value={draft.overall_score ?? ""}
            onChange={(e) =>
              updateDraft({ overall_score: e.target.value === "" ? null : Number(e.target.value) })
            }
            className="input"
          />
        </div>
      </div>

      <div>
        <p className="label mb-2">System breakdown (% correct)</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {STEP1_SYSTEMS.map((system) => (
            <div key={system} className="flex items-start justify-between gap-2 border border-slate-800 rounded-lg px-3 py-1.5">
              <span className="text-xs text-slate-300 flex-1 min-w-0 pt-1.5">{system}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={draft.system_breakdown[system] ?? ""}
                onChange={(e) => updateSystemPct(system, e.target.value)}
                className="input text-xs !py-1 !px-2 !w-20 shrink-0"
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="label mb-1">Discipline breakdown (% correct)</p>
        <p className="text-xs text-slate-500 mb-2">
          The other axis these reports usually show alongside System - Anatomy, Pathology,
          Pharmacology, etc. Leave a box blank if you don't have this breakdown.
        </p>
        <div className="grid sm:grid-cols-2 gap-2">
          {STEP1_SUBJECTS.map((discipline) => (
            <div
              key={discipline}
              className="flex items-start justify-between gap-2 border border-slate-800 rounded-lg px-3 py-1.5"
            >
              <span className="text-xs text-slate-300 flex-1 min-w-0 pt-1.5">{discipline}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={draft.discipline_breakdown?.[discipline] ?? ""}
                onChange={(e) => updateDisciplinePct(discipline, e.target.value)}
                className="input text-xs !py-1 !px-2 !w-20 shrink-0"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={save} disabled={stage === "saving"} className="btn-primary text-sm">
          {stage === "saving" ? "Saving..." : "Save score report"}
        </button>
        <button type="button" onClick={cancel} disabled={stage === "saving"} className="btn-secondary text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}
