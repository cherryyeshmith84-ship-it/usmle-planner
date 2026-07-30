"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Lets a mentor write (or update) the one current study plan for a specific
 * student, from that student's read-only progress page
 * (app/mentorship/student/[studentId]/page.tsx). Writing here is what makes
 * the student's Analysis page swap its computed "Default AI Study Plan" card
 * for this mentor-authored one instead - see mentor_study_plans table and
 * the "Study Plan" card in components/PerformanceClient.tsx.
 */
export default function StudyPlanEditor({
  studentId,
  mentorId,
  currentUserId,
  initialContent,
  initialUpdatedAt,
}: {
  studentId: string;
  mentorId: string;
  currentUserId: string;
  initialContent: string | null;
  initialUpdatedAt: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!initialContent);
  const [content, setContent] = useState(initialContent ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!content.trim()) {
      setError("Write something before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: saveError } = await supabase.from("mentor_study_plans").upsert(
      {
        student_id: studentId,
        mentor_id: mentorId,
        created_by: currentUserId,
        content: content.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "student_id" }
    );
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm("Remove this study plan? The student will see the default AI-generated plan again instead.")) return;
    setSaving(true);
    const supabase = createClient();
    await supabase.from("mentor_study_plans").delete().eq("student_id", studentId);
    setSaving(false);
    setContent("");
    setEditing(true);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="card">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-sm font-semibold">Study plan</p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setEditing(true)} className="text-xs text-brand-400 hover:text-brand-300">
              Edit
            </button>
            <button type="button" onClick={remove} disabled={saving} className="text-xs text-red-400 hover:text-red-300">
              Remove
            </button>
          </div>
        </div>
        <p className="text-sm text-slate-300 whitespace-pre-wrap">{content}</p>
        {initialUpdatedAt && (
          <p className="text-xs text-slate-500 mt-2">Last updated {new Date(initialUpdatedAt).toLocaleDateString()}</p>
        )}
        <p className="text-xs text-slate-500 mt-1">
          This replaces the default AI-generated study plan on the student&apos;s Analysis page.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="text-sm font-semibold mb-2">Study plan</p>
      <p className="text-xs text-slate-500 mb-2">
        Write a plan for this student - it replaces their default AI-generated study plan until you remove it.
      </p>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={5}
        placeholder="e.g. Focus the next two weeks on Cardiovascular and Renal - 2 UWorld blocks/day with full review, plus..."
        className="input w-full text-sm"
      />
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      <div className="flex items-center gap-2 mt-2">
        <button type="button" onClick={save} disabled={saving} className="btn-primary text-xs">
          {saving ? "Saving..." : "Save plan"}
        </button>
        {initialContent && (
          <button
            type="button"
            onClick={() => {
              setContent(initialContent ?? "");
              setEditing(false);
              setError(null);
            }}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
