"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Lets a mentor mark a specific score report "reviewed" and optionally set
 * the student's next check-in date, from the read-only student-progress
 * page. Deliberately calls the mentor_mark_report_reviewed() Postgres
 * function (see migration score_reports_mentor_review_status) instead of
 * updating score_reports directly - that function only ever touches the
 * three review-status columns, so this can't accidentally (or maliciously)
 * modify the student's actual score data the way a broad UPDATE RLS policy
 * on score_reports would allow.
 */
export default function MentorReviewButton({
  reportId,
  reviewedAt,
  nextCheckinDate,
}: {
  reportId: string;
  reviewedAt: string | null;
  nextCheckinDate: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [checkinDate, setCheckinDate] = useState(nextCheckinDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markReviewed() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("mentor_mark_report_reviewed", {
      p_report_id: reportId,
      p_next_checkin: checkinDate || null,
    });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-500">
          {reviewedAt
            ? `Reviewed ${new Date(reviewedAt).toLocaleDateString()}`
            : "Not yet reviewed"}
          {nextCheckinDate && ` · Next check-in ${nextCheckinDate}`}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-brand-400 hover:text-brand-300 font-medium"
        >
          {reviewedAt ? "Update" : "Mark reviewed"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        type="date"
        value={checkinDate}
        onChange={(e) => setCheckinDate(e.target.value)}
        className="input text-xs py-1"
        aria-label="Next check-in date"
      />
      <button type="button" onClick={markReviewed} disabled={saving} className="btn-primary text-xs">
        {saving ? "Saving..." : "Save"}
      </button>
      <button
        type="button"
        onClick={() => {
          setEditing(false);
          setError(null);
        }}
        className="text-xs text-slate-400 hover:text-slate-200"
      >
        Cancel
      </button>
      {error && <p className="text-xs text-red-400 w-full">{error}</p>}
    </div>
  );
}
