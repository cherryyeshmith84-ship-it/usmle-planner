"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * "Mark Day Complete" button on the Home dashboard's Today's Plan card -
 * one click sets today's "Study Status" checkbox (task_completed) without
 * making the student go open the full planner grid just for that. Merges
 * into whatever's already saved for today (existingFieldValues) instead of
 * overwriting the row, so it never clobbers Planned System/Hours/etc. the
 * student already entered.
 */
export default function MarkDayCompleteButton({
  userId,
  todayIso,
  existingFieldValues,
  alreadyComplete,
}: {
  userId: string;
  todayIso: string;
  existingFieldValues: Record<string, string | number | boolean | null>;
  alreadyComplete: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(alreadyComplete);
  const [error, setError] = useState<string | null>(null);

  async function markComplete() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.from("planner_entries").upsert(
      {
        user_id: userId,
        log_date: todayIso,
        field_values: { ...existingFieldValues, task_completed: true },
      },
      { onConflict: "user_id,log_date" }
    );
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
    router.refresh();
  }

  if (done) {
    return <span className="text-sm font-semibold text-green-400">✓ Day marked complete</span>;
  }

  return (
    <div>
      <button type="button" onClick={markComplete} disabled={saving} className="btn-secondary text-sm">
        {saving ? "Saving..." : "Mark Day Complete"}
      </button>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}
