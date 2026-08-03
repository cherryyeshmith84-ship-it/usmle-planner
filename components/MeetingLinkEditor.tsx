"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Lets a mentor set (or update) the permanent meeting link for one specific
 * student, from that student's progress page
 * (app/mentorship/student/[studentId]/page.tsx). Different students of the
 * same mentor can have different rooms - this is per (mentor, student), not
 * a single link shared across every student (see mentor_meeting_links
 * table, one row per student_id). The student then sees this same link
 * wherever they'd join a call: their Dashboard's Upcoming Mentorship card,
 * their Sessions list, and their mentor's profile page.
 */
export default function MeetingLinkEditor({
  studentId,
  mentorId,
  currentUserId,
  initialLink,
  initialUpdatedAt,
}: {
  studentId: string;
  mentorId: string;
  currentUserId: string;
  initialLink: string | null;
  initialUpdatedAt: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!initialLink);
  const [link, setLink] = useState(initialLink ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!link.trim()) {
      setError("Paste a meeting link before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: saveError } = await supabase.from("mentor_meeting_links").upsert(
      {
        student_id: studentId,
        mentor_id: mentorId,
        created_by: currentUserId,
        meeting_link: link.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "student_id" }
    );
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm("Remove this student's meeting link?")) return;
    setSaving(true);
    const supabase = createClient();
    await supabase.from("mentor_meeting_links").delete().eq("student_id", studentId);
    setSaving(false);
    setLink("");
    setEditing(true);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="card">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-sm font-semibold">Meeting link</p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setEditing(true)} className="text-xs text-brand-400 hover:text-brand-300">
              Edit
            </button>
            <button type="button" onClick={remove} disabled={saving} className="text-xs text-red-400 hover:text-red-300">
              Remove
            </button>
          </div>
        </div>
        <a href={link} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-400 hover:text-brand-300 break-all">
          {link}
        </a>
        {initialUpdatedAt && (
          <p className="text-xs text-slate-500 mt-2">Last updated {new Date(initialUpdatedAt).toLocaleDateString()}</p>
        )}
        <p className="text-xs text-slate-500 mt-1">
          This student sees this link on their Dashboard and Sessions page whenever they have a session
          with you, and on your profile page.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="text-sm font-semibold mb-2">Meeting link</p>
      <p className="text-xs text-slate-500 mb-2">
        This student's permanent room - different from other students' links if you use one. They'll
        see it on their Dashboard, Sessions page, and your profile.
      </p>
      <input
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder="https://meet.google.com/..."
        className="input w-full text-sm"
      />
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      <div className="flex items-center gap-2 mt-2">
        <button type="button" onClick={save} disabled={saving} className="btn-primary text-xs">
          {saving ? "Saving..." : "Save link"}
        </button>
        {initialLink && (
          <button
            type="button"
            onClick={() => {
              setLink(initialLink ?? "");
              setEditing(false);
              setError(null);
            }}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
