"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  computeResourceAverages,
  dayNumberFor,
  getTemplateDays,
  tasksForDay,
  templateTasksToStudyTasks,
} from "@/lib/templateDays";
import type { BlockScore, CoachMessage, DailyLog, Profile, ScheduleTemplate } from "@/lib/types";

const STAGE_LABEL: Record<string, string> = {
  beginning: "Just starting",
  middle: "In the middle",
  end: "Final stretch",
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function ratingColor(rating: number | null) {
  if (rating === null) return "bg-slate-100 text-slate-500";
  if (rating >= 8) return "bg-green-100 text-green-700";
  if (rating >= 5) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

export default function AdminStudentDetail({
  student,
  recentLogs,
  templates,
  initialMessages,
  allBlockScores,
}: {
  student: Profile;
  recentLogs: DailyLog[];
  templates: ScheduleTemplate[];
  initialMessages: CoachMessage[];
  allBlockScores: BlockScore[];
}) {
  const router = useRouter();
  const [assignedId, setAssignedId] = useState(student.assigned_template_id ?? "");
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignMsg, setAssignMsg] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  const [messages, setMessages] = useState<CoachMessage[]>(initialMessages);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const matchingTemplates = templates.filter((t) => t.stage === student.prep_stage);
  const otherTemplates = templates.filter((t) => t.stage !== student.prep_stage);
  const resourceAverages = useMemo(() => computeResourceAverages(allBlockScores), [allBlockScores]);

  async function saveAssignment() {
    setAssignSaving(true);
    setAssignMsg(null);
    const supabase = createClient();
    const isNewAssignment = (student.assigned_template_id ?? "") !== assignedId;
    const payload: { assigned_template_id: string | null; assigned_template_start_date?: string | null } = {
      assigned_template_id: assignedId || null,
    };
    if (isNewAssignment) {
      payload.assigned_template_start_date = assignedId ? todayStr() : null;
    }
    const { error } = await supabase.from("profiles").update(payload).eq("id", student.id);
    setAssignSaving(false);
    setAssignMsg(error ? `Error: ${error.message}` : "Assigned.");
    setTimeout(() => setAssignMsg(null), 2500);
    if (!error) router.refresh();
  }

  async function pushTemplateToday() {
    const template = templates.find((t) => t.id === assignedId);
    if (!template) {
      setPushMsg("Pick and save a template above first.");
      setTimeout(() => setPushMsg(null), 3000);
      return;
    }
    setPushing(true);
    setPushMsg(null);
    const supabase = createClient();
    const today = todayStr();
    const isNewAssignment = (student.assigned_template_id ?? "") !== assignedId;
    const startDate = isNewAssignment ? today : student.assigned_template_start_date || today;
    const days = getTemplateDays(template);
    const dayNumber = dayNumberFor(startDate, today);
    const dayTasks = tasksForDay(days, dayNumber);
    const newTasks = templateTasksToStudyTasks(dayTasks);

    const { error: logError } = await supabase.from("daily_logs").upsert(
      {
        user_id: student.id,
        log_date: today,
        tasks: newTasks,
      },
      { onConflict: "user_id,log_date" }
    );
    if (!logError) {
      await supabase
        .from("profiles")
        .update({ assigned_template_id: template.id, assigned_template_start_date: startDate })
        .eq("id", student.id);
    }
    setPushing(false);
    setPushMsg(
      logError
        ? `Error: ${logError.message}`
        : `Pushed - Day ${dayNumber} of "${template.name}" now shows for them today.`
    );
    setTimeout(() => setPushMsg(null), 5000);
    if (!logError) router.refresh();
  }

  async function sendReply() {
    if (!reply.trim()) return;
    setSending(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("messages")
      .insert({ student_id: student.id, sender: "coach", body: reply.trim() })
      .select()
      .single();
    setSending(false);
    if (!error && data) {
      setMessages((prev) => [...prev, data as CoachMessage]);
      setReply("");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{student.full_name || student.email || "Student"}</h1>
        <p className="text-sm text-slate-500">{student.email}</p>
      </div>

      <div className="card grid sm:grid-cols-2 gap-4">
        <div>
          <p className="label">Prep stage</p>
          <p className="text-sm">{student.prep_stage ? STAGE_LABEL[student.prep_stage] : "Not set"}</p>
        </div>
        <div>
          <p className="label">Exam date</p>
          <p className="text-sm">{student.exam_date || "Not set"}</p>
        </div>
        <div>
          <p className="label">Daily hour goal</p>
          <p className="text-sm">{student.daily_hour_goal ? `${student.daily_hour_goal}h` : "Not set"}</p>
        </div>
        <div>
          <p className="label">Resources</p>
          <p className="text-sm">{student.resources?.length ? student.resources.join(", ") : "Not set"}</p>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Assign a schedule template</h2>
        <select
          className="input mb-3"
          value={assignedId}
          onChange={(e) => setAssignedId(e.target.value)}
        >
          <option value="">No template - use default plan for their stage</option>
          {matchingTemplates.length > 0 && (
            <optgroup label={`Matching their stage (${student.prep_stage ? STAGE_LABEL[student.prep_stage] : ""})`}>
              {matchingTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.hour_goal ? ` - ${t.hour_goal}h/day` : ""}
                  {t.remote_friendly ? " - remote friendly" : ""}
                  {` (${getTemplateDays(t).length} day${getTemplateDays(t).length === 1 ? "" : "s"})`}
                </option>
              ))}
            </optgroup>
          )}
          {otherTemplates.length > 0 && (
            <optgroup label="Other stages">
              {otherTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({STAGE_LABEL[t.stage]}, {getTemplateDays(t).length} day
                  {getTemplateDays(t).length === 1 ? "" : "s"})
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={saveAssignment} className="btn-primary" disabled={assignSaving}>
            {assignSaving ? "Saving..." : "Save assignment"}
          </button>
          {assignMsg && <span className="text-sm text-slate-500">{assignMsg}</span>}
        </div>
        {templates.length === 0 && (
          <p className="text-sm text-slate-500 mt-3">
            You haven&apos;t created any templates yet - go to Templates to add one.
          </p>
        )}

        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-sm text-slate-600 mb-2">
            Already assigned above but they don&apos;t see it? Their day may already be
            in progress. Push it in immediately, replacing today&apos;s task list:
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={pushTemplateToday}
              className="btn-secondary"
              disabled={pushing}
            >
              {pushing ? "Pushing..." : "Push this template to their day, right now"}
            </button>
            {pushMsg && <span className="text-sm text-slate-500">{pushMsg}</span>}
          </div>
        </div>
      </div>

      {resourceAverages.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-3">Score averages (all time)</h2>
          <div className="flex flex-wrap gap-3">
            {resourceAverages.map((r) => (
              <div key={r.resource} className="text-sm bg-slate-50 rounded-lg px-3 py-2">
                <span className="font-semibold">{r.resource}:</span> {r.averagePct}%{" "}
                <span className="text-slate-400">
                  ({r.totalCorrect}/{r.totalQuestions})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="font-semibold mb-3">Recent days (last 14)</h2>
        {recentLogs.length === 0 && (
          <p className="text-sm text-slate-500">No logged days yet.</p>
        )}
        <div className="space-y-2">
          {recentLogs.map((log) => {
            const done = log.tasks.filter((t) => t.status === "done").length;
            return (
              <div key={log.id} className="border border-slate-200 rounded-xl px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{log.log_date}</span>
                  <span className={`text-xs font-semibold rounded-full px-2 py-1 ${ratingColor(log.rating)}`}>
                    {log.rating !== null ? `${log.rating}/10` : "not rated"}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {log.hours_studied ?? "?"}h &middot; {done}/{log.tasks.length} tasks done
                  {log.topics_skipped ? ` · skipped: ${log.topics_skipped}` : ""}
                </p>
                {log.block_scores?.length > 0 && (
                  <p className="text-xs text-slate-500 mt-1">
                    {log.block_scores
                      .map((b) => `${b.resource} ${b.question_count}q, ${b.percent_correct}%`)
                      .join(" · ")}
                  </p>
                )}
                {log.notes && <p className="text-xs text-slate-500 italic mt-1">&ldquo;{log.notes}&rdquo;</p>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Messages</h2>
        <div className="space-y-2 mb-4 max-h-80 overflow-y-auto">
          {messages.length === 0 && (
            <p className="text-sm text-slate-500">No messages yet - start the conversation below.</p>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`text-sm rounded-xl px-3 py-2 max-w-[80%] ${
                m.sender === "coach"
                  ? "bg-brand-50 text-brand-800 ml-auto"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              <p>{m.body}</p>
              <p className="text-[11px] opacity-60 mt-1">
                {m.sender === "coach" ? "You" : "Student"} &middot;{" "}
                {new Date(m.created_at).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Write a message to this student..."
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendReply();
            }}
          />
          <button type="button" onClick={sendReply} className="btn-primary" disabled={sending}>
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
