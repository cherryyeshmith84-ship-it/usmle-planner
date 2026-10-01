"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PlanTask } from "@/lib/planTasks";
import { sortTasks } from "@/lib/planTasks";

/**
 * "Mentor Assignments" (Study Planner v1 item 6) - the student's side.
 * Shows whatever assignments their mentor set for this day and lets the
 * student check them off. Writes go through student_toggle_plan_task()
 * (SECURITY DEFINER, only ever touches completed/completed_at) instead of a
 * direct RLS UPDATE, so a student can mark their own progress but can never
 * edit the assignment's actual title/detail - only their mentor can do
 * that (see MentorAssignmentsEditor.tsx).
 *
 * When a mentor turns on "Let this student add their own tasks"
 * (SelfAssignedTasksToggle.tsx, student_planner_settings.allow_self_assigned_tasks)
 * this also renders a small add-a-task form below the checklist. Those
 * rows are inserted via student_create_plan_task() (SECURITY DEFINER - the
 * function itself re-checks the toggle server-side, so a stale `true` prop
 * can't let a student sneak one in after their mentor turns it back off)
 * and always tagged source = 'student', which is what lets a student
 * delete one of their own later (student_delete_own_plan_task) while a
 * mentor-assigned row (source = 'mentor') stays something only
 * MentorAssignmentsEditor.tsx can remove.
 */
export default function AssignmentsChecklist({
  tasks,
  date,
  editable = true,
  allowSelfAssigned = false,
}: {
  tasks: PlanTask[];
  // Needed so a newly self-added task is inserted onto the day actually
  // being viewed, not whatever date the component happened to mount with.
  date: string;
  // False once this day has fallen outside the student's edit window (see
  // isDateEditable in lib/planProgress.ts) - the checklist still shows what
  // was (or wasn't) completed, it just can't be changed anymore.
  editable?: boolean;
  // Mirrors this student's student_planner_settings.allow_self_assigned_tasks
  // - the add-a-task form below only renders when this is true AND editable.
  allowSelfAssigned?: boolean;
}) {
  const router = useRouter();
  const [localTasks, setLocalTasks] = useState(tasks);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

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

  async function addTask() {
    if (!editable || !allowSelfAssigned) return;
    const title = newTitle.trim();
    if (!title) {
      setAddError("Give it a title first.");
      return;
    }
    setAdding(true);
    setAddError(null);
    const supabase = createClient();
    const { data: newId, error } = await supabase.rpc("student_create_plan_task", {
      p_task_date: date,
      p_title: title,
      p_detail: newDetail.trim() || null,
      p_estimated_minutes: null,
    });
    setAdding(false);
    if (error) {
      setAddError(error.message);
      return;
    }
    setLocalTasks((prev) => [
      ...prev,
      {
        id: newId as unknown as string,
        student_id: "",
        mentor_id: null,
        task_date: date,
        title,
        detail: newDetail.trim() || null,
        category: "other",
        is_optional: false,
        estimated_minutes: null,
        sort_order: 999999,
        source: "student",
        completed: false,
        completed_at: null,
      },
    ]);
    setNewTitle("");
    setNewDetail("");
    setShowAddForm(false);
    router.refresh();
  }

  async function removeOwnTask(taskId: string) {
    if (!editable) return;
    setDeletingId(taskId);
    const supabase = createClient();
    const { error } = await supabase.rpc("student_delete_own_plan_task", { p_task_id: taskId });
    setDeletingId(null);
    if (error) return;
    setLocalTasks((prev) => prev.filter((t) => t.id !== taskId));
    router.refresh();
  }

  const sorted = sortTasks(localTasks);

  return (
    <div className="space-y-1.5">
      {sorted.length === 0 && (
        <p className="text-xs text-slate-500">No assignments from your mentor for this day.</p>
      )}
      {sorted.map((task) => (
        <div key={task.id} className="flex items-start gap-2 text-sm group">
          <label className={`flex items-start gap-2 flex-1 min-w-0 ${editable ? "cursor-pointer" : "cursor-not-allowed"}`}>
            <input
              type="checkbox"
              checked={task.completed}
              disabled={savingId === task.id || !editable}
              onChange={() => toggle(task)}
              className="w-4 h-4 mt-0.5 shrink-0"
            />
            <span className={task.completed ? "text-slate-500 line-through" : "text-slate-200"}>
              {task.title}
              {task.source === "student" && (
                <span className="text-slate-500 text-xs"> (added by you)</span>
              )}
              {task.is_optional && <span className="text-slate-500"> (Optional)</span>}
              {task.detail && <span className="block text-xs text-slate-500">{task.detail}</span>}
            </span>
          </label>
          {editable && task.source === "student" && (
            <button
              type="button"
              onClick={() => removeOwnTask(task.id)}
              disabled={deletingId === task.id}
              className="text-xs text-slate-500 hover:text-red-400 shrink-0 opacity-0 group-hover:opacity-100 transition"
              aria-label="Remove this task"
            >
              Remove
            </button>
          )}
        </div>
      ))}
      {!editable && (
        <p className="text-[11px] text-slate-500 pt-0.5">This day is locked and can no longer be updated.</p>
      )}

      {editable && allowSelfAssigned && (
        <div className="pt-2">
          {showAddForm ? (
            <div className="space-y-1.5 border border-slate-700 rounded-lg p-2.5">
              <input
                className="input text-xs py-1.5 px-2"
                placeholder="Task title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                autoFocus
              />
              <input
                className="input text-xs py-1.5 px-2"
                placeholder="Details (optional)"
                value={newDetail}
                onChange={(e) => setNewDetail(e.target.value)}
              />
              {addError && <p className="text-xs text-red-400">{addError}</p>}
              <div className="flex items-center gap-2">
                <button type="button" onClick={addTask} disabled={adding} className="btn-primary text-xs py-1 px-2.5">
                  {adding ? "Adding..." : "Add task"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setAddError(null);
                  }}
                  className="text-xs text-slate-500 hover:text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowAddForm(true)} className="text-xs text-brand-400 hover:text-brand-300">
              + Add your own task
            </button>
          )}
        </div>
      )}
    </div>
  );
}
