"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ContentBreakdown } from "@/lib/questionLevelReports";

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = reader.result as string;
      const [, base64] = result.split(",");
      resolve({ base64, mimeType: file.type || "application/pdf" });
    };
    reader.readAsDataURL(file);
  });
}

interface ParsedQuestionLevel {
  exam_name: string;
  taken_date: string | null;
  overall_score: number | null;
  itemCount: number;
  systemBreakdown: Record<string, number>;
  contentBreakdown: ContentBreakdown;
}

/**
 * Upload -> AI reads every row -> student reviews the summary -> save flow
 * for a "question-level feedback report" (e.g. an NBME CBSE/CCSE PDF listing
 * one row per question, not just one per-system percent table like the
 * regular ScoreReportUpload handles). There's no per-row edit form here on
 * purpose - a report can have 100-250+ rows, so instead the student reviews
 * the computed summary (overall score, weakest/strongest specific topics)
 * before saving; individual rows aren't hand-editable, but the whole upload
 * can be cancelled and retried if something looks off.
 */
export default function QuestionLevelReportUpload({ userId }: { userId: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<"idle" | "uploading" | "parsing" | "review" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [draft, setDraft] = useState<ParsedQuestionLevel | null>(null);
  const [examName, setExamName] = useState("");
  const [takenDate, setTakenDate] = useState("");
  const [overallScore, setOverallScore] = useState<string>("");

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
      setError("Please choose a PDF (or clear photos/screenshots) of your question-level report.");
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
      const ext = file.name.split(".").pop() || "pdf";
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
      const res = await fetch("/api/score-report/parse-question-level", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: encoded.map(({ base64, mimeType }) => ({ base64, mimeType })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Couldn't read that file - try a clearer scan.");
        setStage("idle");
        return;
      }
      const parsed = json as ParsedQuestionLevel;
      setDraft(parsed);
      setExamName(parsed.exam_name || "Question-Level Report");
      setTakenDate(parsed.taken_date || "");
      setOverallScore(parsed.overall_score !== null ? String(parsed.overall_score) : "");
      setStage("review");
    } catch (e: any) {
      setError(e.message || "Couldn't reach the AI - try again.");
      setStage("idle");
    }
  }

  async function save() {
    if (!draft) return;
    setStage("saving");
    setError(null);
    const supabase = createClient();
    const overallNum = overallScore.trim() === "" ? null : Number(overallScore);
    const { error: insertError } = await supabase.from("score_reports").insert({
      user_id: userId,
      exam_type: "question_level",
      exam_name: examName.trim() || "Question-Level Report",
      taken_date: takenDate || null,
      overall_score: overallNum,
      overall_percent: overallNum,
      system_breakdown: draft.systemBreakdown,
      content_breakdown: draft.contentBreakdown,
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
        <p className="text-sm font-semibold mb-1">Upload a question-level report</p>
        <p className="text-xs text-slate-400 mb-3">
          A per-question feedback PDF (e.g. an NBME CBSE/CCSE "Examinee Question-Level Feedback
          Report") - not just an overall percent table. The AI reads every question's topic and
          correct/incorrect, works out exactly which specific topics you're strong or weak on, and (if
          you've uploaded one of these before) compares this one against your last upload topic by
          topic to show what's improved or declined.
        </p>
        <input
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={handleFile}
          className="text-sm text-slate-300"
        />
        <p className="text-xs text-slate-600 mt-1">Usually a single PDF export from the exam platform.</p>
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      </div>
    );
  }

  if (stage === "uploading" || stage === "parsing") {
    return (
      <div className="card">
        <p className="text-sm text-slate-400">
          {stage === "uploading" ? "Uploading..." : "Reading every question in your report with AI - this can take a bit longer than a regular score report..."}
        </p>
      </div>
    );
  }

  if (!draft) return null;

  const weakest = Object.entries(draft.contentBreakdown)
    .sort((a, b) => a[1].percent - b[1].percent)
    .slice(0, 8);
  const strongest = Object.entries(draft.contentBreakdown)
    .sort((a, b) => b[1].percent - a[1].percent)
    .slice(0, 5);

  return (
    <div className="card space-y-4">
      <div>
        <p className="text-sm font-semibold">Check what the AI read</p>
        <p className="text-xs text-slate-400">
          Read {draft.itemCount} question{draft.itemCount === 1 ? "" : "s"} across{" "}
          {Object.keys(draft.systemBreakdown).length} system{Object.keys(draft.systemBreakdown).length === 1 ? "" : "s"}.
          Fix the details below if anything's off, then save.
        </p>
        {error && <p className="text-xs text-amber-400 mt-1">{error}</p>}
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="label">Exam name</label>
          <input
            type="text"
            className="input"
            value={examName}
            onChange={(e) => setExamName(e.target.value)}
            placeholder="e.g. CBSE"
          />
        </div>
        <div>
          <label className="label">Date taken</label>
          <input type="date" className="input" value={takenDate} onChange={(e) => setTakenDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Overall % correct</label>
          <input
            type="number"
            className="input"
            min={0}
            max={100}
            value={overallScore}
            onChange={(e) => setOverallScore(e.target.value)}
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Weakest specific topics</p>
          <div className="space-y-1.5">
            {weakest.map(([key, stat]) => (
              <div key={key} className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400 truncate" title={key}>
                  {stat.subtopic}
                </span>
                <span className="text-xs font-semibold text-slate-300 shrink-0">
                  {stat.correct}/{stat.total}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Strongest specific topics</p>
          <div className="space-y-1.5">
            {strongest.map(([key, stat]) => (
              <div key={key} className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400 truncate" title={key}>
                  {stat.subtopic}
                </span>
                <span className="text-xs font-semibold text-slate-300 shrink-0">
                  {stat.correct}/{stat.total}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={stage === "saving"} className="btn-primary text-sm">
          {stage === "saving" ? "Saving..." : "Save question-level report"}
        </button>
        <button type="button" onClick={cancel} disabled={stage === "saving"} className="btn-secondary text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}
