"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * A standing, freeform note a mentor keeps on one specific student, shown
 * at the top of that student's progress page
 * (app/mentorship/student/[studentId]/page.tsx), above the Meeting link
 * card. This is separate from:
 *   - Mentor Notes in the Study Planner calendar (mentor_daily_notes) -
 *     those are per DAY, tied to a specific date on the planner, and are
 *     already surfaced to the student via MentorNoteCard on the Dashboard.
 *   - Session notes (mentor_session_notes) - those are tied to one
 *     specific booked session.
 * This one is a single persistent note per (mentor, student) - the place
 * for general context that doesn't belong to any particular day or
 * session ("prefers video over audio", "struggles with pacing on blocks",
 * etc).
 *
 * The student CAN see this note - read-only, on their own Analysis page
 * (see app/history/page.tsx, readOnly=true) - but can never edit it: only
 * the mentor of record or an admin can write to mentor_student_notes (see
 * that table's RLS - the student's own policy, "Student reads own mentor
 * notes", is SELECT-only).
 *
 * Same per-(mentor, student) scoping caveat as MeetingLinkEditor: the table
 * only has one row per student_id, so if this student previously had a
 * different mentor who left a note, that row would still be sitting there
 * under the old mentor_id until overwritten. The mentor-facing page.tsx
 * query filters by mentor_id too, so a new mentor simply starts with a
 * blank note instead of seeing the old mentor's leftover text - but the
 * student's own read-only query (by student_id only) will still show
 * whatever the current row says, whoever wrote it.
 */
export default function StudentNotesEditor({
  studentId,
  mentorId,
  currentUserId,
  initialNote,
  initialUpdatedAt,
  readOnly = false,
}: {
  studentId: string;
  // Only needed when readOnly is false, since they're only used on writes.
  mentorId?: string;
  currentUserId?: string;
  initialNote: string | null;
  initialUpdatedAt: string | null;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState(initialNote ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(initialUpdatedAt);
  const [dirty, setDirty] = useState(false);

  async function save() {
    if (readOnly || !mentorId || !currentUserId) return;
    const trimmed = note.trim();
    setSaving(true);
    setError(null);
    const supabase = createClient();

    if (!trimmed) {
      // Saving an empty note just clears the row, same as MeetingLinkEditor's
      // remove() - no point keeping an empty row around.
      const { error: deleteError } = await supabase.from("mentor_student_notes").delete().eq("student_id", studentId);
      setSaving(false);
      if (deleteError) {
        setError(deleteError.message);
        return;
      }
      setSavedAt(null);
      setDirty(false);
      router.refresh();
      return;
    }

    const nowIso = new Date().toISOString();
    const { error: saveError } = await supabase.from("mentor_student_notes").upsert(
      {
        student_id: studentId,
        mentor_id: mentorId,
        created_by: currentUserId,
        note: trimmed,
        updated_at: nowIso,
      },
      { onConflict: "student_id" }
    );
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setSavedAt(nowIso);
    setDirty(false);
    router.refresh();
  }

  if (readOnly) {
    return (
      <div className="card">
        <p className="text-sm font-semibold mb-2">Notes from your mentor</p>
        <p className="text-xs text-slate-500 mb-2">
          General context your mentor has noted about you - not tied to one specific day or session.
          You can see this, but only your mentor can edit it.
        </p>
        {note.trim() ? (
          <p className="text-sm text-slate-300 whitespace-pre-wrap">{note}</p>
        ) : (
          <p className="text-sm text-slate-500 italic">Your mentor hasn&apos;t added any notes yet.</p>
        )}
        {savedAt && <p className="text-xs text-slate-500 mt-2">Last updated {new Date(savedAt).toLocaleDateString()}</p>}
      </div>
    );
  }

  return (
    <div className="card">
      <p className="text-sm font-semibold mb-2">Notes</p>
      <p className="text-xs text-slate-500 mb-2">
        Notes on this student - they can see these (read-only) on their own Analysis page, but only you
        can edit them. Good for context that isn&apos;t tied to one specific day or session.
      </p>
      <textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setDirty(true);
        }}
        rows={5}
        placeholder="General notes on this student..."
        className="input w-full text-sm resize-y"
      />
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      <div className="flex items-center gap-3 mt-2">
        <button type="button" onClick={save} disabled={saving || !dirty} className="btn-primary text-xs">
          {saving ? "Saving..." : "Save notes"}
        </button>
        {savedAt && !dirty && (
          <p className="text-xs text-slate-500">Last updated {new Date(savedAt).toLocaleDateString()}</p>
        )}
      </div>
    </div>
  );
}
