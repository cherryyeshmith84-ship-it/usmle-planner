"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Separate switch from PublishToggle.tsx, specifically for Tutoring -
 * decides whether students see the real Tutoring directory or a "coming
 * soon" placeholder at /tutoring. Defaults off, so adding tutors (via
 * /admin/tutors) never accidentally exposes an unfinished Tutoring section
 * to students - you flip this on deliberately once it's ready. Admins
 * always see the real thing regardless. Flips the single row in
 * platform_settings (id is always `true`).
 */
export default function TutoringPublishToggle({ initialPublished }: { initialPublished: boolean }) {
  const router = useRouter();
  const [published, setPublished] = useState(initialPublished);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !published;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("platform_settings")
      .update({ tutoring_published: next, updated_at: new Date().toISOString() })
      .eq("id", true);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setPublished(next);
    router.refresh();
  }

  return (
    <div className={`card ${published ? "border-green-900/40" : "border-amber-700"}`}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-semibold">
            Tutoring is currently{" "}
            <span className={published ? "text-green-400" : "text-amber-400"}>
              {published ? "published" : "hidden"}
            </span>
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {published
              ? "Students see the real Tutoring directory and can book with tutors."
              : "Students see a \"coming soon\" placeholder at Tutoring. You (admin) and any tutor you've added can still sign in and set up their profile in the meantime."}
          </p>
        </div>
        <button
          type="button"
          className={published ? "btn-secondary text-xs shrink-0" : "btn-primary text-xs shrink-0"}
          disabled={saving}
          onClick={toggle}
        >
          {saving ? "Saving..." : published ? "Hide from students" : "Publish to students"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
