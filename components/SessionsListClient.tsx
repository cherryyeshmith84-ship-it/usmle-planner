"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  formatSlotDate,
  formatSlotTime,
  getSlotStatus,
  meetingLiveStatus,
  type MentorSlot,
  type SessionNote,
  type SessionFeedback,
} from "@/lib/mentors";
import { nyWallTimeToUtcIso, utcIsoToNyWallParts } from "@/lib/timezone";

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
  // The student's rating/feedback for this slot, if one already exists -
  // students can write/edit their own, mentors can only view it.
  feedback?: SessionFeedback | null;
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

/**
 * Post-session feedback for one completed session - a student can rate it
 * 1-5 stars, say whether they'd recommend the mentor, and leave an optional
 * comment. Only the student can write it (RLS: "Student manages own
 * feedback"); the mentor it's about can only ever view it ("Mentor views
 * own session feedback"). One row per slot, upserted on slot_id, same
 * pattern as NotesSection above.
 */
function FeedbackSection({
  slot,
  role,
  initialFeedback,
}: {
  slot: MentorSlot;
  role: "mentor" | "student";
  initialFeedback: SessionFeedback | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState(initialFeedback);
  const [rating, setRating] = useState(initialFeedback?.rating || 0);
  const [helpful, setHelpful] = useState<boolean | null>(initialFeedback?.helpful ?? null);
  const [comment, setComment] = useState(initialFeedback?.comment || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (role === "mentor" && !initialFeedback) return null;

  async function save() {
    if (rating < 1) {
      setError("Please pick a star rating.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error: upsertError } = await supabase
      .from("mentor_session_feedback")
      .upsert(
        {
          slot_id: slot.id,
          mentor_id: slot.mentor_id,
          student_id: user?.id,
          rating,
          helpful,
          comment: comment.trim() || null,
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
    setFeedback(data as SessionFeedback);
    setEditing(false);
    setOpen(true);
    router.refresh();
  }

  return (
    <div className="mt-3 pl-12">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="text-xs text-brand-400 hover:text-brand-300">
          {feedback
            ? role === "mentor"
              ? "View student feedback"
              : "View your rating"
            : role === "student"
            ? "Rate this session"
            : ""}
        </button>
      ) : (
        <div className="card bg-slate-900/60 space-y-2">
          {role === "student" && editing ? (
            <>
              <div>
                <label className="label">How helpful was this session?</label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      className={`text-xl leading-none ${n <= rating ? "text-yellow-400" : "text-slate-700"}`}
                      aria-label={`${n} star${n > 1 ? "s" : ""}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Would you recommend this mentor?</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setHelpful(true)}
                    className={helpful === true ? "btn-primary text-xs" : "btn-secondary text-xs"}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setHelpful(false)}
                    className={helpful === false ? "btn-primary text-xs" : "btn-secondary text-xs"}
                  >
                    No
                  </button>
                </div>
              </div>
              <div>
                <label className="label">Comments (optional)</label>
                <textarea className="input" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="flex items-center gap-3">
                <button type="button" onClick={save} disabled={saving} className="btn-primary text-xs">
                  {saving ? "Saving..." : "Submit feedback"}
                </button>
                <button type="button" onClick={() => setEditing(false)} className="btn-secondary text-xs">
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              {feedback ? (
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="text-slate-500">Rating:</span> {"★".repeat(feedback.rating)}
                    {"☆".repeat(5 - feedback.rating)}
                  </p>
                  {feedback.helpful != null && (
                    <p>
                      <span className="text-slate-500">Would recommend:</span> {feedback.helpful ? "Yes" : "No"}
                    </p>
                  )}
                  {feedback.comment && (
                    <p>
                      <span className="text-slate-500">Comment:</span> {feedback.comment}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No feedback submitted yet.</p>
              )}
              <div className="flex items-center gap-3">
                {role === "student" && (
                  <button type="button" onClick={() => setEditing(true)} className="btn-secondary text-xs">
                    {feedback ? "Edit rating" : "Rate this session"}
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

/**
 * Join Meeting button + Live/Waiting badge for one upcoming row. onJoin
 * fires (fire-and-forget) the moment this person clicks, recording their
 * own join timestamp - the badge only ever turns "Live" once BOTH sides'
 * timestamps are set (see lib/mentors.ts's meetingLiveStatus). joinFields
 * comes from the parent's poll (see SessionsListClient below) rather than
 * straight off row.slot, so the OTHER person's click - which this browser
 * has no other way to know about - still shows up without a manual reload.
 */
function MeetingJoinControls({
  meetingLink,
  slot,
  joinFields,
  onJoin,
}: {
  meetingLink: string;
  slot: Pick<MentorSlot, "start_time" | "end_time">;
  joinFields: { mentor_joined_at: string | null; student_joined_at: string | null };
  onJoin: () => void;
}) {
  const status = meetingLiveStatus({ ...slot, ...joinFields });
  return (
    <>
      <a href={meetingLink} target="_blank" rel="noopener noreferrer" onClick={onJoin} className="btn-primary text-xs">
        Join Meeting
      </a>
      {status === "live" && (
        <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-green-900/40 text-green-400">
          ● Live
        </span>
      )}
      {status === "waiting" && (
        <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-yellow-900/40 text-yellow-400">
          Waiting for both to join
        </span>
      )}
    </>
  );
}

/**
 * Mentor-only reschedule control for an upcoming session. Previously a
 * mentor could only Cancel a student's booking, never move it to a new
 * time - the "edit" flow on the mentor's own Availability page explicitly
 * only works on OPEN slots (saveEditSlot's `is_booked=false` guard in
 * MentorAvailabilityClient.tsx), so a booked session had no reschedule path
 * at all. This updates the SAME slot row's start_time/end_time (booked_by,
 * notes, feedback - everything else about the session stays attached to
 * the same row, nothing is deleted/recreated), then pings the student
 * through relationship-update so it shows up both in their notification
 * bell and as an on-screen popup (see SessionAlertPopup.tsx) - not just
 * something they'd stumble onto if they happened to reopen this page.
 */
function RescheduleForm({ slot, onDone }: { slot: MentorSlot; onDone: () => void }) {
  const router = useRouter();
  const startParts = utcIsoToNyWallParts(slot.start_time);
  const endParts = utcIsoToNyWallParts(slot.end_time);
  const [date, setDate] = useState(startParts.date);
  const [startTime, setStartTime] = useState(startParts.time);
  const [endTime, setEndTime] = useState(endParts.time);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!date || !startTime || !endTime) {
      setError("Pick a date, start time, and end time.");
      return;
    }
    const newStart = new Date(nyWallTimeToUtcIso(date, startTime));
    const newEnd = new Date(nyWallTimeToUtcIso(date, endTime));
    if (newEnd <= newStart) {
      setError("End time has to be after the start time.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const oldDateLabel = formatSlotDate(slot.start_time);
    const oldTimeLabel = `${formatSlotTime(slot.start_time)}–${formatSlotTime(slot.end_time)}`;
    const { error: updateError } = await supabase
      .from("mentor_slots")
      .update({ start_time: newStart.toISOString(), end_time: newEnd.toISOString() })
      .eq("id", slot.id);
    if (updateError) {
      setSaving(false);
      setError(updateError.message);
      return;
    }
    setSaving(false);

    // Fire-and-forget notification to the student - a failure here
    // shouldn't block the reschedule itself, which already succeeded above.
    if (slot.booked_by) {
      fetch("/api/notifications/relationship-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mentorId: slot.mentor_id,
          studentId: slot.booked_by,
          type: "session_rescheduled",
          title: "Your mentor rescheduled your session",
          detail: `Was ${oldDateLabel}, ${oldTimeLabel} → now ${formatSlotDate(
            newStart.toISOString()
          )}, ${formatSlotTime(newStart.toISOString())}–${formatSlotTime(newEnd.toISOString())}.`,
          link: "/mentorship/sessions",
        }),
      }).catch(() => {});
    }

    onDone();
    router.refresh();
  }

  return (
    <div className="mt-3 pl-12 card bg-slate-900/60 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="label">Date</label>
          <input type="date" className="input text-sm py-1.5" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Start</label>
          <input
            type="time"
            className="input text-sm py-1.5"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div>
          <label className="label">End</label>
          <input type="time" className="input text-sm py-1.5" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="btn-primary text-xs">
          {saving ? "Saving..." : "Save new time"}
        </button>
        <button type="button" onClick={onDone} className="btn-secondary text-xs">
          Cancel
        </button>
      </div>
      <p className="text-[11px] text-slate-500">The student will be notified of the new time.</p>
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
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  // Live/Waiting join state per slot id, seeded from each row's own slot and
  // refreshed on a poll below - same "plain poll, no Realtime" tradeoff as
  // NotificationsBell/SessionAlertPopup elsewhere in the app, so this
  // browser can pick up the OTHER person's join click without a reload.
  const [joinState, setJoinState] = useState<
    Record<string, { mentor_joined_at: string | null; student_joined_at: string | null }>
  >(() =>
    Object.fromEntries(
      rows.map((r) => [r.slot.id, { mentor_joined_at: r.slot.mentor_joined_at ?? null, student_joined_at: r.slot.student_joined_at ?? null }])
    )
  );

  useEffect(() => {
    const watchIds = rows
      .filter((r) => getSlotStatus(r.slot) === "upcoming" && r.meetingLink)
      .map((r) => r.slot.id);
    if (watchIds.length === 0) return;
    let cancelled = false;
    async function poll() {
      const supabase = createClient();
      const { data } = await supabase
        .from("mentor_slots")
        .select("id, mentor_joined_at, student_joined_at")
        .in("id", watchIds);
      if (cancelled || !data) return;
      setJoinState((prev) => {
        const next = { ...prev };
        for (const s of data as { id: string; mentor_joined_at: string | null; student_joined_at: string | null }[]) {
          next[s.id] = { mentor_joined_at: s.mentor_joined_at, student_joined_at: s.student_joined_at };
        }
        return next;
      });
    }
    poll();
    const interval = setInterval(poll, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  async function markJoined(slotId: string) {
    const column = role === "mentor" ? "mentor_joined_at" : "student_joined_at";
    const now = new Date().toISOString();
    // Optimistic - this browser's own click should reflect immediately
    // rather than waiting on the next 20s poll.
    setJoinState((prev) => ({
      ...prev,
      [slotId]: { ...prev[slotId], [column]: now } as { mentor_joined_at: string | null; student_joined_at: string | null },
    }));
    const supabase = createClient();
    await supabase.from("mentor_slots").update({ [column]: now }).eq("id", slotId);
  }

  async function cancelSession(row: SessionRow) {
    if (!confirm("Cancel this session? This can't be undone.")) return;
    const slotId = row.slot.id;
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

    // Fire-and-forget notification to whichever side didn't do the
    // cancelling - a failure here shouldn't block the cancellation itself,
    // which already succeeded above. Uses the slot's own mentor_id/
    // booked_by (always present regardless of role) rather than anything
    // role-specific, so this works the same whether a mentor or a student
    // triggered it.
    if (row.slot.booked_by) {
      fetch("/api/notifications/relationship-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mentorId: row.slot.mentor_id,
          studentId: row.slot.booked_by,
          type: "session_cancelled",
          title: role === "mentor" ? "Your mentor cancelled a session" : "A student cancelled a session",
          detail: `${formatSlotDate(row.slot.start_time)}, ${formatSlotTime(row.slot.start_time)}–${formatSlotTime(
            row.slot.end_time
          )}`,
          link: "/mentorship/sessions",
        }),
      }).catch(() => {});
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
          <>
            <div className="flex items-center gap-3 mt-3 pl-12 flex-wrap">
              {row.meetingLink && (
                <MeetingJoinControls
                  meetingLink={row.meetingLink}
                  slot={row.slot}
                  joinFields={
                    joinState[row.slot.id] ?? {
                      mentor_joined_at: row.slot.mentor_joined_at ?? null,
                      student_joined_at: row.slot.student_joined_at ?? null,
                    }
                  }
                  onJoin={() => markJoined(row.slot.id)}
                />
              )}
              {/* Student's own reschedule path - browse this mentor's other
                  open slots and book one instead. Unrelated to the mentor's
                  reschedule button below (which moves THIS slot's time
                  directly), so both can coexist without conflicting. */}
              {row.rescheduleMentorId && (
                <a href={`/mentorship/mentor/${row.rescheduleMentorId}`} className="btn-secondary text-xs">
                  Reschedule
                </a>
              )}
              {role === "mentor" && (
                <button
                  type="button"
                  onClick={() => setReschedulingId(reschedulingId === row.slot.id ? null : row.slot.id)}
                  className="btn-secondary text-xs"
                >
                  {reschedulingId === row.slot.id ? "Close" : "Reschedule"}
                </button>
              )}
              <button
                type="button"
                onClick={() => cancelSession(row)}
                disabled={busyId === row.slot.id}
                className="text-xs text-red-400 hover:text-red-300"
              >
                {busyId === row.slot.id ? "Cancelling..." : "Cancel"}
              </button>
            </div>
            {role === "mentor" && reschedulingId === row.slot.id && (
              <RescheduleForm slot={row.slot} onDone={() => setReschedulingId(null)} />
            )}
          </>
        )}
        {status === "completed" && (
          <>
            <NotesSection slot={row.slot} role={role} initialNote={row.sessionNote ?? null} />
            <FeedbackSection slot={row.slot} role={role} initialFeedback={row.feedback ?? null} />
          </>
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
