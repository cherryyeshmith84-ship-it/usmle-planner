"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * The one global switch that decides whether students can see Question
 * Bank, Self Assessments, Master Grid, Anki/Smart Review, Error Notes, and
 * Visual Lab - or a "coming soon" placeholder instead. Admins always see
 * everything regardless of this switch. Flips the single row in
 * platform_settings (id is always `true`).
 */
export default function PublishToggle({ initialPublished }: { initialPublished: boolean }) {
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
      .update({ content_published: next, updated_at: new Date().toISOString() })
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
            Student content is currently{" "}
            <span className={published ? "text-green-400" : "text-amber-400"}>
              {published ? "published" : "hidden"}
            </span>
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {published
              ? "Students can see Question Bank, Self Assessments, Master Grid, Anki, Error Notes, and Visual Lab. Study Planner is always visible either way."
              : "Students only see Study Planner right now - everything else shows a \"coming soon\" placeholder. You (admin) always see everything."}
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
