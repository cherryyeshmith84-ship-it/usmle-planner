"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Admin-only "assign this student to a mentor" control - sets
 * profiles.mentor_email directly (RLS already lets an admin update any
 * profile, see "Admins can update all profiles"). This is the founding-
 * cohort counterpart to a student self-selecting a mentor from Settings:
 * here the admin picks who goes to whom, since applications come in first
 * and get matched manually rather than students choosing on their own.
 */
export default function MentorAssignSelect({
  studentId,
  mentors,
  currentMentorEmail,
}: {
  studentId: string;
  mentors: { id: string; name: string; email: string }[];
  currentMentorEmail: string | null;
}) {
  const router = useRouter();
  const currentMatch =
    mentors.find((m) => m.email.toLowerCase() === (currentMentorEmail ?? "").toLowerCase())?.email ?? "";
  const [value, setValue] = useState(currentMatch);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function assign() {
    setSaving(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("profiles")
      .update({ mentor_email: value || null })
      .eq("id", studentId);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMessage(value ? "Assigned." : "Mentor removed.");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
      <select
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setMessage(null);
        }}
        className="input text-xs py-1 px-2"
      >
        <option value="">No mentor</option>
        {mentors.map((m) => (
          <option key={m.id} value={m.email}>
            {m.name}
          </option>
        ))}
      </select>
      <button type="button" onClick={assign} disabled={saving} className="btn-secondary text-xs py-1 px-2">
        {saving ? "Saving..." : "Assign"}
      </button>
      {message && <span className="text-xs text-green-400">{message}</span>}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
