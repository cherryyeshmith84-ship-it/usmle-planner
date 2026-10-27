"use client";

import { useEffect, useState } from "react";
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
 *  "Free 120 - 2024"). Returns null when it can't tell. */
function matchAssessmentTopic(name: string, examType: string | null, takenDate: string | null): string | null {
  const n = name.toLowerCase();
  let m: RegExpMatchArray | null;
  if ((m = n.match(/cbse\D*(\d+)/))) return `__cbse:${Number(m[1])}`;
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

/**
 * "Systems & Disciplines Covered" checklist on a student's Overview tab, plus
 * a "Self Assessments" checklist (NBME 21-34, UWSA 1-3, Mehlman 1-2, Amboss,
 * Free 120 2021/2022/2024/2026, and a CBSE section the mentor fills with
 * custom entries). Systems/Disciplines are one checklist per resource tab;
 * self-assessments are a single list shared across tabs.
 *
 * Each checkbox writes straight to student_topic_checklist on click (upsert
 * on student_id, resource, category, topic). Also rendered read-only on the
 * student's own pages (readOnly=true).
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

    // CBSE attempts: the student (or mentor) logs "CBSE 1", "CBSE 2"... with
  // the date taken. Stored in student_cbse_attempts (not the checklist table,
  // since students can't write to that one).
  interface CbseAttempt {
    id: string;
    name: string;
    taken_date: string;
    completed: boolean;
  }
  const [cbse, setCbse] = useState<CbseAttempt[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [newCbse, setNewCbse] = useState("");
  const [newCbseDate, setNewCbseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [adding, setAdding] = useState(false);
  const canEditCbse = !readOnly || viewerId === studentId;
  // Latest score-report percent per self-assessment item (from the Analysis
  // uploads), keyed by checklist topic name, or "__cbse:<n>" for CBSE n.
  const [scores, setScores] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!cancelled) setViewerId(user?.id ?? null);
      const { data } = await supabase
        .from("student_cbse_attempts")
        .select("id, name, taken_date, completed")
        .eq("student_id", studentId)
        .order("taken_date", { ascending: true });
      if (!cancelled) setCbse((data ?? []) as CbseAttempt[]);
      const { data: reports } = await supabase
        .from("score_reports")
        .select("exam_name, exam_type, overall_percent, taken_date")
        .eq("user_id", studentId)
        .order("taken_date", { ascending: true });
      if (!cancelled) {
        const map: Record<string, number> = {};
        for (const r of (reports ?? []) as { exam_name: string; exam_type: string | null; overall_percent: number | null; taken_date: string | null }[]) {
          if (r.overall_percent === null || r.overall_percent === undefined) continue;
          const topic = matchAssessmentTopic(r.exam_name ?? "", r.exam_type, r.taken_date);
          if (topic) map[topic] = r.overall_percent; // oldest first, so the latest wins
        }
        setScores(map);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  function key(resource: StoredResource, category: Category, topic: string) {
    return `${resource}:${category}:${topic}`;
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

  async function addCbse() {
    const name = newCbse.trim();
    if (!name || !newCbseDate || !canEditCbse) return;
    setAdding(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("student_cbse_attempts")
      .insert({ student_id: studentId, name, taken_date: newCbseDate, completed: true })
      .select("id, name, taken_date, completed")
      .single();
    setAdding(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "Couldn't save.");
      return;
    }
    setCbse((prev) => [...prev, data as CbseAttempt].sort((a, b) => a.taken_date.localeCompare(b.taken_date)));
    setNewCbse("");
  }

  async function toggleCbse(a: CbseAttempt) {
    if (!canEditCbse) return;
    setCbse((prev) => prev.map((x) => (x.id === a.id ? { ...x, completed: !x.completed } : x)));
    const supabase = createClient();
    const { error: e } = await supabase.from("student_cbse_attempts").update({ completed: !a.completed }).eq("id", a.id);
    if (e) {
      setError(e.message);
      setCbse((prev) => prev.map((x) => (x.id === a.id ? { ...x, completed: a.completed } : x)));
    }
  }

  async function removeCbse(a: CbseAttempt) {
    if (!canEditCbse || !confirm(`Remove ${a.name}?`)) return;
    const supabase = createClient();
    const { error: e } = await supabase.from("student_cbse_attempts").delete().eq("id", a.id);
    if (e) {
      setError(e.message);
      return;
    }
    setCbse((prev) => prev.filter((x) => x.id !== a.id));
  }

  function renderBoxes(resource: StoredResource, category: Category, topics: readonly string[]) {
    return (
      <div className="grid sm:grid-cols-2 gap-1.5">
        {topics.map((topic) => {
          const k = key(resource, category, topic);
          // A self-assessment with an uploaded score report counts as taken.
          const score = category === "assessment" ? scores[topic] : undefined;
          const autoTaken = score !== undefined;
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
              {autoTaken && (
                <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-brand-900/40 text-brand-300">
                  {score}%
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
              ? "Self-assessments your mentor has marked as taken."
              : "Tick each self-assessment once the student has taken it."}
          </p>
        </div>
        {ASSESSMENT_GROUPS.map((g) => (
          <div key={g.label}>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{g.label}</p>
            {renderBoxes("self_assessments", "assessment", g.items)}
          </div>
        ))}

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            CBSE <span className="normal-case text-slate-600">({cbse.filter((c) => c.completed).length} taken)</span>
          </p>
          {cbse.length === 0 ? (
            <p className="text-xs text-slate-600">No CBSE entries yet.</p>
          ) : (
            <div className="space-y-1.5">
              {cbse.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={c.completed}
                    disabled={!canEditCbse}
                    onChange={() => toggleCbse(c)}
                    className="w-4 h-4 shrink-0"
                  />
                  <span className={c.completed ? "text-slate-300" : "text-slate-400"}>{c.name}</span>
                  <span className="text-xs text-slate-500">&middot; {c.taken_date}</span>
                  {(() => {
                    const num = c.name.match(/(\d+)/)?.[1];
                    const sc = num ? scores[`__cbse:${Number(num)}`] : undefined;
                    return sc !== undefined ? (
                      <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-brand-900/40 text-brand-300">
                        {sc}%
                      </span>
                    ) : null;
                  })()}
                  {canEditCbse && (
                    <button
                      type="button"
                      onClick={() => removeCbse(c)}
                      className="text-xs text-red-400 hover:text-red-300 ml-1"
                      aria-label={`Remove ${c.name}`}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {canEditCbse && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <input
                type="text"
                value={newCbse}
                onChange={(e) => setNewCbse(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCbse();
                  }
                }}
                placeholder="e.g. CBSE 1"
                className="input text-sm py-1.5 w-40"
              />
              <input
                type="date"
                value={newCbseDate}
                onChange={(e) => setNewCbseDate(e.target.value)}
                className="input text-sm py-1.5"
              />
              <button
                type="button"
                onClick={addCbse}
                disabled={adding || !newCbse.trim() || !newCbseDate}
                className="btn-secondary text-xs"
              >
                {adding ? "Saving..." : "Save"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
