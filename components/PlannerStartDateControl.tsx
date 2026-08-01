"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Lets a mentor (or admin) set/change where this student's planner grid
 * starts. Once set, the grid below stops resetting to a window centered on
 * "today" every time the page loads - it starts at this date and keeps
 * growing forward from there instead (see lib/plannerSettings.ts).
 */
export default function PlannerStartDateControl({
  studentId,
  initialStartDate,
}: {
  studentId: string;
  initialStartDate: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialStartDate ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!value) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("student_planner_settings")
      .upsert({ student_id: studentId, start_date: value, updated_at: new Date().toISOString() }, { onConflict: "student_id" });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMessage("Saved - the planner grid below now starts from this date.");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label className="text-xs font-semibold text-slate-400" htmlFor="planner-start-date">
        Planner start date
      </label>
      <input
        id="planner-start-date"
        type="date"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setMessage(null);
        }}
        className="input text-xs py-1 px-2"
      />
      <button type="button" onClick={save} disabled={saving || !value} className="btn-secondary text-xs">
        {saving ? "Saving..." : "Set start date"}
      </button>
      {message && <p className="text-xs text-green-400">{message}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!message && !error && (
        <p className="text-xs text-slate-500">
          {initialStartDate
            ? `Currently starts ${initialStartDate}. Change it any time - the grid keeps growing forward from there.`
            : "Not set yet - the grid below defaults to a week either side of today."}
        </p>
      )}
    </div>
  );
}
