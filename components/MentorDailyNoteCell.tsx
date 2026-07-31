"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * One editable "Mentor Note" cell in the mentor's read-only Study Planner
 * table (app/mentorship/student/[studentId]/page.tsx) - the one write
 * exception on that otherwise-read-only page, scoped to just this table
 * (see mentor_daily_notes RLS, which only lets a mentor touch a student
 * they actually have a relationship with). Separate from the student's own
 * Student Notes journal - a student can read this but never edit it, and a
 * mentor can never see or touch the student's own notes here.
 */
export default function MentorDailyNoteCell({
  studentId,
  mentorId,
  date,
  initialContent,
}: {
  studentId: string;
  mentorId: string;
  date: string;
  initialContent: string;
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: upsertError } = await supabase
      .from("mentor_daily_notes")
      .upsert(
        { student_id: studentId, mentor_id: mentorId, note_date: date, content },
        { onConflict: "student_id,note_date" }
      );
    setSaving(false);
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-start gap-2">
        <span className="text-slate-300 whitespace-pre-wrap">{content || <span className="text-slate-600">-</span>}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-brand-400 hover:text-brand-300 shrink-0"
        >
          {content ? "Edit" : "Add"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 min-w-[220px]">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        className="input text-xs py-1.5 px-2 w-full resize-y text-slate-100"
        placeholder="Note for this day..."
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={saving} className="btn-primary text-xs">
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setContent(initialContent);
            setEditing(false);
            setError(null);
          }}
          className="text-xs text-slate-400 hover:text-slate-200"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
