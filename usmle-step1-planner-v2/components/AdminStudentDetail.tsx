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
  type PlanProgress,
  type RoadmapEntry,
} from "@/lib/templateDays";
import type { BlockScore, CoachMessage, DailyLog, Profile, ScheduleTemplate } from "@/lib/types";
import PlannerRoadmap from "@/components/PlannerRoadmap";
import ProgressCircle from "@/components/ProgressCircle";

const STAGE_LABEL: Record<string, string> = {
  beginning: "Just starting",
  middle: "In the middle",
  end: "Final stretch",
};

function templateMatchesStudent(t: ScheduleTemplate, student: Profile): boolean {
  const studentTrack = student.exam_track || "step1";
  const templateTrack = t.exam_track || "step1";
  if (templateTrack !== studentTrack) return false;
  if (studentTrack === "subject") {
    if (!t.subject_name || !student.subject_name) return true;
    return t.subject_name.trim().toLowerCase() === student.subject_name.trim().toLowerCase();
  }
  return t.stage === student.prep_stage;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function ratingColor(rating: number | null) {
  if (rating === null) return "bg-slate-800 text-slate-400";
  if (rating >= 8) return "bg-green-900/40 text-green-400";
  if (rating >= 5) return "bg-amber-900/40 text-amber-400";
  return "bg-red-900/40 text-red-400";
}

export default function AdminStudentDetail({
  student,
  recentLogs,
  templates,
  initialMessages,
  allBlockScores,
  roadmap,
  today,
  planProgress,
}: {
  student: Profile;
  recentLogs: DailyLog[];
  templates: ScheduleTemplate[];
  initialMessages: CoachMessage[];
  allBlockScores: BlockScore[];
  roadmap: RoadmapEntry[];
  today: string;
  planProgress: PlanProgress | null;
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

  const matchingTemplates = templates.filter((t) => templateMatchesStudent(t, student));
  const otherTemplates = templates.filter((t) => !templateMatchesStudent(t, student));
  const resourceAverages = useMemo(() => computeResourceAverages(allBlockScores), [allBlockScores]);

  async function saveAssignment() {
    setAssignSaving(true);
    setAssignMsg(null);
    const supabase = createClient();
    const isNewAssignment = (student.assigned_template_id ?? "") !== assignedId;
    const payload: {
      assigned_template_id: string | null;
      assigned_template_start_date?: string | null;
      track_changed_pending?: boolean;
    } = {
      assigned_template_id: assignedId || null,
    };
    if (isNewAssignment) {
      payload.assigned_template_start_date = assignedId ? todayStr() : null;
    }
    if (student.track_changed_pending) {
      payload.track_changed_pending = false;
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
        .update({
          assigned_template_id: template.id,
          assigned_template_start_date: startDate,
          ...(student.track_changed_pending ? { track_changed_pending: false } : {}),
        })
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
        <p className="text-sm text-slate-400">{student.email}</p>
      </div>

      {student.track_changed_pending && (
        <div className="rounded-xl border border-amber-700 bg-amber-900/20 px-4 py-3 text-sm text-amber-300">
          This student recently switched their exam track (see message below). Their
          current plan may no longer fit - review and reassign a template below.
        </div>
      )}

      <div className="card grid sm:grid-cols-2 gap-4">
        <div>
          <p className="label">Track</p>
          <p className="text-sm">
            {student.exam_track === "subject"
              ? `Subject exams${student.subject_name ? ` - ${student.subject_name}` : ""}`
              : "Step 1 (CBSE)"}
          </p>
        </div>
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

      {(student.completed_so_far || student.strong_areas || student.weak_areas || student.goals_notes) && (
        <div className="card space-y-3">
          <h2 className="font-semibold">Intake details</h2>
          {student.completed_so_far && (
            <div>
              <p className="label">Completed so far</p>
              <p className="text-sm text-slate-300">{student.completed_so_far}</p>
            </div>
          )}
          {student.strong_areas && (
            <div>
              <p className="label">Strong in</p>
              <p className="text-sm text-slate-300">{student.strong_areas}</p>
            </div>
          )}
          {student.weak_areas && (
            <div>
              <p className="label">Struggling with</p>
              <p className="text-sm text-slate-300">{student.weak_areas}</p>
            </div>
          )}
          {student.goals_notes && (
            <div>
              <p className="label">Goals / wants</p>
              <p className="text-sm text-slate-300">{student.goals_notes}</p>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h2 className="font-semibold mb-3">Assign a schedule template</h2>
        <select
          className="input mb-3"
          value={assignedId}
          onChange={(e) => setAssignedId(e.target.value)}
        >
          <option value="">No template - use default plan for their stage</option>
          {matchingTemplates.length > 0 && (
            <optgroup
              label={`Matching this student (${
                student.exam_track === "subject"
                  ? `Subject${student.subject_name ? `: ${student.subject_name}` : ""}`
                  : student.prep_stage
                  ? STAGE_LABEL[student.prep_stage]
                  : "Step 1"
              })`}
            >
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
            <optgroup label="Other templates">
              {otherTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (
                  {t.exam_track === "subject"
                    ? `Subject${t.subject_name ? `: ${t.subject_name}` : ""}`
                    : STAGE_LABEL[t.stage]}
                  , {getTemplateDays(t).length} day
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
          {assignMsg && <span className="text-sm text-slate-400">{assignMsg}</span>}
        </div>
        {templates.length === 0 && (
          <p className="text-sm text-slate-400 mt-3">
            You haven&apos;t created any templates yet - go to Templates to add one.
          </p>
        )}

        <div className="mt-4 pt-4 border-t border-slate-800">
          <p className="text-sm text-slate-300 mb-2">
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
            {pushMsg && <span className="text-sm text-slate-400">{pushMsg}</span>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-start justify-between gap-4 mb-1 flex-wrap">
          <div>
            <h2 className="font-semibold mb-1">Full plan roadmap</h2>
            <p className="text-sm text-slate-400">
              Everything assigned so far - Day 1 through Day {roadmap.length || 0} - with
              completion status per day.
            </p>
          </div>
          {planProgress && (
            <ProgressCircle
              pct={planProgress.pct}
              complete={planProgress.complete}
              label={`${planProgress.doneCount}/${planProgress.totalCount} tasks`}
            />
          )}
        </div>
        <div className="mt-4">
          <PlannerRoadmap entries={roadmap} today={today} />
        </div>
      </div>

      {resourceAverages.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-3">Score averages (all time)</h2>
          <div className="flex flex-wrap gap-3">
            {resourceAverages.map((r) => (
              <div key={r.resource} className="text-sm bg-slate-800 rounded-lg px-3 py-2">
                <span className="font-semibold">{r.resource}:</span> {r.averagePct}%{" "}
                <span className="text-slate-500">
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
          <p className="text-sm text-slate-400">No logged days yet.</p>
        )}
        <div className="space-y-2">
          {recentLogs.map((log) => {
            const done = log.tasks.filter((t) => t.status === "done").length;
            return (
              <div key={log.id} className="border border-slate-700 rounded-xl px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{log.log_date}</span>
                  <span className={`text-xs font-semibold rounded-full px-2 py-1 ${ratingColor(log.rating)}`}>
                    {log.rating !== null ? `${log.rating}/10` : "not rated"}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  {log.hours_studied ?? "?"}h &middot; {done}/{log.tasks.length} tasks done
                  {log.topics_skipped ? ` · skipped: ${log.topics_skipped}` : ""}
                </p>
                {log.block_scores?.length > 0 && (
                  <p className="text-xs text-slate-400 mt-1">
                    {log.block_scores
                      .map((b) => `${b.resource} ${b.question_count}q, ${b.percent_correct}%`)
                      .join(" · ")}
                  </p>
                )}
                {log.notes && <p className="text-xs text-slate-400 italic mt-1">&ldquo;{log.notes}&rdquo;</p>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Messages</h2>
        <div className="space-y-2 mb-4 max-h-80 overflow-y-auto">
          {messages.length === 0 && (
            <p className="text-sm text-slate-400">No messages yet - start the conversation below.</p>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`text-sm rounded-xl px-3 py-2 max-w-[80%] ${
                m.sender === "coach"
                  ? "bg-brand-900/40 text-brand-200 ml-auto"
                  : "bg-slate-800 text-slate-200"
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
