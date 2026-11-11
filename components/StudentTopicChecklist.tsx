"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { STEP1_SUBJECTS, STEP1_SYSTEMS } from "@/lib/qbankTypes";

export type ChecklistResource = "uworld" | "boards_and_beyond" | "amboss" | "mehlman";
type StoredResource = ChecklistResource | "self_assessments";
type Category = "system" | "subject" | "assessment";

export interface TopicChecklistRow {
  resource: StoredResource;
  category: Category;
  topic: string;
  completed: boolean;
}

const RESOURCES: { id: ChecklistResource; label: string }[] = [
  { id: "uworld", label: "UWorld" },
  { id: "boards_and_beyond", label: "Boards and Beyond" },
  { id: "amboss", label: "Amboss" },
  { id: "mehlman", label: "Mehlman" },
];

// Self-assessment exams to tick off once taken. Independent of the resource
// tabs above (stored under resource "self_assessments", category
// "assessment"). Topic names are saved as-is, so don't rename them casually.
const nbmeForms = Array.from({ length: 14 }, (_, i) => `NBME ${21 + i}`); // NBME 21-34
const ASSESSMENT_GROUPS: { label: string; items: string[] }[] = [
  { label: "NBME", items: nbmeForms },
  { label: "UWorld Self-Assessments (UWSA)", items: ["UWSA 1", "UWSA 2", "UWSA 3"] },
  { label: "Mehlman", items: ["Mehlman 1", "Mehlman 2"] },
  { label: "Amboss", items: ["Amboss Self-Assessment"] },
  { label: "Free 120", items: ["Free 120 - 2021", "Free 120 - 2022", "Free 120 - 2024", "Free 120 - 2026"] },
];

/** Works out which self-assessment checklist item an uploaded score report
 *  belongs to (e.g. "NBME Form 32" -> "NBME 32", "Free 120 2024" ->
 *  "Free 120 - 2024"). CBSE reports come back as "__cbse:<n>" when the name
 *  has a number, or "__cbsedate:<date>" when it doesn't. Returns null when it
 *  can't tell. */
function matchAssessmentTopic(name: string, examType: string | null, takenDate: string | null): string | null {
  const n = name.toLowerCase();
  let m: RegExpMatchArray | null;
  if ((m = n.match(/cbse\D*(\d+)/))) return `__cbse:${Number(m[1])}`;
  // CBSE reports with no number in the name (e.g. "NBME CBSE", "CBSE"). CBSSA
  // is a different thing (an NBME form), so it's not treated as CBSE.
  if (/cbse/.test(n) && !/cbssa/.test(n)) return takenDate ? `__cbsedate:${takenDate}` : null;
  if ((m = n.match(/nbme\D*(\d{1,2})/))) return `NBME ${Number(m[1])}`;
  // Reports uploaded as type NBME (or named just "form 25") without the word
  // "NBME" in the name. A 4-digit "2025" is read as a typo of form 25.
  if (examType === "nbme" || /\bform\b/.test(n)) {
    const f = n.match(/(\d{2,4})/)?.[1];
    if (f) {
      let num = Number(f);
      if (num >= 2000 && num <= 2099) num = num - 2000;
      if (num >= 21 && num <= 34) return `NBME ${num}`;
    }
  }
  if ((m = n.match(/uwsa\D*(\d)/)) || (m = n.match(/uworld self[- ]assessment\D*(\d)/))) return `UWSA ${m[1]}`;
  if ((m = n.match(/mehlman\D*(\d)/))) return `Mehlman ${m[1]}`;
  if (n.includes("amboss")) return "Amboss Self-Assessment";
  if (/free[\s-]*120/.test(n)) {
    const y = n.match(/(20\d\d)/)?.[1] ?? (takenDate ? takenDate.slice(0, 4) : null);
    return y ? `Free 120 - ${y}` : null;
  }
  return null;
}

/** Overall % of a report. When the report has no overall % but does have
 *  per-system percentages, falls back to the average of those (marked
 *  estimated so it's shown with a "~"). */
function reportPercent(
  overall: number | string | null | undefined,
  systems: Record<string, number> | null | undefined
): { value: number; est: boolean } | null {
  if (overall !== null && overall !== undefined && isFinite(Number(overall))) {
    return { value: Math.round(Number(overall) * 10) / 10, est: false };
  }
  const vals = Object.values(systems ?? {}).filter((v) => typeof v === "number" && isFinite(v));
  if (vals.length >= 3) {
    return { value: Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10, est: true };
  }
  return null;
}

interface CbseReport {
  key: string;
  label: string;
  date: string | null;
  value: number;
  est: boolean;
}

/**
 * "Systems & Disciplines Covered" checklist on a student's Overview tab, plus
 * a "Self Assessments" checklist (NBME 21-34, UWSA 1-3, Mehlman 1-2, Amboss,
 * Free 120 2021/2022/2024/2026) and a CBSE section. Systems/Disciplines are
 * one checklist per resource tab; self-assessments are a single list shared
 * across tabs.
 *
 * Self-assessments and CBSE are filled in automatically from the student's
 * uploaded score reports / question-level reports in Analysis: each one is
 * ticked and shows its percentage (a "~" means it was estimated from the
 * system percentages because no overall % was entered). CBSE has no manual
 * add/remove - an upload named CBSE 1, CBSE 2, ... simply shows up. Scores
 * reload whenever the window regains focus or a report is edited.
 *
 * Each systems/disciplines/assessment checkbox writes straight to
 * student_topic_checklist on click (upsert on student_id, resource, category,
 * topic). Also rendered read-only on the student's own pages (readOnly=true).
 */
export default function StudentTopicChecklist({
  studentId,
  mentorId,
  initialRows,
  readOnly = false,
}: {
  studentId: string;
  mentorId?: string;
  initialRows: TopicChecklistRow[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [activeResource, setActiveResource] = useState<ChecklistResource>("uworld");
  const [completed, setCompleted] = useState<Set<string>>(
    () =>
      new Set(
        initialRows.filter((r) => r.completed).map((r) => `${r.resource}:${r.category}:${r.topic}`)
      )
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Latest score-report percent per self-assessment item (from the Analysis
  // uploads), keyed by checklist topic name. `estKeys` marks the estimated ones.
  const [scores, setScores] = useState<Record<string, number>>({});
  const [estKeys, setEstKeys] = useState<Set<string>>(new Set());
  const [cbseReports, setCbseReports] = useState<CbseReport[]>([]);

  const loadScores = useCallback(async () => {
    const supabase = createClient();
    // Includes question-level reports too - every uploaded report counts.
    const { data: reports } = await supabase
      .from("score_reports")
      .select("exam_name, exam_type, overall_percent, system_breakdown, taken_date")
      .eq("user_id", studentId)
      .order("taken_date", { ascending: true });
    const map: Record<string, number> = {};
    const est = new Set<string>();
    const cbseByKey = new Map<string, CbseReport>();
    for (const r of (reports ?? []) as {
      exam_name: string | null;
      exam_type: string | null;
      overall_percent: number | null;
      system_breakdown: Record<string, number> | null;
      taken_date: string | null;
    }[]) {
      const pct = reportPercent(r.overall_percent, r.system_breakdown);
      if (!pct) continue;
      const topic = matchAssessmentTopic(r.exam_name ?? "", r.exam_type, r.taken_date);
      if (!topic) continue;
      map[topic] = pct.value; // oldest first, so the latest wins
      if (pct.est) est.add(topic);
      else est.delete(topic);
      if (topic.startsWith("__cbse")) {
        const numMatch = topic.match(/^__cbse:(\d+)$/);
        // One row per CBSE number (or per date when the name has no number);
        // a later upload replaces an earlier one.
        cbseByKey.set(topic, {
          key: topic,
          label: numMatch ? `CBSE ${Number(numMatch[1])}` : r.exam_name || "CBSE",
          date: r.taken_date,
          value: pct.value,
          est: pct.est,
        });
      }
    }
    const list = Array.from(cbseByKey.values()).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    setScores(map);
    setEstKeys(est);
    setCbseReports(list);
  }, [studentId]);

  useEffect(() => {
    loadScores();
    const refresh = () => loadScores();
    window.addEventListener("focus", refresh);
    window.addEventListener("score-reports-changed", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("score-reports-changed", refresh);
    };
  }, [loadScores]);

  function key(resource: StoredResource, category: Category, topic: string) {
    return `${resource}:${category}:${topic}`;
  }

  function pctLabel(topicKey: string) {
    const v = scores[topicKey];
    if (v === undefined) return null;
    return `${estKeys.has(topicKey) ? "~" : ""}${v}%`;
  }

  async function toggle(resource: StoredResource, category: Category, topic: string) {
    if (readOnly || !mentorId) return;
    const k = key(resource, category, topic);
    const wasCompleted = completed.has(k);
    setCompleted((prev) => {
      const next = new Set(prev);
      if (wasCompleted) next.delete(k);
      else next.add(k);
      return next;
    });
    setSavingKey(k);
    setError(null);
    const supabase = createClient();
    const { error: upsertError } = await supabase.from("student_topic_checklist").upsert(
      {
        student_id: studentId,
        mentor_id: mentorId,
        resource,
        category,
        topic,
        completed: !wasCompleted,
        completed_at: !wasCompleted ? new Date().toISOString() : null,
      },
      { onConflict: "student_id,resource,category,topic" }
    );
    setSavingKey(null);
    if (upsertError) {
      setError(upsertError.message);
      setCompleted((prev) => {
        const next = new Set(prev);
        if (wasCompleted) next.add(k);
        else next.delete(k);
        return next;
      });
      return;
    }
    router.refresh();
  }

  function renderBoxes(resource: StoredResource, category: Category, topics: readonly string[]) {
    return (
      <div className="grid sm:grid-cols-2 gap-1.5">
        {topics.map((topic) => {
          const k = key(resource, category, topic);
          // A self-assessment with an uploaded score report counts as taken.
          const label = category === "assessment" ? pctLabel(topic) : null;
          const autoTaken = label !== null;
          const isChecked = completed.has(k) || autoTaken;
          return (
            <label key={topic} className={`flex items-center gap-2 text-sm ${readOnly ? "" : "cursor-pointer"}`}>
              <input
                type="checkbox"
                checked={isChecked}
                disabled={readOnly || savingKey === k || autoTaken}
                onChange={() => toggle(resource, category, topic)}
                className="w-4 h-4 shrink-0"
              />
              <span className={isChecked ? "text-slate-300" : "text-slate-400"}>{topic}</span>
              {label && (
                <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-brand-900/40 text-brand-300">
                  {label}
                </span>
              )}
            </label>
          );
        })}
      </div>
    );
  }

  function renderGroup(label: string, category: "system" | "subject", topics: readonly string[]) {
    const doneCount = topics.filter((t) => completed.has(key(activeResource, category, t))).length;
    return (
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          {label} <span className="normal-case text-slate-600">({doneCount}/{topics.length} covered)</span>
        </p>
        {renderBoxes(activeResource, category, topics)}
      </div>
    );
  }

  const allAssessments = ASSESSMENT_GROUPS.flatMap((g) => g.items);
  const assessmentsDone = allAssessments.filter(
    (t) => completed.has(key("self_assessments", "assessment", t)) || scores[t] !== undefined
  ).length;

  return (
    <div className="card space-y-5">
      <div>
        <p className="text-sm font-semibold">Systems &amp; Disciplines Covered</p>
        <p className="text-xs text-slate-500 mt-1">
          {readOnly
            ? "Your mentor checks these off as you cover them together, one tab per resource - separate from how well you're scoring (see your performance charts above for that)."
            : "Check off each system and discipline as you work through it with this student, one tab per resource - separate from how well they're scoring (see the Analysis tab for that)."}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-slate-800 -mb-1 pb-3">
        {RESOURCES.map((r) => {
          const isActive = r.id === activeResource;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setActiveResource(r.id)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition ${
                isActive
                  ? "bg-brand-900/40 text-brand-300"
                  : "bg-slate-900 text-slate-500 hover:text-slate-300"
              }`}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {renderGroup("Systems", "system", STEP1_SYSTEMS)}
      {renderGroup("Disciplines", "subject", STEP1_SUBJECTS)}

      <div className="border-t border-slate-800 pt-5 space-y-4">
        <div>
          <p className="text-sm font-semibold">
            Self Assessments{" "}
            <span className="text-xs font-normal text-slate-600">
              ({assessmentsDone}/{allAssessments.length} taken)
            </span>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {readOnly
              ? "Self-assessments your mentor has marked as taken, plus any you've uploaded in Analysis (shown with your score)."
              : "Ticked automatically when a score report is uploaded or edited in Analysis, with the score shown. You can also tick one manually."}
          </p>
        </div>
        {ASSESSMENT_GROUPS.map((g) => (
          <div key={g.label}>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{g.label}</p>
            {renderBoxes("self_assessments", "assessment", g.items)}
          </div>
        ))}

        {/* CBSE - filled automatically from uploaded CBSE reports. */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            CBSE <span className="normal-case text-slate-600">({cbseReports.length} taken)</span>
          </p>
          {cbseReports.length === 0 ? (
            <p className="text-xs text-slate-600">
              No CBSE uploaded yet - upload a report named CBSE 1, CBSE 2... in Analysis and it appears here.
            </p>
          ) : (
            <div className="space-y-1.5">
              {cbseReports.map((r) => (
                <div key={r.key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked disabled className="w-4 h-4 shrink-0" />
                  <span className="text-slate-300">{r.label}</span>
                  {r.date && <span className="text-xs text-slate-500">&middot; {r.date}</span>}
                  <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-brand-900/40 text-brand-300">
                    {r.est ? "~" : ""}
                    {r.value}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
