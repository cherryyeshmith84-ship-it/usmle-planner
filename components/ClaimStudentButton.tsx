"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * "Take this student" button on the Waiting list
 * (app/mentorship/waiting/page.tsx) - first-come-first-served self-assign
 * for a student who signed up but has no mentor yet. Calls the
 * claim_waiting_student Postgres function instead of updating
 * profiles.mentor_email directly: that function is SECURITY DEFINER so a
 * mentor doesn't need a broad UPDATE grant on the profiles table (which
 * would risk letting a mentor edit a student's other fields, or steal a
 * student who already has a mentor), and it atomically checks
 * mentor_email is still null before claiming - so if two mentors click
 * "Take" on the same student within moments of each other, only the first
 * call succeeds and the second gets a clear error instead of silently
 * overwriting the first mentor's claim.
 *
 * Once claimed, this student's mentor_email is no longer null, so they
 * naturally drop out of the Waiting query (see the page's RLS-backed
 * fetch) on the next refresh - no separate "remove from list" step needed.
 */
export default function ClaimStudentButton({ studentId }: { studentId: string }) {
  const router = useRouter();
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claim() {
    if (!confirm("Take this student as your mentee? They'll be added to your Students list.")) return;
    setClaiming(true);
    setError(null);
    const supabase = createClient();
    const { error: claimError } = await supabase.rpc("claim_waiting_student", { p_student_id: studentId });
    setClaiming(false);
    if (claimError) {
      setError(claimError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button type="button" onClick={claim} disabled={claiming} className="btn-primary text-xs">
        {claiming ? "Taking..." : "Take this student"}
      </button>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}
