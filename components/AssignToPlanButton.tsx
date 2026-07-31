"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { todayIso, type PlanTaskCategory } from "@/lib/planTasks";

/**
 * Analysis -> Assignments integration (Study Planner v1 item 15) - lets a
 * mentor turn a weak system/discipline straight from the Analysis tables
 * into a real mentor_plan_tasks row on the student's planner, in one click,
 * instead of having to re-type it by hand down in the Assignments section.
 * Inserts directly into the same table MentorAssignmentsEditor reads/writes,
 * so the new task shows up there (and on the student's planner) immediately
 * after a refresh - no separate "queue" or intermediate state to reconcile.
 */
export default function AssignToPlanButton({
  studentId,
  mentorId,
  title,
  detail,
  category = "review",
}: {
  studentId: string;
  mentorId: string;
  title: string;
  detail?: string;
  category?: PlanTaskCategory;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignedDate, setAssignedDate] = useState<string | null>(null);

  async function assign() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("mentor_plan_tasks").insert({
      student_id: studentId,
      mentor_id: mentorId,
      task_date: date,
      title,
      detail: detail ?? null,
      category,
      is_optional: false,
      source: "mentor",
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setAssignedDate(date);
    setOpen(false);
    router.refresh();
  }

  if (assignedDate) {
    return (
      <span className="text-[11px] text-green-400 whitespace-nowrap">
        ✓ Added to {assignedDate}
        <button
          type="button"
          onClick={() => setAssignedDate(null)}
          className="ml-1 text-slate-500 hover:text-slate-300"
        >
          (assign again)
        </button>
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-semibold text-brand-400 hover:text-brand-300 whitespace-nowrap"
      >
        + Assign
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="input text-[11px] py-0.5 px-1.5 w-[124px]"
      />
      <button
        type="button"
        onClick={assign}
        disabled={saving}
        className="text-[11px] font-semibold text-brand-400 hover:text-brand-300"
      >
        {saving ? "Adding..." : "Add"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-[11px] text-slate-500 hover:text-slate-300"
      >
        Cancel
      </button>
      {error && <span className="text-[11px] text-red-400">{error}</span>}
    </span>
  );
}
