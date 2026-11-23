"use client";

import { useEffect, useState } from "react";
import type { AiExamReview } from "@/lib/scoreReports";

/**
 * The "AI Exam Review" and "Default AI Study Plan" cards on the student's
 * Analysis page. Uses the existing /api/score-report/suggestions route:
 *  - on load it only reads the cached review (never spends AI quota),
 *  - "Get AI review" / "Refresh" generates a new one.
 * The Default AI Study Plan is built from the review's priority areas and is
 * hidden when the student's mentor has written their own plan (that plan is
 * shown by the Performance section instead).
 */
export default function AiExamReviewCard({
  reportCount,
  hasMentorPlan,
}: {
  reportCount: number;
  hasMentorPlan: boolean;
}) {
  const [aiReview, setAiReview] = useState<AiExamReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (reportCount === 0) return;
    (async () => {
      try {
        const res = await fetch("/api/score-report/suggestions");
        const json = await res.json();
        if (res.ok && json.review) setAiReview(json.review);
      } catch {
        // Silent - the button is still there if this fails.
      }
    })();
  }, [reportCount]);

  async function getSuggestion(force: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/score-report/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error || "Couldn't generate a review.");
      else setAiReview(json.review);
    } catch (e: any) {
      setError(e.message || "Couldn't reach the AI.");
    }
    setLoading(false);
  }

  if (reportCount === 0) return null;

  return (
    <div className="space-y-4 mb-8">
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold">AI Exam Review</p>
          <button
            type="button"
            onClick={() => getSuggestion(!!aiReview)}
            disabled={loading}
            className="btn-secondary text-xs"
          >
            {loading ? "Thinking..." : aiReview ? "Refresh" : "Get AI review"}
          </button>
        </div>
        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
        {aiReview ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              {aiReview.bullets.map((b, i) => (
                <p key={i} className="text-sm flex items-start gap-2 text-slate-300">
                  <span className={`shrink-0 ${b.positive ? "text-green-400" : "text-amber-400"}`}>
                    {b.positive ? "✓" : "⚠"}
                  </span>
                  {b.text}
                </p>
              ))}
            </div>
            {aiReview.priorityAreas.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Priority Areas</p>
                <ol className="text-sm text-slate-300 list-decimal list-inside space-y-0.5">
                  {aiReview.priorityAreas.map((area) => (
                    <li key={area}>{area}</li>
                  ))}
                </ol>
              </div>
            )}
            {aiReview.estimatedHours && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Estimated study requirement
                </p>
                <p className="text-sm text-slate-300">{aiReview.estimatedHours}</p>
              </div>
            )}
          </div>
        ) : (
          !error && (
            <p className="text-xs text-slate-500">
              Generates a quick read on what&apos;s going well and what to prioritize, based on your score history.
              It is reused until you add a new report or press Refresh.
            </p>
          )
        )}
      </div>

      {!hasMentorPlan && (
        <div className="card">
          <p className="text-sm font-semibold mb-1">Default AI Study Plan</p>
          {aiReview && aiReview.priorityAreas.length > 0 ? (
            <>
              <p className="text-xs text-slate-500 mb-2">
                Generated from your AI Exam Review above. A mentor can replace this with their own plan any time.
              </p>
              <ol className="text-sm text-slate-300 list-decimal list-inside space-y-0.5">
                {aiReview.priorityAreas.map((area) => (
                  <li key={area}>{area}</li>
                ))}
              </ol>
              {aiReview.estimatedHours && (
                <p className="text-xs text-slate-500 mt-2">Estimated total: {aiReview.estimatedHours}</p>
              )}
            </>
          ) : (
            <p className="text-xs text-slate-500">Get an AI Exam Review above to generate your default study plan here.</p>
          )}
        </div>
      )}
    </div>
  );
}
