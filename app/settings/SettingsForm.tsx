"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

export default function SettingsForm({
  profile,
  userId,
  email,
}: {
  profile: Profile;
  userId: string;
  email: string;
}) {
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [mentorEmail, setMentorEmail] = useState(profile.mentor_email ?? "");
  const [tutorEmail, setTutorEmail] = useState(profile.tutor_email ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName || null,
        mentor_email: mentorEmail.trim() || null,
        tutor_email: tutorEmail.trim() || null,
      })
      .eq("id", userId);

    setSaving(false);
    setMsg(error ? `Error: ${error.message}` : "Saved.");
    setTimeout(() => setMsg(null), 2500);
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="card">
        <h2 className="font-semibold mb-4">Account</h2>
        <label className="label">Email</label>
        <input className="input mb-4 bg-slate-800" value={email} disabled />
        <label className="label">Name</label>
        <input className="input mb-4" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <label className="label">Your mentor&apos;s email</label>
        <input
          type="email"
          className="input"
          placeholder="e.g. mentor@example.com - leave blank if you don't have one"
          value={mentorEmail}
          onChange={(e) => setMentorEmail(e.target.value)}
        />
        <p className="text-xs text-slate-500 mt-1">
          Gives that mentor access to your planner, notes, and analysis. Leave blank to remove access.
        </p>

        <label className="label mt-4">Your tutor&apos;s email</label>
        <input
          type="email"
          className="input"
          placeholder="e.g. tutor@example.com - leave blank if you don't have one"
          value={tutorEmail}
          onChange={(e) => setTutorEmail(e.target.value)}
        />
        <p className="text-xs text-slate-500 mt-1">
          Separate from your mentor above - gives your tutor access to your planner, notes, and
          analysis, and adds you to their list of tutoring students. Leave blank to remove access.
        </p>
      </div>

      {msg && <p className="text-sm text-slate-300">{msg}</p>}
      <button className="btn-primary" disabled={saving}>
        {saving ? "Saving..." : "Save settings"}
      </button>
    </form>
  );
}
