"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { dayNumberFor, getTemplateDays, tasksForDay, templateTasksToStudyTasks } from "@/lib/templateDays";
import type { ExamTrack, PrepStage, ScheduleTemplate, TemplateDay, TemplateTask } from "@/lib/types";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const RESOURCE_OPTIONS = [
  "UWorld",
  "Sketchy Micro",
  "Sketchy Pharm",
  "Boards & Beyond",
  "Pathoma",
  "Anki (AnKing deck)",
  "First Aid",
  "NBME/UWSA practice exams",
  "Amboss",
];

const TASK_RESOURCE_OPTIONS = [
  "UWorld",
  "Sketchy",
  "Boards & Beyond",
  "Pathoma",
  "Anki",
  "NBME/UWSA",
  "Other",
];

function blankTask(): TemplateTask {
  return { title: "", resource: "UWorld", target: "" };
}

function renumber(days: TemplateDay[]): TemplateDay[] {
  return days.map((d, i) => ({ ...d, day_number: i + 1 }));
}

export default function TemplateForm({
  initial,
  userId,
}: {
  initial?: ScheduleTemplate;
  userId: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [examTrack, setExamTrack] = useState<ExamTrack>(initial?.exam_track ?? "step1");
  const [subjectName, setSubjectName] = useState(initial?.subject_name ?? "");
  const [stage, setStage] = useState<PrepStage>(initial?.stage ?? "beginning");
  const [hourGoal, setHourGoal] = useState(initial?.hour_goal?.toString() ?? "");
  const [resourceTags, setResourceTags] = useState<string[]>(initial?.resource_tags ?? []);
  const [remoteFriendly, setRemoteFriendly] = useState(initial?.remote_friendly ?? false);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [days, setDays] = useState<TemplateDay[]>(() => {
    const existing = initial ? getTemplateDays(initial) : [];
    return existing.length ? existing : [{ day_number: 1, tasks: [blankTask()] }];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTag(tag: string) {
    setResourceTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function updateTask(dayIdx: number, taskIdx: number, patch: Partial<TemplateTask>) {
    setDays((prev) =>
      prev.map((d, di) =>
        di !== dayIdx
          ? d
          : { ...d, tasks: d.tasks.map((t, ti) => (ti === taskIdx ? { ...t, ...patch } : t)) }
      )
    );
  }

  function addTask(dayIdx: number) {
    setDays((prev) =>
      prev.map((d, di) => (di !== dayIdx ? d : { ...d, tasks: [...d.tasks, blankTask()] }))
    );
  }

  function removeTask(dayIdx: number, taskIdx: number) {
    setDays((prev) =>
      prev.map((d, di) =>
        di !== dayIdx ? d : { ...d, tasks: d.tasks.filter((_, ti) => ti !== taskIdx) }
      )
    );
  }

  function addDay() {
    setDays((prev) => renumber([...prev, { day_number: prev.length + 1, tasks: [blankTask()] }]));
  }

  function duplicateDay(dayIdx: number) {
    setDays((prev) => {
      const copy = { day_number: 0, tasks: prev[dayIdx].tasks.map((t) => ({ ...t })) };
      const next = [...prev.slice(0, dayIdx + 1), copy, ...prev.slice(dayIdx + 1)];
      return renumber(next);
    });
  }

  function removeDay(dayIdx: number) {
    setDays((prev) => {
      if (prev.length <= 1) return prev;
      return renumber(prev.filter((_, di) => di !== dayIdx));
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Give this template a name.");
      return;
    }
    const cleanDays = days
      .map((d) => ({
        day_number: d.day_number,
        tasks: d.tasks.map((t) => ({ ...t, title: t.title.trim() })).filter((t) => t.title.length > 0),
      }))
      .filter((d) => d.tasks.length > 0);

    if (cleanDays.length === 0) {
      setError("Add at least one day with at least one task.");
      return;
    }

    setSaving(true);
    setError(null);
    const supabase = createClient();

    const finalDays = renumber(cleanDays);
    const payload = {
      name: name.trim(),
      exam_track: examTrack,
      subject_name: examTrack === "subject" ? subjectName.trim() || null : null,
      stage,
      hour_goal: hourGoal ? Number(hourGoal) : null,
      resource_tags: resourceTags,
      remote_friendly: remoteFriendly,
      notes: notes || null,
      tasks: finalDays,
    };

    const { error } = initial
      ? await supabase.from("schedule_templates").update(payload).eq("id", initial.id)
      : await supabase.from("schedule_templates").insert({ ...payload, created_by: userId });

    if (error) {
      setSaving(false);
      setError(error.message);
      return;
    }

    // Editing an existing template that students are already assigned to -
    // push the change into their day immediately for everyone on it right now.
    if (initial) {
      const { data: assignedStudents } = await supabase
        .from("profiles")
        .select("id, assigned_template_start_date")
        .eq("assigned_template_id", initial.id);

      const today = todayStr();
      for (const student of assignedStudents ?? []) {
        const startDate = (student as any).assigned_template_start_date || today;
        const dayNumber = dayNumberFor(startDate, today);
        const dayTasks = tasksForDay(finalDays, dayNumber);
        const newTasks = templateTasksToStudyTasks(dayTasks);
        await supabase.from("daily_logs").upsert(
          {
            user_id: (student as any).id,
            log_date: today,
            tasks: newTasks,
          },
          { onConflict: "user_id,log_date" }
        );
      }
    }

    setSaving(false);
    router.push("/admin/templates");
    router.refresh();
  }

  async function handleDelete() {
    if (!initial) return;
    if (!confirm(`Delete "${initial.name}"? Students currently assigned to it will fall back to the default plan for their stage.`)) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("schedule_templates").delete().eq("id", initial.id);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/admin/templates");
    router.refresh();
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="card">
        <h2 className="font-semibold mb-4">Template details</h2>

        <label className="label">Name</label>
        <input
          className="input mb-4"
          placeholder="e.g. Beginner - 8h/day, UWorld heavy"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <label className="label">Exam track</label>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {(
            [
              { v: "step1", l: "Step 1 (CBSE)" },
              { v: "subject", l: "Subject exams" },
            ] as { v: ExamTrack; l: string }[]
          ).map((opt) => (
            <button
              type="button"
              key={opt.v}
              onClick={() => setExamTrack(opt.v)}
              className={`rounded-xl border px-3 py-3 text-sm font-semibold text-center transition ${
                examTrack === opt.v
                  ? "border-brand-400 bg-brand-900/40 text-brand-300"
                  : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600"
              }`}
            >
              {opt.l}
            </button>
          ))}
        </div>

        {examTrack === "subject" && (
          <>
            <label className="label">Subject (optional - blank matches any subject)</label>
            <input
              className="input mb-4"
              placeholder="e.g. Internal Medicine"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
            />
          </>
        )}

        {examTrack === "step1" && (
          <>
            <label className="label">Prep stage</label>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {(
                [
                  { v: "beginning", l: "Just starting" },
                  { v: "middle", l: "In the middle" },
                  { v: "end", l: "Final stretch" },
                ] as { v: PrepStage; l: string }[]
              ).map((opt) => (
                <button
                  type="button"
                  key={opt.v}
                  onClick={() => setStage(opt.v)}
                  className={`rounded-xl border px-3 py-3 text-sm font-semibold text-center transition ${
                    stage === opt.v
                      ? "border-brand-400 bg-brand-900/40 text-brand-300"
                      : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600"
                  }`}
                >
                  {opt.l}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Daily hour goal (optional tag)</label>
            <input
              type="number"
              min={1}
              max={16}
              step={0.5}
              className="input"
              placeholder="e.g. 8"
              value={hourGoal}
              onChange={(e) => setHourGoal(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={remoteFriendly}
                onChange={(e) => setRemoteFriendly(e.target.checked)}
              />
              Remote / constrained-schedule friendly
            </label>
          </div>
        </div>

        <label className="label">Resource focus (optional tags)</label>
        <div className="flex flex-wrap gap-2 mb-4">
          {RESOURCE_OPTIONS.map((r) => (
            <button
              type="button"
              key={r}
              onClick={() => toggleTag(r)}
              className={`text-sm rounded-full px-3 py-1.5 border transition ${
                resourceTags.includes(r)
                  ? "border-brand-400 bg-brand-900/40 text-brand-300"
                  : "border-slate-700 text-slate-300 hover:border-slate-600"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <label className="label">Notes to yourself (not shown to students)</label>
        <textarea
          className="input"
          rows={3}
          placeholder="e.g. good fit for students who are working part-time"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="card">
        <h2 className="font-semibold mb-1">Day-by-day schedule</h2>
        <p className="text-sm text-slate-300 mb-4">
          Build this out day by day - e.g. Day 1: UWorld block + review, Day 2: UWorld
          block + review, Day 3: Sketchy gram positives. When you assign this to a
          student, whatever day you assign it becomes their Day 1. If a student runs
          past the last day you&apos;ve built, they&apos;ll keep repeating the final day
          until you add more or assign something new.
        </p>

        <div className="space-y-4">
          {days.map((day, dayIdx) => (
            <div key={dayIdx} className="border border-slate-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Day {day.day_number}</h3>
                <div className="flex items-center gap-3 text-sm">
                  <button
                    type="button"
                    onClick={() => duplicateDay(dayIdx)}
                    className="text-brand-400 hover:text-brand-300"
                  >
                    Duplicate day
                  </button>
                  {days.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDay(dayIdx)}
                      className="text-slate-500 hover:text-red-400"
                    >
                      Remove day
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-3 mb-3">
                {day.tasks.map((t, taskIdx) => (
                  <div
                    key={taskIdx}
                    className="flex flex-wrap gap-2 items-center border border-slate-800 bg-slate-800 rounded-xl p-3"
                  >
                    <input
                      className="input flex-1 min-w-[160px]"
                      placeholder="Task title (e.g. UWorld cardio block, gram positives)"
                      value={t.title}
                      onChange={(e) => updateTask(dayIdx, taskIdx, { title: e.target.value })}
                    />
                    <select
                      className="input w-auto"
                      value={t.resource}
                      onChange={(e) => updateTask(dayIdx, taskIdx, { resource: e.target.value })}
                    >
                      {TASK_RESOURCE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input w-32"
                      placeholder="Target"
                      value={t.target}
                      onChange={(e) => updateTask(dayIdx, taskIdx, { target: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => removeTask(dayIdx, taskIdx)}
                      className="text-slate-500 hover:text-red-400 text-sm px-2"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => addTask(dayIdx)}
                className="text-sm text-brand-400 hover:text-brand-300 font-medium"
              >
                + Add task to Day {day.day_number}
              </button>
            </div>
          ))}
        </div>

        <button type="button" onClick={addDay} className="btn-secondary mt-4">
          Add another day
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={saving}>
          {saving ? "Saving..." : initial ? "Save changes" : "Create template"}
        </button>
        {initial && (
          <button
            type="button"
            onClick={handleDelete}
            className="btn-secondary text-red-400"
            disabled={saving}
          >
            Delete template
          </button>
        )}
      </div>
    </form>
  );
}
