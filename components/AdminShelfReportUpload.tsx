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

interface Section {
  group: string;
  name: string;
  epc: number | null;
  comparison: number | null;
  pct_questions: string | null;
}

interface ParsedShelf {
  subject: string | null;
  exam_name: string;
  taken_date: string | null;
  total_epc: number | null;
  comparison_mean: number | null;
  sections: Section[];
  itemCount: number;
  systemBreakdown: Record<string, number>;
  contentBreakdown: ContentBreakdown;
}

/**
 * Admin-only: upload the NBME shelf (Subject Exam) PDFs for one exam of one
 * student - the Performance Report, the Question-Level Feedback report, or
 * both - for ANY subject (Medicine, Psychiatry, Surgery, Pediatrics, OB/GYN,
 * Family Medicine, Neurology, Emergency Medicine...). The AI reads them, the
 * admin checks the summary, and it is saved to that student's score reports,
 * so it shows up on their Analysis page and their mentor's view.
 */
export default function AdminShelfReportUpload({ userId }: { userId: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<"idle" | "uploading" | "parsing" | "review" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [draft, setDraft] = useState<ParsedShelf | null>(null);
  const [examName, setExamName] = useState("");
  const [takenDate, setTakenDate] = useState("");
  const [overall, setOverall] = useState("");

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) {
      e.target.value = "";
      return;
    }
    const files = Array.from(fileList);
    e.target.value = "";

    if (files.some((f) => f.type !== "application/pdf")) {
      setError("Please choose PDF files (the shelf exam Performance Report and/or Question-Level Feedback).");
      return;
    }
    if (files.length > 4) {
      setError("Please choose at most 4 files, all from the same exam.");
      return;
    }
    if (files.reduce((n, f) => n + f.size, 0) > 3_000_000) {
      setError("These files are too large (limit about 3 MB in total).");
      return;
    }

    setError(null);
    setDoneMsg(null);
    setStage("uploading");
    const supabase = createClient();

    const paths: string[] = [];
    for (const file of files) {
      const path = `${userId}/${crypto.randomUUID()}.pdf`;
      const { error: uploadError } = await supabase.storage.from("score-reports").upload(path, file, { upsert: false });
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
      const res = await fetch("/api/score-report/parse-shelf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: encoded }),
      });
      const raw = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(raw);
      } catch {
        json = null;
      }
      if (!json) {
        setError(`The server returned an unexpected response (${res.status}). Please try again in a minute.`);
        setStage("idle");
        return;
      }
      if (!res.ok) {
        setError(json.error || "Couldn't read those files.");
        setStage("idle");
        return;
      }
      const parsed = json as ParsedShelf;
      setDraft(parsed);
      setExamName(parsed.exam_name);
      setTakenDate(parsed.taken_date || "");
      setOverall(parsed.total_epc !== null ? String(parsed.total_epc) : "");
      setStage("review");
    } catch (err: any) {
      setError(err?.message || "Couldn't reach the AI - try again.");
      setStage("idle");
    }
  }

  async function save() {
    if (!draft) return;
    setStage("saving");
    setError(null);
    const supabase = createClient();
    const overallNum = overall.trim() === "" ? null : Number(overall);
    const hasQuestions = draft.itemCount > 0;
    const { error: insertError } = await supabase.from("score_reports").insert({
      user_id: userId,
      // With the question-level PDF it is saved like any question-level report
      // (per-topic breakdown); with the performance report alone it is a plain
      // report.
      exam_type: hasQuestions ? "question_level" : "other",
      exam_name: examName.trim() || draft.exam_name,
      taken_date: takenDate || null,
      overall_score: overallNum,
      overall_percent: overallNum,
      system_breakdown: draft.systemBreakdown,
      content_breakdown: hasQuestions ? draft.contentBreakdown : null,
      ai_raw_response: {
        shelf: {
          subject: draft.subject,
          comparison_mean: draft.comparison_mean,
          sections: draft.sections,
        },
      },
      image_paths: imagePaths,
    });
    if (insertError) {
      setStage("review");
      setError(insertError.message);
      return;
    }
    setDraft(null);
    setImagePaths([]);
    setStage("idle");
    setDoneMsg("Saved shelf report. It now shows on the student's Analysis page.");
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
        <p className="text-sm font-semibold mb-1">Upload a shelf exam report</p>
        <p className="text-xs text-slate-400 mb-3">
          NBME Subject Exam PDFs for any subject (Medicine, Psychiatry, Surgery, Pediatrics, OB/GYN, Family Medicine,
          Neurology, Emergency Medicine). Choose the Performance Report and/or the Question-Level Feedback PDF from the{" "}
          <strong>same exam</strong>. The AI reads the score, organ systems, physician tasks, site of care and every
          question.
        </p>
        <input type="file" accept="application/pdf" multiple onChange={handleFiles} className="text-sm text-slate-300" />
        <p className="text-xs text-slate-600 mt-1">Tip: select both PDFs of one exam together. Upload the next exam separately.</p>
        {doneMsg && <p className="text-xs text-green-400 mt-2">{doneMsg}</p>}
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      </div>
    );
  }

  if (stage === "uploading" || stage === "parsing") {
    return (
      <div className="card">
        <p className="text-sm text-slate-400">
          {stage === "uploading" ? "Uploading..." : "Reading the shelf report with AI - this can take up to a minute..."}
        </p>
      </div>
    );
  }

  if (!draft) return null;

  const weakest = Object.entries(draft.contentBreakdown)
    .sort((a, b) => a[1].percent - b[1].percent)
    .slice(0, 8);
  const groups = Array.from(new Set(draft.sections.map((s) => s.group || "Other")));

  return (
    <div className="card space-y-4">
      <div>
        <p className="text-sm font-semibold">Check what the AI read</p>
        <p className="text-xs text-slate-400">
          {draft.subject ? `${draft.subject}. ` : ""}
          {draft.itemCount > 0 ? `${draft.itemCount} questions read. ` : "No question-level file, so only the score tables were read. "}
          {draft.sections.length > 0 ? `${draft.sections.length} score rows read.` : ""} Fix anything that is off, then save.
        </p>
        {error && <p className="text-xs text-amber-400 mt-1">{error}</p>}
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="label">Exam name</label>
          <input type="text" className="input" value={examName} onChange={(e) => setExamName(e.target.value)} />
        </div>
        <div>
          <label className="label">Date taken</label>
          <input type="date" className="input" value={takenDate} onChange={(e) => setTakenDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Total score (equated % correct)</label>
          <input
            type="number"
            className="input"
            min={0}
            max={100}
            value={overall}
            onChange={(e) => setOverall(e.target.value)}
          />
          {draft.comparison_mean !== null && (
            <p className="text-xs text-slate-500 mt-1">National average for this exam: {draft.comparison_mean}</p>
          )}
        </div>
      </div>

      {groups.map((g) => (
        <div key={g}>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{g}</p>
          <div className="space-y-1">
            {draft.sections
              .filter((s) => (s.group || "Other") === g)
              .map((s, i) => (
                <div key={`${g}-${i}`} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-300 flex-1 min-w-0">{s.name}</span>
                  <span className="text-slate-300 shrink-0 w-20 text-right">{s.epc ?? "-"}</span>
                  <span className="text-slate-500 shrink-0 w-24 text-right">avg {s.comparison ?? "-"}</span>
                </div>
              ))}
          </div>
        </div>
      ))}

      {weakest.length > 0 && (
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
      )}

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={stage === "saving"} className="btn-primary text-sm">
          {stage === "saving" ? "Saving..." : "Save shelf report"}
        </button>
        <button type="button" onClick={cancel} disabled={stage === "saving"} className="btn-secondary text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}
