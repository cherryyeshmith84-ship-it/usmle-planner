"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DAY_STATUS_LABEL, type DayStatus } from "@/lib/mentorDailyNotes";

const STATUS_BADGE: Record<DayStatus, string> = {
  completed: "bg-green-900/40 text-green-400",
  needs_improvement: "bg-yellow-900/40 text-yellow-400",
  missed: "bg-red-900/40 text-red-400",
  rescheduled: "bg-slate-700 text-slate-300",
};

/**
 * One editable "Mentor Note" cell in the mentor's read-only Study Planner
 * table (app/mentorship/student/[studentId]/page.tsx) - the one write
 * exception on that otherwise-read-only page, scoped to just this table
 * (see mentor_daily_notes RLS, which only lets a mentor touch a student
 * they actually have a relationship with). Separate from the student's own
 * Student Notes journal - a student can read this but never edit it, and a
 * mentor can never see or touch the student's own notes here.
 *
 * Also carries the "Mentor Checklist" day rating (Study Planner v1 item 7,
 * mentor_daily_notes.status) alongside the free-text note - a mentor
 * rating a day and leaving a note about it is naturally one action, and
 * the rating is what Weekly Progress (item 8) will roll up later.
 */
export default function MentorDailyNoteCell({
  studentId,
  mentorId,
  date,
  initialContent,
  initialStatus,
  initialReviewed = false,
  initialReviewedAt = null,
  initialNextCheckinDate = null,
}: {
  studentId: string;
  mentorId: string;
  date: string;
  initialContent: string;
  initialStatus: DayStatus | null;
  initialReviewed?: boolean;
  initialReviewedAt?: string | null;
  initialNextCheckinDate?: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(initialContent);
  const [status, setStatus] = useState<DayStatus | "">(initialStatus ?? "");
  const [reviewed, setReviewed] = useState(initialReviewed);
  const [reviewedAt, setReviewedAt] = useState(initialReviewedAt);
  const [nextCheckinDate, setNextCheckinDate] = useState(initialNextCheckinDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    // reviewed_at is set the moment "Reviewed" is first checked, not
    // hand-entered - it should reflect when the mentor actually looked at
    // the day, not be backdatable.
    const nextReviewedAt = reviewed ? reviewedAt ?? new Date().toISOString() : null;
    const supabase = createClient();
    const { error: upsertError } = await supabase.from("mentor_daily_notes").upsert(
      {
        student_id: studentId,
        mentor_id: mentorId,
        note_date: date,
        content,
        status: status || null,
        reviewed,
        reviewed_at: nextReviewedAt,
        next_checkin_date: nextCheckinDate || null,
      },
      { onConflict: "student_id,note_date" }
    );
    setSaving(false);
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setReviewedAt(nextReviewedAt);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-start gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            {status && (
              <span className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${STATUS_BADGE[status]}`}>
                {DAY_STATUS_LABEL[status]}
              </span>
            )}
            {reviewed && (
              <span
                className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-brand-900/40 text-brand-400"
                title={reviewedAt ? `Reviewed ${new Date(reviewedAt).toLocaleDateString()}` : "Reviewed"}
              >
                ✓ Reviewed{reviewedAt ? ` ${new Date(reviewedAt).toLocaleDateString()}` : ""}
              </span>
            )}
          </div>
          <div className="text-slate-300 whitespace-pre-wrap">{content || <span className="text-slate-600">-</span>}</div>
          {nextCheckinDate && <p className="text-[10px] text-slate-500">Next check-in: {nextCheckinDate}</p>}
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-brand-400 hover:text-brand-300 shrink-0"
        >
          {content || status || reviewed ? "Edit" : "Add"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 min-w-[220px]">
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as DayStatus | "")}
        className="input text-xs py-1 px-2 w-full"
      >
        <option value="">No rating</option>
        {(Object.keys(DAY_STATUS_LABEL) as DayStatus[]).map((s) => (
          <option key={s} value={s}>
            {DAY_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        className="input text-xs py-1.5 px-2 w-full resize-y text-slate-100"
        placeholder="Note for this day..."
      />
      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
        <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} className="w-3.5 h-3.5" />
        Reviewed
      </label>
      <div>
        <label className="block text-[10px] text-slate-500 mb-0.5">Next check-in</label>
        <input
          type="date"
          value={nextCheckinDate}
          onChange={(e) => setNextCheckinDate(e.target.value)}
          className="input text-xs py-1 px-2 w-full"
        />
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={saving} className="btn-primary text-xs">
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setContent(initialContent);
            setStatus(initialStatus ?? "");
            setReviewed(initialReviewed);
            setReviewedAt(initialReviewedAt);
            setNextCheckinDate(initialNextCheckinDate ?? "");
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
