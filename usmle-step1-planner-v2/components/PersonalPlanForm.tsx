"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getTemplateDays } from "@/lib/templateDays";
import type { PersonalTemplate, TemplateDay, TemplateTask } from "@/lib/types";

const TASK_RESOURCE_OPTIONS = [
  "UWorld",
  "Sketchy",
  "Boards & Beyond",
  "Pathoma",
  "Anki",
  "NBME/UWSA",
  "Other",
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function blankTask(): TemplateTask {
  return { title: "", resource: "UWorld", target: "" };
}

function renumber(days: TemplateDay[]): TemplateDay[] {
  return days.map((d, i) => ({ ...d, day_number: i + 1 }));
}

export default function PersonalPlanForm({
  userId,
  initial,
}: {
  userId: string;
  initial: PersonalTemplate | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "My plan");
  const [startDate, setStartDate] = useState(initial?.start_date ?? todayStr());
  const [days, setDays] = useState<TemplateDay[]>(() => {
    const existing = initial ? getTemplateDays(initial) : [];
    return existing.length ? existing : [{ day_number: 1, tasks: [blankTask()] }];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

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
    setMsg(null);
    const supabase = createClient();
    const finalDays = renumber(cleanDays);

    const { error } = await supabase.from("personal_templates").upsert(
      {
        user_id: userId,
        name: name.trim() || "My plan",
        tasks: finalDays,
        start_date: startDate || todayStr(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      setSaving(false);
      setError(error.message);
      return;
    }

    // Make this the active plan and go straight to the Planner to see it.
    await supabase
      .from("profiles")
      .update({ active_plan_source: "own" })
      .eq("id", userId);

    setSaving(false);
    router.push("/planner");
    router.refresh();
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="card">
        <h2 className="font-semibold mb-4">Plan details</h2>
        <label className="label">Name (just for you)</label>
        <input
          className="input mb-4"
          placeholder="e.g. My own UWorld + Sketchy plan"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <label className="label">Start date (this becomes Day 1)</label>
        <input
          type="date"
          className="input"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>

      <div className="card">
        <h2 className="font-semibold mb-1">Day-by-day schedule</h2>
        <p className="text-sm text-slate-300 mb-4">
          Build your own plan day by day - e.g. Day 1: UWorld block + review, Day 2:
          Sketchy gram positives. If you run past the last day you&apos;ve built,
          you&apos;ll keep repeating the final day until you add more.
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
      {msg && <p className="text-sm text-slate-400">{msg}</p>}

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={saving}>
          {saving ? "Saving..." : "Save and use this plan"}
        </button>
      </div>
    </form>
  );
}
