"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function MarkDayCompleteButton({
  userId,
  todayIso,
  existingFieldValues,
  alreadyComplete,
  mentorId,
}: {
  userId: string;
  todayIso: string;
  existingFieldValues: Record<string, string | number | boolean | null>;
  alreadyComplete: boolean;
  mentorId?: string | null;
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

    if (mentorId) {
      fetch("/api/notifications/relationship-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mentorId,
          studentId: userId,
          type: "planner_logged",
          title: "Your student logged today's planner",
          detail: `Marked ${todayIso} complete.`,
          link: `/mentorship/student/${userId}`,
        }),
      }).catch(() => {});
    }

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
