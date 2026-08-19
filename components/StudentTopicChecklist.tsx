"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { STEP1_SUBJECTS, STEP1_SYSTEMS } from "@/lib/qbankTypes";

export interface TopicChecklistRow {
  category: "system" | "subject";
  topic: string;
  completed: boolean;
}

/**
 * "Systems & Disciplines" coverage checklist on a student's Overview tab -
 * lets a mentor mark off every organ system and every discipline/subject
 * as the student works through it, independent of score-report performance
 * (computeSystemStrengths/computeDisciplineStrengths on this same page show
 * how well they're DOING on a system; this tracks whether it's been
 * COVERED at all yet). Uses the exact same two lists
 * (STEP1_SYSTEMS/STEP1_SUBJECTS from lib/qbankTypes.ts) as score report
 * breakdowns and qbank question tagging elsewhere in the app, so a system
 * name here always matches the same system name everywhere else.
 *
 * Each checkbox writes straight to the database on click (upsert on the
 * (student_id, category, topic) unique constraint) rather than batching
 * into a "Save" button - there's no draft state to lose here, so an
 * immediate save keeps it simple and matches how MentorAvailabilityClient's
 * slot Remove/edit actions work.
 *
 * Also rendered read-only on the student's own Analysis page (app/history/
 * page.tsx) with readOnly=true, so a student can see what their mentor has
 * marked covered without being able to change it themselves - mirrors the
 * RLS policy on student_topic_checklist, which only lets a student SELECT
 * their own rows, not write them (only their mentor or an admin can).
 */
export default function StudentTopicChecklist({
  studentId,
  mentorId,
  initialRows,
  readOnly = false,
}: {
  studentId: string;
  // Only needed when readOnly is false, since it's only used on writes.
  mentorId?: string;
  initialRows: TopicChecklistRow[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [completed, setCompleted] = useState<Set<string>>(
    () => new Set(initialRows.filter((r) => r.completed).map((r) => `${r.category}:${r.topic}`))
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function key(category: "system" | "subject", topic: string) {
    return `${category}:${topic}`;
  }

  async function toggle(category: "system" | "subject", topic: string) {
    if (readOnly || !mentorId) return;
    const k = key(category, topic);
    const wasCompleted = completed.has(k);
    // Optimistic - flips instantly instead of waiting on the round trip,
    // then rolls back below if the save actually fails.
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
        category,
        topic,
        completed: !wasCompleted,
        completed_at: !wasCompleted ? new Date().toISOString() : null,
      },
      { onConflict: "student_id,category,topic" }
    );
    setSavingKey(null);
    if (upsertError) {
      setError(upsertError.message);
      // Roll back the optimistic flip.
      setCompleted((prev) => {
        const next = new Set(prev);
        if (wasCompleted) next.add(k);
        else next.delete(k);
        return next;
      });
      return;
    }
    // Without this, Next's client-side router cache keeps serving the RSC
    // snapshot from whenever this page was last fetched - so navigating
    // away and back (or the student's own read-only copy) could show stale
    // checkmarks even though the database write above already succeeded.
    // The local optimistic state above already made this click feel
    // instant; this just makes sure the next navigation picks up the truth.
    router.refresh();
  }

  function renderGroup(label: string, category: "system" | "subject", topics: readonly string[]) {
    const doneCount = topics.filter((t) => completed.has(key(category, t))).length;
    return (
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          {label} <span className="normal-case text-slate-600">({doneCount}/{topics.length} covered)</span>
        </p>
        <div className="grid sm:grid-cols-2 gap-1.5">
          {topics.map((topic) => {
            const k = key(category, topic);
            return (
              <label
                key={topic}
                className={`flex items-center gap-2 text-sm ${readOnly ? "" : "cursor-pointer"}`}
              >
                <input
                  type="checkbox"
                  checked={completed.has(k)}
                  disabled={readOnly || savingKey === k}
                  onChange={() => toggle(category, topic)}
                  className="w-4 h-4 shrink-0"
                />
                <span className={completed.has(k) ? "text-slate-300" : "text-slate-400"}>{topic}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="card space-y-5">
      <div>
        <p className="text-sm font-semibold">Systems &amp; Disciplines Covered</p>
        <p className="text-xs text-slate-500 mt-1">
          {readOnly
            ? "Your mentor checks these off as you cover them together - separate from how well you're scoring (see your performance charts above for that)."
            : "Check off each system and discipline as you work through it with this student - separate from how well they're scoring (see the Analysis tab for that)."}
        </p>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {renderGroup("Systems", "system", STEP1_SYSTEMS)}
      {renderGroup("Disciplines", "subject", STEP1_SUBJECTS)}
    </div>
  );
}
