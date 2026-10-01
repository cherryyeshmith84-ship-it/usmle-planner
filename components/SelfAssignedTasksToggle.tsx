"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Mentor-only switch (student_planner_settings.allow_self_assigned_tasks,
 * see migration add_student_self_assigned_tasks) that lets a student add
 * their OWN rows to their Assignments checklist, not just check off ones
 * their mentor created. Off by default for every student.
 *
 * The student-facing form this unlocks lives in AssignmentsChecklist.tsx,
 * and the actual insert goes through student_create_plan_task() (SECURITY
 * DEFINER) which re-checks this same flag server-side - so flipping this
 * off here immediately blocks any further student-added tasks, even if
 * their browser still has a stale "on" value in memory.
 */
export default function SelfAssignedTasksToggle({
  studentId,
  initialAllowed,
}: {
  studentId: string;
  initialAllowed: boolean;
}) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(initialAllowed);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !allowed;
    setSaving(true);
    setError(null);
    setAllowed(next);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("student_planner_settings")
      .upsert(
        { student_id: studentId, allow_self_assigned_tasks: next, updated_at: new Date().toISOString() },
        { onConflict: "student_id" }
      );
    setSaving(false);
    if (err) {
      setAllowed(!next);
      setError(err.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={allowed}
          disabled={saving}
          onChange={toggle}
          className="w-4 h-4"
        />
        <span className="text-xs font-semibold text-slate-300">Let this student add their own tasks</span>
      </label>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <p className="text-xs text-slate-500">
        {allowed
          ? "On - they can add extra Assignments to their own checklist, alongside what you assign."
          : "Off - they can only check off Assignments you create for them."}
      </p>
    </div>
  );
}
