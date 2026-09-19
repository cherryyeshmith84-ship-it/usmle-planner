"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Admin-only control for granting other mentors READ-ONLY "viewer" access
 * to a student, on top of that student's one primary mentor_email. Writes
 * directly to mentor_student_viewers (RLS: "Admins manage viewer grants"
 * lets any is_admin() account insert/delete freely). A viewer mentor never
 * gets edit rights here or anywhere else - every RLS policy backing viewer
 * access (see migration create_mentor_student_viewers) is SELECT-only, so
 * this control is purely about who's on that list, not what they can do
 * once granted.
 */
export default function ViewerMentorsEditor({
  studentId,
  mentors,
  primaryMentorEmail,
  initialViewerMentorIds,
}: {
  studentId: string;
  mentors: { id: string; name: string; email: string }[];
  primaryMentorEmail: string | null;
  initialViewerMentorIds: string[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addValue, setAddValue] = useState("");

  const viewerMentors = mentors.filter((m) => initialViewerMentorIds.includes(m.id));
  // Adding someone as a "viewer" who's already the primary mentor (or
  // already a viewer) would be redundant, so both are left out of the
  // add dropdown's options.
  const addableMentors = mentors.filter(
    (m) =>
      !initialViewerMentorIds.includes(m.id) &&
      m.email.toLowerCase() !== (primaryMentorEmail ?? "").toLowerCase()
  );

  async function addViewer() {
    if (!addValue) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("mentor_student_viewers")
      .insert({ student_id: studentId, mentor_id: addValue });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setAddValue("");
    router.refresh();
  }

  async function removeViewer(mentorId: string) {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("mentor_student_viewers")
      .delete()
      .eq("student_id", studentId)
      .eq("mentor_id", mentorId);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
      <span className="text-xs text-slate-500">Also viewable by:</span>
      {viewerMentors.length === 0 ? (
        <span className="text-xs text-slate-600">no one</span>
      ) : (
        viewerMentors.map((m) => (
          <span
            key={m.id}
            className="text-xs bg-slate-800 text-slate-300 rounded-full px-2 py-1 flex items-center gap-1"
          >
            {m.name}
            <button
              type="button"
              onClick={() => removeViewer(m.id)}
              disabled={saving}
              className="text-slate-500 hover:text-red-400"
              aria-label={`Remove ${m.name}'s viewer access`}
            >
              &times;
            </button>
          </span>
        ))
      )}
      {addableMentors.length > 0 && (
        <>
          <select
            value={addValue}
            onChange={(e) => setAddValue(e.target.value)}
            className="input text-xs py-1 px-2"
          >
            <option value="">+ Add viewer</option>
            {addableMentors.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          {addValue && (
            <button type="button" onClick={addViewer} disabled={saving} className="btn-secondary text-xs py-1 px-2">
              {saving ? "Saving..." : "Add"}
            </button>
          )}
        </>
      )}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
