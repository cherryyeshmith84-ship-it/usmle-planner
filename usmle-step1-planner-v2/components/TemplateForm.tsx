"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PrepStage, ScheduleTemplate, TemplateTask } from "@/lib/types";

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

function blankTask(): TemplateTask {
  return { title: "", resource: "UWorld", target: "" };
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
  const [stage, setStage] = useState<PrepStage>(initial?.stage ?? "beginning");
  const [hourGoal, setHourGoal] = useState(initial?.hour_goal?.toString() ?? "");
  const [resourceTags, setResourceTags] = useState<string[]>(initial?.resource_tags ?? []);
  const [remoteFriendly, setRemoteFriendly] = useState(initial?.remote_friendly ?? false);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [tasks, setTasks] = useState<TemplateTask[]>(
    initial?.tasks?.length ? initial.tasks : [blankTask()]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTag(tag: string) {
    setResourceTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function updateTask(i: number, patch: Partial<TemplateTask>) {
    setTasks((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }

  function addTask() {
    setTasks((prev) => [...prev, blankTask()]);
  }

  function removeTask(i: number) {
    setTasks((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Give this template a name.");
      return;
    }
    const cleanTasks = tasks
      .map((t) => ({ ...t, title: t.title.trim() }))
      .filter((t) => t.title.length > 0);
    if (cleanTasks.length === 0) {
      setError("Add at least one task.");
      return;
    }

    setSaving(true);
    setError(null);
    const supabase = createClient();

    const payload = {
      name: name.trim(),
      stage,
      hour_goal: hourGoal ? Number(hourGoal) : null,
      resource_tags: resourceTags,
      remote_friendly: remoteFriendly,
      notes: notes || null,
      tasks: cleanTasks,
    };

    const { error } = initial
      ? await supabase.from("schedule_templates").update(payload).eq("id", initial.id)
      : await supabase.from("schedule_templates").insert({ ...payload, created_by: userId });

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
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
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              {opt.l}
            </button>
          ))}
        </div>

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
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
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
        <h2 className="font-semibold mb-1">Daily tasks</h2>
        <p className="text-sm text-slate-600 mb-4">
          This becomes each student&apos;s default task list every day, until they edit it
          themselves or you assign a different template.
        </p>
        <div className="space-y-3 mb-4">
          {tasks.map((t, i) => (
            <div key={i} className="flex flex-wrap gap-2 items-center border border-slate-200 rounded-xl p-3">
              <input
                className="input flex-1 min-w-[160px]"
                placeholder="Task title"
                value={t.title}
                onChange={(e) => updateTask(i, { title: e.target.value })}
              />
              <select
                className="input w-auto"
                value={t.resource}
                onChange={(e) => updateTask(i, { resource: e.target.value })}
              >
                {["UWorld", "Sketchy", "Boards & Beyond", "Pathoma", "Anki", "NBME/UWSA", "Other"].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <input
                className="input w-32"
                placeholder="Target"
                value={t.target}
                onChange={(e) => updateTask(i, { target: e.target.value })}
              />
              <button
                type="button"
                onClick={() => removeTask(i)}
                className="text-slate-400 hover:text-red-500 text-sm px-2"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addTask} className="btn-secondary">
          Add task
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={saving}>
          {saving ? "Saving..." : initial ? "Save changes" : "Create template"}
        </button>
        {initial && (
          <button
            type="button"
            onClick={handleDelete}
            className="btn-secondary text-red-600"
            disabled={saving}
          >
            Delete template
          </button>
        )}
      </div>
    </form>
  );
}
