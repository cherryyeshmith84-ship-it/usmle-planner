"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { defaultTasksForStage } from "@/lib/defaultTasks";
import type {
  AiFeedback,
  CoachMessage,
  DailyLog,
  Profile,
  ScheduleTemplate,
  StudyTask,
  TaskStatus,
} from "@/lib/types";
import NavBar from "@/components/NavBar";

function newTaskId() {
  return Math.random().toString(36).slice(2, 10);
}

function seedTasks(
  todayLog: DailyLog | null,
  profile: Profile,
  assignedTemplate: ScheduleTemplate | null
): StudyTask[] {
  // If today's log already has real progress on it (a task marked done/skipped,
  // hours/notes/rating saved, or it's been marked complete), don't yank it out
  // from under the student mid-day just because the coach assigned a new
  // template - keep what they're actively working on.
  const hasProgress =
    !!todayLog &&
    (todayLog.tasks.some((t) => t.status !== "pending") ||
      !!todayLog.hours_studied ||
      !!todayLog.notes ||
      !!todayLog.ai_feedback ||
      todayLog.marked_complete);

  if (todayLog?.tasks?.length && hasProgress) return todayLog.tasks;

  // No real progress yet today (or no log at all) - a freshly assigned
  // template should take effect immediately.
  if (assignedTemplate?.tasks?.length) {
    return assignedTemplate.tasks.map((t) => ({
      id: newTaskId(),
      title: t.title,
      resource: t.resource,
      target: t.target,
      status: "pending" as TaskStatus,
    }));
  }

  if (todayLog?.tasks?.length) return todayLog.tasks;

  return defaultTasksForStage(profile.prep_stage);
}

export default function DashboardClient({
  userId,
  profile,
  todayLog,
  recentLogs,
  today,
  streak,
  daysUntilExam,
  assignedTemplate,
  initialMessages,
}: {
  userId: string;
  profile: Profile;
  todayLog: DailyLog | null;
  recentLogs: DailyLog[];
  today: string;
  streak: number;
  daysUntilExam: number | null;
  assignedTemplate: ScheduleTemplate | null;
  initialMessages: CoachMessage[];
}) {
  const [tasks, setTasks] = useState<StudyTask[]>(
    seedTasks(todayLog, profile, assignedTemplate)
  );
  const [hours, setHours] = useState(todayLog?.hours_studied?.toString() ?? "");
  const [topicsSkipped, setTopicsSkipped] = useState(todayLog?.topics_skipped ?? "");
  const [notes, setNotes] = useState(todayLog?.notes ?? "");
  const [rating, setRating] = useState(todayLog?.rating ?? 5);
  const [markedComplete, setMarkedComplete] = useState(todayLog?.marked_complete ?? false);
  const [aiFeedback, setAiFeedback] = useState<AiFeedback | null>(todayLog?.ai_feedback ?? null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newResource, setNewResource] = useState("UWorld");
  const [newTarget, setNewTarget] = useState("");

  const [messages, setMessages] = useState<CoachMessage[]>(initialMessages);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  async function sendMessage() {
    if (!reply.trim()) return;
    setSending(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("messages")
      .insert({ student_id: userId, sender: "student", body: reply.trim() })
      .select()
      .single();
    setSending(false);
    if (!error && data) {
      setMessages((prev) => [...prev, data as CoachMessage]);
      setReply("");
    }
  }

  const doneCount = tasks.filter((t) => t.status === "done").length;
  const progressPct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  function cycleStatus(id: string) {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const order: TaskStatus[] = ["pending", "done", "skipped"];
        const next = order[(order.indexOf(t.status) + 1) % order.length];
        return { ...t, status: next };
      })
    );
  }

  function removeTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function addTask() {
    if (!newTitle.trim()) return;
    setTasks((prev) => [
      ...prev,
      {
        id: newTaskId(),
        title: newTitle.trim(),
        resource: newResource,
        target: newTarget.trim(),
        status: "pending",
      },
    ]);
    setNewTitle("");
    setNewTarget("");
  }

  async function saveProgress() {
    setSaving(true);
    setSaveMsg(null);
    const supabase = createClient();
    const { error } = await supabase.from("daily_logs").upsert(
      {
        user_id: userId,
        log_date: today,
        tasks,
        hours_studied: hours ? Number(hours) : null,
        topics_skipped: topicsSkipped || null,
        notes: notes || null,
        rating,
        marked_complete: markedComplete,
        ai_feedback: aiFeedback,
      },
      { onConflict: "user_id,log_date" }
    );
    setSaving(false);
    setSaveMsg(error ? `Error: ${error.message}` : "Saved.");
    setTimeout(() => setSaveMsg(null), 2500);
  }

  async function getAiFeedback() {
    setAiLoading(true);
    setAiError(null);
    try {
      await saveProgress();
      const res = await fetch("/api/ai-coach", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Something went wrong.");
      setAiFeedback(json.feedback);
    } catch (e: any) {
      setAiError(e.message || "Couldn't get AI feedback. Try again.");
    } finally {
      setAiLoading(false);
    }
  }

  const examLine = useMemo(() => {
    if (daysUntilExam === null) return "No exam date set";
    if (daysUntilExam < 0) return "Exam date has passed";
    if (daysUntilExam === 0) return "Exam is today - good luck!";
    return `${daysUntilExam} day${daysUntilExam === 1 ? "" : "s"} until exam`;
  }, [daysUntilExam]);

  return (
    <div className="min-h-screen">
      <NavBar isAdmin={profile.is_admin} />
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className="grid sm:grid-cols-4 gap-4">
          <StatCard label="Streak" value={`${streak} day${streak === 1 ? "" : "s"}`} />
          <StatCard label="Countdown" value={examLine} />
          <StatCard label="Today's tasks" value={`${doneCount}/${tasks.length} done`} />
          <StatCard label="Daily goal" value={profile.daily_hour_goal ? `${profile.daily_hour_goal}h` : "not set"} />
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">Today &middot; {today}</h2>
            <span className="text-sm text-slate-500">{progressPct}% complete</span>
          </div>

          <ul className="space-y-2 mb-4">
            {tasks.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 border border-slate-200 rounded-xl px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => cycleStatus(t.id)}
                  className={`shrink-0 text-xs font-bold rounded-full px-2.5 py-1 min-w-[76px] text-center ${
                    t.status === "done"
                      ? "bg-green-100 text-green-700"
                      : t.status === "skipped"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {t.status === "done" ? "Done" : t.status === "skipped" ? "Skipped" : "Pending"}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.title}</p>
                  <p className="text-xs text-slate-500">
                    {t.resource}
                    {t.target ? ` · ${t.target}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeTask(t.id)}
                  className="text-slate-400 hover:text-red-500 text-sm px-2"
                  aria-label="Remove task"
                >
                  &times;
                </button>
              </li>
            ))}
            {tasks.length === 0 && (
              <p className="text-sm text-slate-500">No tasks yet - add one below.</p>
            )}
          </ul>

          <div className="flex flex-wrap gap-2 items-center border-t border-slate-100 pt-4">
            <input
              className="input flex-1 min-w-[160px]"
              placeholder="Add a task (e.g. UWorld cardio block)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <select
              className="input w-auto"
              value={newResource}
              onChange={(e) => setNewResource(e.target.value)}
            >
              {["UWorld", "Sketchy", "Boards & Beyond", "Pathoma", "Anki", "NBME/UWSA", "Other"].map(
                (r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                )
              )}
            </select>
            <input
              className="input w-32"
              placeholder="Target"
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
            />
            <button type="button" onClick={addTask} className="btn-secondary">
              Add
            </button>
          </div>
        </div>

        <div className="card grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Hours studied today</label>
            <input
              type="number"
              min={0}
              max={20}
              step={0.5}
              className="input"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Topics / tasks you skipped (optional)</label>
            <input
              className="input"
              placeholder="e.g. skipped renal Anki cards"
              value={topicsSkipped}
              onChange={(e) => setTopicsSkipped(e.target.value)}
            />
          </div>
        </div>

        <div className="card">
          <h2 className="font-bold text-lg mb-4">End of day reflection</h2>
          <label className="label">Notes - how did today actually go?</label>
          <textarea
            className="input mb-4"
            rows={4}
            placeholder="Write a quick note about today..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <label className="label">
            Self-rating: quality/completion (0 = rough day, 10 = crushed it) - {rating}/10
          </label>
          <input
            type="range"
            min={0}
            max={10}
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
            className="w-full mb-4"
          />
          <label className="flex items-center gap-2 mb-4 text-sm font-medium">
            <input
              type="checkbox"
              checked={markedComplete}
              onChange={(e) => setMarkedComplete(e.target.checked)}
            />
            Mark today as a completed study day (counts toward your streak)
          </label>

          <div className="flex items-center gap-3">
            <button type="button" onClick={saveProgress} className="btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save today's progress"}
            </button>
            {saveMsg && <span className="text-sm text-slate-500">{saveMsg}</span>}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-lg">AI coach</h2>
            <button
              type="button"
              onClick={getAiFeedback}
              className="btn-secondary"
              disabled={aiLoading}
            >
              {aiLoading ? "Thinking..." : "Get today's AI feedback"}
            </button>
          </div>
          {aiError && <p className="text-sm text-red-600 mb-2">{aiError}</p>}
          {aiFeedback ? (
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-semibold text-slate-800 mb-1">Today's review</p>
                <p className="text-slate-600">{aiFeedback.review}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-800 mb-1">Plan for tomorrow</p>
                <p className="text-slate-600">{aiFeedback.plan}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Save your progress for today, then click above to get a review of
              today and a concrete plan for tomorrow.
            </p>
          )}
        </div>

        <div className="card">
          <h2 className="font-bold text-lg mb-3">Messages from your coach</h2>
          <div className="space-y-2 mb-4 max-h-80 overflow-y-auto">
            {messages.length === 0 && (
              <p className="text-sm text-slate-500">
                No messages yet. If something about your plan isn&apos;t working, say so here.
              </p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`text-sm rounded-xl px-3 py-2 max-w-[80%] ${
                  m.sender === "student"
                    ? "bg-brand-50 text-brand-800 ml-auto"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                <p>{m.body}</p>
                <p className="text-[11px] opacity-60 mt-1">
                  {m.sender === "student" ? "You" : "Coach"} &middot;{" "}
                  {new Date(m.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="Message your coach..."
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendMessage();
              }}
            />
            <button type="button" onClick={sendMessage} className="btn-primary" disabled={sending}>
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card py-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-bold mt-1">{value}</p>
    </div>
  );
}
