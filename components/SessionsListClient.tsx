"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatSlotDate, formatSlotTime, getSlotStatus, type MentorSlot, type SessionNote } from "@/lib/mentors";

/**
 * One row's worth of display data, pre-computed server-side so this
 * component doesn't need to know whether it's rendering a mentor's list
 * (of students who booked them) or a student's list (of mentors they
 * booked) - both shapes get flattened into this before reaching here.
 */
export type SessionRow = {
  slot: MentorSlot;
  title: string;
  subtitle?: string | null;
  note?: string | null;
  photoUrl?: string | null;
  meetingLink?: string | null;
  // Only student rows get a reschedule option, pointed at that specific
  // mentor's profile page to pick a new slot.
  rescheduleMentorId?: string | null;
  // The session note for this slot, if one already exists - undefined/null
  // means none has been written yet.
  sessionNote?: SessionNote | null;
  // Only set on mentor rows - links to the read-only student progress page
  // (app/mentorship/student/[studentId]) so a mentor can check a student's
  // score reports, planner, and history before/after a session.
  studentId?: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  upcoming: "bg-brand-900/40 text-brand-300",
  completed: "bg-green-900/40 text-green-400",
  cancelled: "bg-red-900/40 text-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  upcoming: "Upcoming",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * Notes section for one completed session - a mentor can write/edit a
 * discussion/strengths/weaknesses/study-plan/goals write-up, and the
 * student it's about can always read it (never edit it). One row per slot
 * (upsert on slot_id), so re-saving just updates the same note instead of
 * creating duplicates.
 */
function NotesSection({
  slot,
  role,
  initialNote,
}: {
  slot: MentorSlot;
  role: "mentor" | "student";
  initialNote: SessionNote | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(initialNote);
  const [discussion, setDiscussion] = useState(initialNote?.discussion || "");
  const [strengths, setStrengths] = useState(initialNote?.strengths || "");
  const [weaknesses, setWeaknesses] = useState(initialNote?.weaknesses || "");
  const [studyPlan, setStudyPlan] = useState(initialNote?.study_plan || "");
  const [goals, setGoals] = useState(initialNote?.goals || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (role === "student" && !initialNote) return null;

  async function save() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: upsertError } = await supabase
      .from("mentor_session_notes")
      .upsert(
        {
          slot_id: slot.id,
          mentor_id: slot.mentor_id,
          student_id: slot.booked_by,
          discussion: discussion.trim() || null,
          strengths: strengths.trim() || null,
          weaknesses: weaknesses.trim() || null,
          study_plan: studyPlan.trim() || null,
          goals: goals.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "slot_id" }
      )
      .select()
      .single();
    setSaving(false);
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setNote(data as SessionNote);
    setEditing(false);
    setOpen(true);
    router.refresh();
  }

  return (
    <div className="mt-3 pl-12">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="text-xs text-brand-400 hover:text-brand-300">
          {note ? "View notes" : role === "mentor" ? "Add notes" : "No notes yet"}
        </button>
      ) : (
        <div className="card bg-slate-900/60 space-y-2">
          {role === "mentor" && editing ? (
            <>
              <div>
                <label className="label">Today&apos;s discussion</label>
                <textarea className="input" rows={2} value={discussion} onChange={(e) => setDiscussion(e.target.value)} />
              </div>
              <div>
                <label className="label">Student strengths</label>
                <textarea className="input" rows={2} value={strengths} onChange={(e) => setStrengths(e.target.value)} />
              </div>
              <div>
                <label className="label">Student weaknesses</label>
                <textarea className="input" rows={2} value={weaknesses} onChange={(e) => setWeaknesses(e.target.value)} />
              </div>
              <div>
                <label className="label">Study plan</label>
                <textarea className="input" rows={2} value={studyPlan} onChange={(e) => setStudyPlan(e.target.value)} />
              </div>
              <div>
                <label className="label">Goals before next session</label>
                <textarea className="input" rows={2} value={goals} onChange={(e) => setGoals(e.target.value)} />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="flex items-center gap-3">
                <button type="button" onClick={save} disabled={saving} className="btn-primary text-xs">
                  {saving ? "Saving..." : "Save notes"}
                </button>
                <button type="button" onClick={() => setEditing(false)} className="btn-secondary text-xs">
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              {note ? (
                <div className="space-y-2 text-sm">
                  {note.discussion && (
                    <p><span className="text-slate-500">Discussion:</span> {note.discussion}</p>
                  )}
                  {note.strengths && (
                    <p><span className="text-slate-500">Strengths:</span> {note.strengths}</p>
                  )}
                  {note.weaknesses && (
                    <p><span className="text-slate-500">Weaknesses:</span> {note.weaknesses}</p>
                  )}
                  {note.study_plan && (
                    <p><span className="text-slate-500">Study plan:</span> {note.study_plan}</p>
                  )}
                  {note.goals && (
                    <p><span className="text-slate-500">Goals before next session:</span> {note.goals}</p>
                  )}
                  {!note.discussion && !note.strengths && !note.weaknesses && !note.study_plan && !note.goals && (
                    <p className="text-slate-500">This note is empty.</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No notes written yet for this session.</p>
              )}
              <div className="flex items-center gap-3">
                {role === "mentor" && (
                  <button type="button" onClick={() => setEditing(true)} className="btn-secondary text-xs">
                    {note ? "Edit notes" : "Add notes"}
                  </button>
                )}
                <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:text-slate-300">
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function SessionsListClient({
  rows,
  role,
}: {
  rows: SessionRow[];
  role: "mentor" | "student";
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<{ id: string; message: string } | null>(null);

  async function cancelSession(slotId: string) {
    if (!confirm("Cancel this session? This can't be undone.")) return;
    setBusyId(slotId);
    setErrorId(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("mentor_slots")
      .update({ cancelled_at: new Date().toISOString(), cancelled_by: user?.id ?? null })
      .eq("id", slotId);
    setBusyId(null);
    if (error) {
      setErrorId({ id: slotId, message: error.message });
      return;
    }
    router.refresh();
  }

  const upcoming = rows.filter((r) => getSlotStatus(r.slot) === "upcoming");
  const past = rows
    .filter((r) => getSlotStatus(r.slot) !== "upcoming")
    .sort((a, b) => b.slot.start_time.localeCompare(a.slot.start_time));

  function renderRow(row: SessionRow) {
    const status = getSlotStatus(row.slot);
    return (
      <div key={row.slot.id} className="card py-3">
        <div className="flex items-center gap-3">
          {row.photoUrl ? (
            <img src={row.photoUrl} alt={row.title} className="w-9 h-9 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-brand-900/40 text-brand-300 text-xs font-bold flex items-center justify-center shrink-0">
              {row.title.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span className="font-semibold">{row.title}</span>
              {row.subtitle && <span className="text-slate-500"> ({row.subtitle})</span>}
              {" "}&middot;{" "}
              {formatSlotDate(row.slot.start_time)}, {formatSlotTime(row.slot.start_time)}&ndash;
              {formatSlotTime(row.slot.end_time)}
            </p>
            {row.note && <p className="text-xs text-slate-400 mt-1 italic">&ldquo;{row.note}&rdquo;</p>}
            {role === "mentor" && row.studentId && (
              <a href={`/mentorship/student/${row.studentId}`} className="text-xs text-brand-400 hover:text-brand-300">
                View student progress →
              </a>
            )}
          </div>
          <span className={`text-xs font-semibold rounded-full px-2.5 py-1 shrink-0 ${STATUS_STYLES[status]}`}>
            {STATUS_LABELS[status]}
          </span>
        </div>

        {status === "upcoming" && (
          <div className="flex items-center gap-3 mt-3 pl-12">
            {row.meetingLink && (
              <a
                href={row.meetingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary text-xs"
              >
                Join Meeting
              </a>
            )}
            {row.rescheduleMentorId && (
              <a href={`/mentorship/mentor/${row.rescheduleMentorId}`} className="btn-secondary text-xs">
                Reschedule
              </a>
            )}
            <button
              type="button"
              onClick={() => cancelSession(row.slot.id)}
              disabled={busyId === row.slot.id}
              className="text-xs text-red-400 hover:text-red-300"
            >
              {busyId === row.slot.id ? "Cancelling..." : "Cancel"}
            </button>
          </div>
        )}
        {status === "completed" && (
          <NotesSection slot={row.slot} role={role} initialNote={row.sessionNote ?? null} />
        )}
        {errorId?.id === row.slot.id && (
          <p className="text-xs text-red-400 mt-2 pl-12">{errorId.message}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-400">No upcoming sessions.</p>
        ) : (
          upcoming.map(renderRow)
        )}
      </div>

      {past.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Past</p>
          <div className="space-y-2">{past.map(renderRow)}</div>
        </div>
      )}
    </div>
  );
}
