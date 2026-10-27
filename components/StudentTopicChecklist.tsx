"use client";

import { useState } from "react";
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
const PRESET_ASSESSMENTS = new Set(ASSESSMENT_GROUPS.flatMap((g) => g.items));

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

  // CBSE custom entries: any self-assessment row that isn't one of the
  // preset exams above. Seeded from saved rows, grows as the mentor adds.
  const [customCbse, setCustomCbse] = useState<string[]>(() => {
    const seen: string[] = [];
    for (const r of initialRows) {
      if (r.resource === "self_assessments" && r.category === "assessment" && !PRESET_ASSESSMENTS.has(r.topic)) {
        if (!seen.includes(r.topic)) seen.push(r.topic);
      }
    }
    return seen;
  });
  const [newCbse, setNewCbse] = useState("");
  const [adding, setAdding] = useState(false);

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

  // Adds a custom CBSE entry as a new (unchecked) checklist item.
  async function addCbse() {
    const name = newCbse.trim();
    if (!name || readOnly || !mentorId) return;
    if (PRESET_ASSESSMENTS.has(name) || customCbse.includes(name)) {
      setError("That entry already exists.");
      return;
    }
    setAdding(true);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("student_topic_checklist").upsert(
      {
        student_id: studentId,
        mentor_id: mentorId,
        resource: "self_assessments",
        category: "assessment",
        topic: name,
        completed: false,
        completed_at: null,
      },
      { onConflict: "student_id,resource,category,topic" }
    );
    setAdding(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setCustomCbse((prev) => [...prev, name]);
    setNewCbse("");
    router.refresh();
  }

  function renderBoxes(resource: StoredResource, category: Category, topics: readonly string[]) {
    return (
      <div className="grid sm:grid-cols-2 gap-1.5">
        {topics.map((topic) => {
          const k = key(resource, category, topic);
          return (
            <label key={topic} className={`flex items-center gap-2 text-sm ${readOnly ? "" : "cursor-pointer"}`}>
              <input
                type="checkbox"
                checked={completed.has(k)}
                disabled={readOnly || savingKey === k}
                onChange={() => toggle(resource, category, topic)}
                className="w-4 h-4 shrink-0"
              />
              <span className={completed.has(k) ? "text-slate-300" : "text-slate-400"}>{topic}</span>
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

  const allAssessments = [...ASSESSMENT_GROUPS.flatMap((g) => g.items), ...customCbse];
  const assessmentsDone = allAssessments.filter((t) => completed.has(key("self_assessments", "assessment", t))).length;

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
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">CBSE</p>
          {customCbse.length > 0 ? (
            renderBoxes("self_assessments", "assessment", customCbse)
          ) : (
            <p className="text-xs text-slate-600">No CBSE entries yet.</p>
          )}
          {!readOnly && mentorId && (
            <div className="flex items-center gap-2 mt-3">
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
                placeholder="Custom, e.g. CBSE 1"
                className="input text-sm py-1.5 flex-1 max-w-xs"
              />
              <button
                type="button"
                onClick={addCbse}
                disabled={adding || !newCbse.trim()}
                className="btn-secondary text-xs"
              >
                {adding ? "Adding..." : "Add"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
