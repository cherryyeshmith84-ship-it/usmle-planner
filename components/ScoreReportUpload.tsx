"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { STEP1_SYSTEMS } from "@/lib/qbankTypes";
import { EXAM_TYPE_LABEL, type ParsedScoreReport, type ScoreReportExamType } from "@/lib/scoreReports";

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = reader.result as string; // "data:image/png;base64,AAAA..."
      const [, base64] = result.split(",");
      resolve({ base64, mimeType: file.type || "image/png" });
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Upload -> AI reads it -> student reviews/edits -> save flow for a score
 * report (NBME/UWSA/Free120/UWorld self-assessment screenshot). The AI
 * parse is only ever a draft - nothing is saved to score_reports until the
 * student confirms the review form, so a misread number can always be
 * fixed before it affects the weakness/strength analysis.
 */
export default function ScoreReportUpload({ userId }: { userId: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<"idle" | "uploading" | "parsing" | "review" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [draft, setDraft] = useState<ParsedScoreReport | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) {
      e.target.value = "";
      return;
    }
    // Snapshot into a plain array BEFORE resetting e.target.value - clearing
    // the input's value empties the live FileList in place (in Chrome at
    // least), so reading it after reset silently yields zero files.
    const files = Array.from(fileList);
    e.target.value = "";

    const bad = files.find((f) => !f.type.startsWith("image/") && f.type !== "application/pdf");
    if (bad) {
      setError("Please choose images (screenshots/photos) or PDFs of your score report.");
      return;
    }
    if (files.length > 6) {
      setError("Please upload at most 6 files at a time.");
      return;
    }

    setError(null);
    setStage("uploading");
    const supabase = createClient();

    const paths: string[] = [];
    for (const file of files) {
      const ext = file.name.split(".").pop() || "png";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("score-reports").upload(path, file, {
        upsert: false,
      });
      if (uploadError) {
        setStage("idle");
        setError(uploadError.message);
        return;
      }
      paths.push(path);
    }
    setImagePaths(paths);

    setStage("parsing");
    try {
      const encoded = await Promise.all(files.map((f) => fileToBase64(f)));
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
        setDraft({
          exam_type: "other",
          exam_name: "",
          taken_date: null,
          overall_score: null,
          overall_percent: null,
          system_breakdown: {},
        });
      } else {
        setDraft(json.result as ParsedScoreReport);
      }
    } catch (e: any) {
      setError(e.message || "Couldn't reach the AI - you can still enter it manually below.");
      setDraft({
        exam_type: "other",
        exam_name: "",
        taken_date: null,
        overall_score: null,
        overall_percent: null,
        system_breakdown: {},
      });
    }
    setStage("review");
  }

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
      image_paths: imagePaths,
    });
    if (insertError) {
      setStage("review");
      setError(insertError.message);
      return;
    }
    setStage("idle");
    setDraft(null);
    setImagePaths([]);
    router.refresh();
  }

  function cancel() {
    setStage("idle");
    setDraft(null);
    setImagePaths([]);
    setError(null);
  }

  if (stage === "idle") {
    return (
      <div className="card">
        <p className="text-sm font-semibold mb-1">Upload a score report</p>
        <p className="text-xs text-slate-400 mb-3">
          Screenshots, photos, or PDFs of an NBME, UWSA, Free 120, UWorld, or any other platform's
          self-assessment result - from any platform. You can select several files at once (e.g. one
          image per table, or a few scrolled screenshots of the same report) and the AI will read and
          combine all of them into one result. You'll get to check everything before it's saved.
        </p>
        <input
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={handleFile}
          className="text-sm text-slate-300"
        />
        <p className="text-xs text-slate-600 mt-1">Up to 6 files per report.</p>
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      </div>
    );
  }

  if (stage === "uploading" || stage === "parsing") {
    return (
      <div className="card">
        <p className="text-sm text-slate-400">
          {stage === "uploading"
            ? `Uploading file${imagePaths.length > 1 ? "s" : ""}...`
            : "Reading your score report with AI..."}
        </p>
      </div>
    );
  }

  if (!draft) return null;

  return (
    <div className="card space-y-4">
      <div>
        <p className="text-sm font-semibold">Check what the AI read</p>
        <p className="text-xs text-slate-400">
          Fix anything that's wrong before saving.
          {imagePaths.length > 1 && ` Combined from ${imagePaths.length} files you uploaded.`}
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
            {(Object.keys(EXAM_TYPE_LABEL) as ScoreReportExamType[]).map((t) => (
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
            <div key={system} className="flex items-center justify-between gap-2 border border-slate-800 rounded-lg px-3 py-1.5">
              <span className="text-xs text-slate-300">{system}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={draft.system_breakdown[system] ?? ""}
                onChange={(e) => updateSystemPct(system, e.target.value)}
                className="input text-xs py-1 px-2 w-16 shrink-0"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
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
