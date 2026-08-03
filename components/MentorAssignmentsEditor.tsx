"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PlanTask } from "@/lib/planTasks";

interface DraftTask {
  key: string; // real id for existing rows, "new-N" for freshly added ones
  id: string | null;
  title: string;
  isOptional: boolean;
  completed: boolean;
}

function toDraft(t: PlanTask): DraftTask {
  return { key: t.id, id: t.id, title: t.title, isOptional: t.is_optional, completed: t.completed };
}

export default function MentorAssignmentsEditor({
  studentId,
  mentorId,
  date,
  initialTasks,
}: {
  studentId: string;
  mentorId: string;
  date: string;
  initialTasks: PlanTask[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<DraftTask[]>(() => initialTasks.map(toDraft));
  const [nextNewId, setNextNewId] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  function updateDraft(key: string, patch: Partial<DraftTask>) {
    setSaveMessage(null);
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function addAssignment() {
    setSaveMessage(null);
    const key = `new-${nextNewId}`;
    setNextNewId((n) => n + 1);
    setDrafts((prev) => [...prev, { key, id: null, title: "", isOptional: false, completed: false }]);
  }

  function removeAssignment(key: string) {
    setSaveMessage(null);
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    const supabase = createClient();

    const originalIds = new Set(initialTasks.map((t) => t.id));
    const remainingIds = new Set(drafts.filter((d) => d.id).map((d) => d.id as string));
    const removedIds = [...originalIds].filter((id) => !remainingIds.has(id));

    if (removedIds.length > 0) {
      const { error } = await supabase.from("mentor_plan_tasks").delete().in("id", removedIds);
      if (error) {
        setSaving(false);
        setSaveError(error.message);
        return;
      }
    }

    for (const [i, d] of drafts.entries()) {
      if (!d.title.trim()) continue;
      if (d.id) {
        const { error } = await supabase
          .from("mentor_plan_tasks")
          .update({ title: d.title, is_optional: d.isOptional, sort_order: i })
          .eq("id", d.id);
        if (error) {
          setSaving(false);
          setSaveError(error.message);
          return;
        }
      } else {
        const { error } = await supabase.from("mentor_plan_tasks").insert({
          student_id: studentId,
          mentor_id: mentorId,
          task_date: date,
          title: d.title,
          is_optional: d.isOptional,
          sort_order: i,
          source: "mentor",
        });
        if (error) {
          setSaving(false);
          setSaveError(error.message);
          return;
        }
      }
    }

    setSaving(false);
    setSaveMessage("Assignments saved.");

    fetch("/api/notifications/relationship-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mentorId,
        studentId,
        type: "task_update",
        title: "Your mentor updated your tasks",
        detail: `Tasks for ${date} were added or changed.`,
        link: "/planner",
      }),
    }).catch(() => {});

    router.refresh();
  }

  return (
    <div className="space-y-2">
      {drafts.length === 0 ? (
        <p className="text-xs text-slate-500">No assignments set for this day yet.</p>
      ) : (
        <div className="space-y-1.5">
          {drafts.map((d) => (
            <div key={d.key} className="flex items-center gap-2">
              {d.completed && (
                <span className="text-xs text-green-400 shrink-0" title="Student has marked this completed">
                  ✓
                </span>
              )}
              <input
                type="text"
                value={d.title}
                onChange={(e) => updateDraft(d.key, { title: e.target.value })}
                placeholder="Assignment (e.g. 40 Cardiology Questions)"
                className="input text-xs py-1 px-2 flex-1"
              />
              <label className="flex items-center gap-1 text-xs text-slate-500 shrink-0">
                <input
                  type="checkbox"
                  checked={d.isOptional}
                  onChange={(e) => updateDraft(d.key, { isOptional: e.target.checked })}
                  className="w-3.5 h-3.5"
                />
                Optional
              </label>
              <button
                type="button"
                onClick={() => removeAssignment(d.key)}
                className="text-xs text-red-400 hover:text-red-300 shrink-0"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3 flex-wrap pt-1">
        <button type="button" onClick={addAssignment} className="btn-secondary text-xs">
          + Add Assignment
        </button>
        <button type="button" onClick={save} disabled={saving} className="btn-primary text-xs">
          {saving ? "Saving..." : "Save"}
        </button>
        {saveMessage && <p className="text-xs text-green-400">{saveMessage}</p>}
        {saveError && <p className="text-xs text-red-400">{saveError}</p>}
      </div>
    </div>
  );
}
