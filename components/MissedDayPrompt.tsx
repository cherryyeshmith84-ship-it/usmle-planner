"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Study Planner v2, phase 3 - the "non-shaming missed day" prompt from the
 * mockup: no red banner scolding the student, just three one-click ways
 * forward. Shown on the dashboard whenever yesterday's status (see
 * computeDayStatus in lib/plannerCalendar.ts) is "missed" or "partial."
 *
 * "Move to today" and "Spread across next few days" call the
 * reschedule-missed API route (students have no direct UPDATE on
 * mentor_plan_tasks, see that route's comment for why). "Keep original
 * schedule" is a pure dismiss - it doesn't change any task_date, it just
 * hides the prompt so the student isn't nagged about the same missed day
 * every time they open the dashboard. The dismissal is remembered in
 * localStorage per missed-date, same pattern as the planner's persisted
 * date-range elsewhere in this app.
 */
export default function MissedDayPrompt({
  missedDate,
  missedCount,
  todayIso,
  dayLabel,
}: {
  missedDate: string;
  missedCount: number;
  todayIso: string;
  dayLabel: string;
}) {
  const router = useRouter();
  const storageKey = `missed-day-prompt-dismissed-${missedDate}`;
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(storageKey) === "1";
  });
  const [saving, setSaving] = useState<"today" | "spread" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function dismiss() {
    window.localStorage.setItem(storageKey, "1");
    setDismissed(true);
  }

  async function reschedule(mode: "today" | "spread") {
    setSaving(mode);
    setError(null);
    try {
      const res = await fetch("/api/planner/reschedule-missed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, missedDate, todayIso }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't reschedule those tasks.");
        setSaving(null);
        return;
      }
      dismiss();
      router.refresh();
    } catch {
      setError("Couldn't reschedule those tasks - check your connection and try again.");
      setSaving(null);
    }
  }

  if (dismissed || missedCount === 0) return null;

  return (
    <div className="card mb-6 border border-amber-900/40">
      <p className="font-bold mb-1">
        {dayLabel} wasn&apos;t completed ({missedCount} task{missedCount === 1 ? "" : "s"} left open)
      </p>
      <p className="text-sm text-slate-400 mb-4">No worries - pick whichever works best for you.</p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => reschedule("today")}
          disabled={saving !== null}
          className="btn-secondary text-sm disabled:opacity-60"
        >
          {saving === "today" ? "Moving..." : "Move missed tasks to today"}
        </button>
        <button
          onClick={() => reschedule("spread")}
          disabled={saving !== null}
          className="btn-secondary text-sm disabled:opacity-60"
        >
          {saving === "spread" ? "Rescheduling..." : "Spread across next few days"}
        </button>
        <button
          onClick={dismiss}
          disabled={saving !== null}
          className="btn-secondary text-sm disabled:opacity-60"
        >
          Keep original schedule
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
