"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { STEP1_SUBJECTS, STEP1_SYSTEMS } from "@/lib/qbankTypes";
import { EXAM_TYPE_LABEL, type ParsedScoreReport, type ScoreReportExamType } from "@/lib/scoreReports";

// Cosmetic checklist shown while the AI reads a report (one real network call
// behind it: POST /api/score-report/parse).
const PROCESSING_STEPS = ["Overall score extracted", "Systems analyzed", "Disciplines analyzed", "Trends updated"];

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = reader.result as string;
      const [, base64] = result.split(",");
      resolve({ base64, mimeType: file.type || "image/png" });
    };
    reader.readAsDataURL(file);
  });
}

const EMPTY_DRAFT: ParsedScoreReport = {
  exam_type: "other",
  exam_name: "",
  taken_date: null,
  overall_score: null,
  overall_percent: null,
  system_breakdown: {},
  discipline_breakdown: {},
};

/**
 * Admin version of the score-report flow: upload (screenshots/PDFs) -> AI
 * reads it -> review/edit -> save, or enter manually. Saves for `userId`
 * (the student the admin selected). The student-facing ScoreReportUpload
 * stays manual-only.
 */
export default function AdminScoreReportUpload({ userId }: { userId: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<"idle" | "choosingMode" | "uploading" | "parsing" | "review" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [draft, setDraft] = useState<ParsedScoreReport | null>(null);

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<"same" | "separate" | null>(null);
  const [queue, setQueue] = useState<File[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queuePosition, setQueuePosition] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [checklistStep, setChecklistStep] = useState(0);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) {
      e.target.value = "";
      return;
    }
    const files = Array.from(fileList);
    e.target.value = "";

    const bad = files.find((f) => !f.type.startsWith("image/") && f.type !== "application/pdf");
    if (bad) {
      setError("Please choose images (screenshots/photos) or PDFs of the score report.");
      return;
    }
    if (files.length > 6) {
      setError("Please upload at most 6 files at a time.");
      return;
    }

    setError(null);
    setDoneMsg(null);

    if (files.length === 1) {
      void startBatch(files, "same");
    } else {
      setPendingFiles(files);
      setStage("choosingMode");
    }
  }

  async function startBatch(files: File[], chosenMode: "same" | "separate") {
    setMode(chosenMode);
    setSavedCount(0);
    if (chosenMode === "same") {
      setQueueTotal(1);
      setQueuePosition(1);
      setQueue([]);
      await processOne(files);
    } else {
      setQueueTotal(files.length);
      setQueuePosition(1);
      const [first, ...rest] = files;
      setQueue(rest);
      await processOne([first]);
    }
  }

  async function processOne(filesForThisReport: File[]) {
    setStage("uploading");
    const supabase = createClient();

    const paths: string[] = [];
    for (const file of filesForThisReport) {
      const ext = file.name.split(".").pop() || "png";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("score-reports").upload(path, file, {
        upsert: false,
      });
      if (uploadError) {
        setStage("idle");
        setError(uploadError.message);
        setMode(null);
        setQueue([]);
        setQueueTotal(0);
        setQueuePosition(0);
        return;
      }
      paths.push(path);
    }
    setImagePaths(paths);

    setStage("parsing");
    setError(null);
    setChecklistStep(0);
    const stepTimer = setInterval(() => {
      setChecklistStep((s) => (s < PROCESSING_STEPS.length - 1 ? s + 1 : s));
    }, 550);
    try {
      const encoded = await Promise.all(filesForThisReport.map((f) => fileToBase64(f)));
      const res = await fetch("/api/score-report/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: encoded.map(({ base64, mimeType }) => ({ base64, mimeType })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Couldn't read those files - you can still enter it manually below.");
        setDraft({ ...EMPTY_DRAFT });
      } else {
        setDraft(json.result as ParsedScoreReport);
        if (json.warning) setError(json.warning);
      }
    } catch (e: any) {
      setError(e.message || "Couldn't reach the AI - you can still enter it manually below.");
      setDraft({ ...EMPTY_DRAFT });
    }
    clearInterval(stepTimer);
    setChecklistStep(PROCESSING_STEPS.length);
    await new Promise((resolve) => setTimeout(resolve, 450));
    setStage("review");
  }

  function updateDraft(patch: Partial<ParsedScoreReport>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function updateSystemPct(system: string, value: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = { ...prev.system_breakdown };
      if (value === "") delete next[system];
      else next[system] = Math.max(0, Math.min(100, Number(value)));
      return { ...prev, system_breakdown: next };
    });
  }

  function updateDisciplinePct(discipline: string, value: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = { ...(prev.discipline_breakdown ?? {}) };
      if (value === "") delete next[discipline];
      else next[discipline] = Math.max(0, Math.min(100, Number(value)));
      return { ...prev, discipline_breakdown: next };
    });
  }

  async function advanceOrFinish(nextSavedCount: number) {
    if (mode === "separate" && queue.length > 0) {
      const [next, ...rest] = queue;
      setQueue(rest);
      setQueuePosition((p) => p + 1);
      setSavedCount(nextSavedCount);
      await processOne([next]);
    } else {
      setStage("idle");
      setDoneMsg(
        nextSavedCount > 0
          ? `Saved ${nextSavedCount} score report${nextSavedCount === 1 ? "" : "s"}.`
          : null
      );
      setSavedCount(0);
      setMode(null);
      setQueue([]);
      setQueueTotal(0);
      setQueuePosition(0);
      setPendingFiles([]);
      router.refresh();
    }
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
      image_paths: imagePaths,
    });
    if (insertError) {
      setStage("review");
      setError(insertError.message);
      return;
    }
    setDraft(null);
    setImagePaths([]);
    await advanceOrFinish(savedCount + 1);
  }

  async function skipCurrent() {
    setDraft(null);
    setImagePaths([]);
    setError(null);
    await advanceOrFinish(savedCount);
  }

  function startManual() {
    setError(null);
    setDoneMsg(null);
    setMode(null);
    setImagePaths([]);
    setDraft({ ...EMPTY_DRAFT });
    setStage("review");
  }

  function cancel() {
    setStage("idle");
    setDraft(null);
    setImagePaths([]);
    setError(null);
    setMode(null);
    setQueue([]);
    setQueueTotal(0);
    setQueuePosition(0);
    setSavedCount(0);
    setPendingFiles([]);
    router.refresh();
  }

  if (stage === "idle") {
    return (
      <div className="card">
        <p className="text-sm font-semibold mb-1">Upload a score report</p>
        <p className="text-xs text-slate-400 mb-3">
          Screenshots, photos, or PDFs of an NBME, UWSA, Free 120, UWorld, or any other platform&apos;s
          self-assessment result. Select several files at once if there is more than one - you&apos;ll
          be asked whether they&apos;re pages of the same report or separate reports.
        </p>
        <input
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={handleFile}
          className="text-sm text-slate-300"
        />
        <p className="text-xs text-slate-600 mt-1">Up to 6 files per report.</p>
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800">
          <span className="text-xs text-slate-500">No screenshot?</span>
          <button
            type="button"
            onClick={startManual}
            className="text-xs font-semibold text-brand-400 hover:text-brand-300"
          >
            Enter a score manually
          </button>
        </div>
        {doneMsg && <p className="text-xs text-green-400 mt-2">{doneMsg}</p>}
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      </div>
    );
  }

  if (stage === "choosingMode") {
    return (
      <div className="card space-y-3">
        <p className="text-sm font-semibold">You selected {pendingFiles.length} files</p>
        <p className="text-xs text-slate-400">
          Are these all pieces of the SAME score report, or {pendingFiles.length} separate score reports?
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="btn-primary text-sm text-left"
            onClick={() => startBatch(pendingFiles, "separate")}
          >
            {pendingFiles.length} separate reports - read and save each one on its own
          </button>
          <button
            type="button"
            className="btn-secondary text-sm text-left"
            onClick={() => startBatch(pendingFiles, "same")}
          >
            One report - combine all {pendingFiles.length} files into a single result
          </button>
        </div>
        <button type="button" className="text-xs text-slate-500 hover:text-slate-400" onClick={cancel}>
          Cancel
        </button>
      </div>
    );
  }

  if (stage === "uploading" || stage === "parsing") {
    const progressLabel =
      mode === "separate" && queueTotal > 1 ? ` (report ${queuePosition} of ${queueTotal})` : "";
    return (
      <div className="card">
        <p className="text-sm font-semibold text-slate-300 mb-3">
          {stage === "uploading" ? "Uploading..." : "Reading report..."}
          {progressLabel}
        </p>
        {stage === "parsing" && (
          <div className="space-y-1.5">
            {PROCESSING_STEPS.map((label, i) => {
              const state = checklistStep > i ? "done" : checklistStep === i ? "active" : "pending";
              return (
                <p
                  key={label}
                  className={`text-xs flex items-center gap-2 ${
                    state === "done" ? "text-green-400" : state === "active" ? "text-slate-300" : "text-slate-600"
                  }`}
                >
                  <span className="w-3.5 shrink-0">{state === "done" ? "✓" : state === "active" ? "…" : ""}</span>
                  {label}
                </p>
              );
            })}
            <p
              className={`text-xs flex items-center gap-2 ${
                checklistStep >= PROCESSING_STEPS.length ? "text-green-400 font-semibold" : "text-slate-600"
              }`}
            >
              <span className="w-3.5 shrink-0">{checklistStep >= PROCESSING_STEPS.length ? "✓" : ""}</span>
              Ready
            </p>
          </div>
        )}
      </div>
    );
  }

  if (!draft) return null;

  const isManual = mode === null;

  return (
    <div className="card space-y-4">
      <div>
        <p className="text-sm font-semibold">
          {isManual
            ? "Enter the score"
            : `Check what the AI read${mode === "separate" && queueTotal > 1 ? ` - report ${queuePosition} of ${queueTotal}` : ""}`}
        </p>
        <p className="text-xs text-slate-400">
          {isManual
            ? "Percent and date are the only fields you really need - everything else is optional."
            : "Fix anything that's wrong before saving."}
          {mode === "same" && imagePaths.length > 1 && ` Combined from ${imagePaths.length} files.`}
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
          Anatomy, Pathology, Pharmacology, etc. Leave a box blank if the report didn&apos;t break
          performance down this way.
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
          {stage === "saving"
            ? "Saving..."
            : mode === "separate" && queue.length > 0
              ? "Save & continue to next"
              : "Save score report"}
        </button>
        {mode === "separate" && (
          <button type="button" onClick={skipCurrent} disabled={stage === "saving"} className="btn-secondary text-sm">
            Skip this one
          </button>
        )}
        <button type="button" onClick={cancel} disabled={stage === "saving"} className="btn-secondary text-sm">
          {mode === "separate" && queueTotal > 1 ? "Cancel remaining" : "Cancel"}
        </button>
      </div>
    </div>
  );
}
