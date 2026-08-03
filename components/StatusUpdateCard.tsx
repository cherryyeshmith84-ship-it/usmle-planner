"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatSlotDate, formatSlotTime } from "@/lib/mentors";

/**
 * A student's own free-text "status" for their mentor - separate from the
 * daily planner mood (one emoji per logged day). This is a single, always-
 * current line the student can update whenever they like, from either
 * Settings or right on the Home dashboard (same component, mounted twice -
 * see app/settings/page.tsx and app/dashboard/page.tsx). Whichever mentor
 * they've linked under "Your mentor's email" sees it on their student list
 * and student detail page (RLS already allows a linked mentor to read this
 * student's profile row, so no extra policy was needed for these two
 * columns - see the "Mentors can view profiles of students who linked
 * their email" policy).
 */
export default function StatusUpdateCard({
  userId,
  initialStatus,
  initialUpdatedAt,
}: {
  userId: string;
  initialStatus: string | null;
  initialUpdatedAt: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus ?? "");
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialStatus ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setDraft(status);
    setError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ status_update: draft.trim() || null, status_updated_at: draft.trim() ? now : null })
      .eq("id", userId);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setStatus(draft.trim());
    setUpdatedAt(draft.trim() ? now : null);
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="card">
      <p className="text-sm font-semibold mb-1">Your status</p>
      <p className="text-xs text-slate-500 mb-3">
        A quick note for your mentor - what&apos;s going on, how you&apos;re feeling about your prep,
        anything you want them to know before your next check-in.
      </p>
      {editing ? (
        <div className="space-y-2">
          <textarea
            className="input"
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. Feeling behind on Biochem this week, otherwise on track."
            autoFocus
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex items-center gap-3">
            <button type="button" onClick={save} disabled={saving} className="btn-primary text-sm">
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : status ? (
        <div>
          <p className="text-sm text-slate-300 whitespace-pre-wrap">{status}</p>
          {updatedAt && (
            <p className="text-xs text-slate-600 mt-1">
              Updated {formatSlotDate(updatedAt)} at {formatSlotTime(updatedAt)}
            </p>
          )}
          <button type="button" onClick={startEdit} className="text-xs text-brand-400 hover:text-brand-300 mt-2">
            Edit status
          </button>
        </div>
      ) : (
        <button type="button" onClick={startEdit} className="btn-secondary text-sm">
          Add a status
        </button>
      )}
    </div>
  );
}
