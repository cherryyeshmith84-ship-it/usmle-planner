"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Admin-only control on the "Waiting for a mentor" list (app/admin/page.tsx)
 * to pull a specific student OUT of every mentor's self-service Waiting
 * list (app/mentorship/waiting/page.tsx) without assigning them a mentor -
 * e.g. a spam/test signup, or someone the admin wants to route by hand
 * instead of leaving open for any mentor to self-claim. Writes
 * profiles.waiting_hidden directly - already covered by the existing
 * "Admins can update all profiles" RLS policy, no new grant needed. Hiding
 * doesn't touch mentor_email, so the student stays visible right here on
 * the admin list either way (with a badge showing the current state) -
 * only the mentor-facing Waiting list respects this flag.
 */
export default function WaitingVisibilityToggle({
  studentId,
  hidden,
}: {
  studentId: string;
  hidden: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: saveError } = await supabase
      .from("profiles")
      .update({ waiting_hidden: !hidden })
      .eq("id", studentId);
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        className={`text-xs font-semibold ${hidden ? "text-brand-400 hover:text-brand-300" : "text-red-400 hover:text-red-300"}`}
      >
        {saving ? "Saving..." : hidden ? "Unhide from mentors" : "Hide from mentors"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
