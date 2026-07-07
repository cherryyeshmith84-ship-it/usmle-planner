"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CoachMessage, DailyLog, Profile, ScheduleTemplate } from "@/lib/types";

const STAGE_LABEL: Record<string, string> = {
  beginning: "Just starting",
  middle: "In the middle",
  end: "Final stretch",
};

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
}: {
  student: Profile;
  recentLogs: DailyLog[];
  templates: ScheduleTemplate[];
  initialMessages: CoachMessage[];
}) {
  const [assignedId, setAssignedId] = useState(student.assigned_template_id ?? "");
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignMsg, setAssignMsg] = useState<string | null>(null);

  const [messages, setMessages] = useState<CoachMessage[]>(initialMessages);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const matchingTemplates = templates.filter((t) => t.stage === student.prep_stage);
  const otherTemplates = templates.filter((t) => t.stage !== student.prep_stage);

  async function saveAssignment() {
    setAssignSaving(true);
    setAssignMsg(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ assigned_template_id: assignedId || null })
      .eq("id", student.id);
    setAssignSaving(false);
    setAssignMsg(error ? `Error: ${error.message}` : "Assigned.");
    setTimeout(() => setAssignMsg(null), 2500);
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
                </option>
              ))}
            </optgroup>
          )}
          {otherTemplates.length > 0 && (
            <optgroup label="Other stages">
              {otherTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({STAGE_LABEL[t.stage]})
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <div className="flex items-center gap-3">
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
      </div>

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
