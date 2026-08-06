"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PlanTask } from "@/lib/planTasks";

/**
 * "Mentor Assignments" (Study Planner v1 item 6) - the student's side.
 * Shows whatever assignments their mentor set for this day and lets the
 * student check them off. Writes go through student_toggle_plan_task()
 * (SECURITY DEFINER, only ever touches completed/completed_at) instead of a
 * direct RLS UPDATE, so a student can mark their own progress but can never
 * edit the assignment's actual title/detail - only their mentor can do
 * that (see MentorAssignmentsEditor.tsx).
 */
export default function AssignmentsChecklist({
  tasks,
  editable = true,
}: {
  tasks: PlanTask[];
  // False once this day has fallen outside the student's edit window (see
  // isDateEditable in lib/planProgress.ts) - the checklist still shows what
  // was (or wasn't) completed, it just can't be changed anymore.
  editable?: boolean;
}) {
  const router = useRouter();
  const [localTasks, setLocalTasks] = useState(tasks);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function toggle(task: PlanTask) {
    if (!editable) return;
    const next = !task.completed;
    setSavingId(task.id);
    setLocalTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: next } : t)));
    const supabase = createClient();
    const { error } = await supabase.rpc("student_toggle_plan_task", {
      p_task_id: task.id,
      p_completed: next,
    });
    setSavingId(null);
    if (error) {
      // Roll back on failure so the checkbox doesn't lie about what's saved.
      setLocalTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: !next } : t)));
      return;
    }
    // Refreshes the server-fetched props so collapsing/re-expanding this
    // day (which unmounts this component) shows the saved state instead of
    // the original pre-toggle data.
    router.refresh();
  }

  if (localTasks.length === 0) {
    return <p className="text-xs text-slate-500">No assignments from your mentor for this day.</p>;
  }

  return (
    <div className="space-y-1.5">
      {localTasks.map((task) => (
        <label
          key={task.id}
          className={`flex items-start gap-2 text-sm ${editable ? "cursor-pointer" : "cursor-not-allowed"}`}
        >
          <input
            type="checkbox"
            checked={task.completed}
            disabled={savingId === task.id || !editable}
            onChange={() => toggle(task)}
            className="w-4 h-4 mt-0.5"
          />
          <span className={task.completed ? "text-slate-500 line-through" : "text-slate-200"}>
            {task.title}
            {task.is_optional && <span className="text-slate-500"> (Optional)</span>}
            {task.detail && <span className="block text-xs text-slate-500">{task.detail}</span>}
          </span>
        </label>
      ))}
      {!editable && (
        <p className="text-[11px] text-slate-500 pt-0.5">This day is locked and can no longer be updated.</p>
      )}
    </div>
  );
}
