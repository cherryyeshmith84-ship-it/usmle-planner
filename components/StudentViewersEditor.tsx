"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Admin-only control for granting a non-mentor "viewer" (see lib/viewers.ts
 * and /admin/viewers) read-only access to a student. Sibling to
 * ViewerMentorsEditor.tsx, which does the exact same job for mentors who
 * are viewing someone else's student - this one is for people who aren't
 * mentors at all. Writes directly to student_viewers (RLS: "Admins manage
 * student_viewers" lets any is_admin() account insert/delete freely). Every
 * RLS policy backing viewer access (see migration
 * create_viewers_and_student_viewers) is SELECT-only, so this control is
 * purely about who's on the list, not what they can do once granted.
 */
export default function StudentViewersEditor({
  studentId,
  viewers,
  initialViewerIds,
}: {
  studentId: string;
  viewers: { id: string; name: string; email: string }[];
  initialViewerIds: string[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addValue, setAddValue] = useState("");

  const grantedViewers = viewers.filter((v) => initialViewerIds.includes(v.id));
  const addableViewers = viewers.filter((v) => !initialViewerIds.includes(v.id));

  async function addViewer() {
    if (!addValue) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("student_viewers")
      .insert({ student_id: studentId, viewer_id: addValue });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setAddValue("");
    router.refresh();
  }

  async function removeViewer(viewerId: string) {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("student_viewers")
      .delete()
      .eq("student_id", studentId)
      .eq("viewer_id", viewerId);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.refresh();
  }

  if (viewers.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
      <span className="text-xs text-slate-500">Viewers (non-mentor):</span>
      {grantedViewers.length === 0 ? (
        <span className="text-xs text-slate-600">none</span>
      ) : (
        grantedViewers.map((v) => (
          <span
            key={v.id}
            className="text-xs bg-slate-800 text-slate-300 rounded-full px-2 py-1 flex items-center gap-1"
          >
            {v.name}
            <button
              type="button"
              onClick={() => removeViewer(v.id)}
              disabled={saving}
              className="text-slate-500 hover:text-red-400"
              aria-label={`Remove ${v.name}'s viewer access`}
            >
              &times;
            </button>
          </span>
        ))
      )}
      {addableViewers.length > 0 && (
        <>
          <select
            value={addValue}
            onChange={(e) => setAddValue(e.target.value)}
            className="input text-xs py-1 px-2"
          >
            <option value="">+ Add viewer</option>
            {addableViewers.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
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
