"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CatchUpPlan, MoveAheadSuggestion, SkippedCategoryFlag } from "@/lib/adaptivePlanner";
import { categoryLabel } from "@/lib/adaptivePlanner";
import { weekStartMonday } from "@/lib/plannerCalendar";

/**
 * Study Planner v2, phase 4 - the adaptive engine's student-facing surface.
 * Three independent pieces, each shown only when relevant:
 *
 *  - Catch-up estimate: pure information, no action needed here (the actual
 *    rescheduling tool is the missed-day prompt on days it applies to).
 *  - Move-ahead suggestion: "suggest, student confirms" - one click calls
 *    /api/planner/pull-ahead, nothing happens automatically.
 *  - Skipped-subject flag: doesn't touch the student's own plan at all, so
 *    it's the one exception to "confirms first" - it silently (but
 *    transparently, the student sees the same line) notifies the mentor,
 *    the same way MarkDayCompleteButton already does for "student logged
 *    today." Deduped to once per subject per week via localStorage so it
 *    doesn't spam the mentor's notification bell on every page load.
 */
export default function AdaptiveInsights({
  catchUpPlan,
  moveAhead,
  skippedCategories,
  studentId,
  mentorId,
  todayIso,
}: {
  catchUpPlan: CatchUpPlan | null;
  moveAhead: MoveAheadSuggestion | null;
  skippedCategories: SkippedCategoryFlag[];
  studentId: string;
  mentorId: string | null;
  todayIso: string;
}) {
  const router = useRouter();
  const [pulling, setPulling] = useState(false);
  const [pulled, setPulled] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);

  useEffect(() => {
    if (!mentorId || skippedCategories.length === 0) return;
    const weekKey = weekStartMonday(todayIso);
    for (const flag of skippedCategories) {
      const storageKey = `subject-flag-${studentId}-${flag.category}-${weekKey}`;
      if (window.localStorage.getItem(storageKey) === "1") continue;
      window.localStorage.setItem(storageKey, "1");
      fetch("/api/notifications/relationship-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mentorId,
          studentId,
          type: "subject_flag",
          title: `Possible weak spot: ${categoryLabel(flag.category)}`,
          detail: `Skipped ${flag.missedCount} times in the last ${flag.lookbackDays} days.`,
          link: `/mentorship/student/${studentId}`,
        }),
      }).catch(() => {});
    }
    // Only re-run if the actual flag set or the day changes - not on every
    // render, since skippedCategories is a freshly-built array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, mentorId, todayIso, JSON.stringify(skippedCategories)]);

  async function pullAhead() {
    if (!moveAhead) return;
    setPulling(true);
    setPullError(null);
    try {
      const res = await fetch("/api/planner/pull-ahead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceDate: moveAhead.sourceDate, todayIso }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPullError(data.error ?? "Couldn't pull those tasks forward.");
        setPulling(false);
        return;
      }
      setPulled(true);
      router.refresh();
    } catch {
      setPullError("Couldn't pull those tasks forward - check your connection and try again.");
      setPulling(false);
    }
  }

  if (!catchUpPlan && (!moveAhead || pulled) && skippedCategories.length === 0) return null;

  return (
    <div className="card mb-6 space-y-4">
      <p className="font-bold">Adaptive Insights</p>

      {catchUpPlan && <p className="text-sm text-slate-300">{catchUpPlan.message}</p>}

      {moveAhead && !pulled && (
        <div>
          <p className="text-sm text-slate-300 mb-2">
            You&apos;re ahead of schedule - want to pull tomorrow&apos;s {moveAhead.taskCount} task
            {moveAhead.taskCount === 1 ? "" : "s"} into today?
          </p>
          <button onClick={pullAhead} disabled={pulling} className="btn-secondary text-sm disabled:opacity-60">
            {pulling ? "Pulling..." : "Pull tomorrow's tasks into today"}
          </button>
          {pullError && <p className="text-xs text-red-400 mt-1">{pullError}</p>}
        </div>
      )}

      {skippedCategories.length > 0 && (
        <p className="text-xs text-slate-500">
          Your mentor is being notified about a consistent gap in{" "}
          {skippedCategories.map((f) => categoryLabel(f.category)).join(", ")} so they can help you get back on
          track.
        </p>
      )}
    </div>
  );
}
