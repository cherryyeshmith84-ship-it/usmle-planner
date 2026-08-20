"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Lets a tutor type in their own specialties, free text - no fixed
 * dropdown list, since tutors describe their focus differently ("Neuro",
 * "Epi", "Cardio + Renal", etc). Saved as a comma-separated list, split
 * into a string[] (mentors.specialties). These tags drive the
 * subject-grouped sections on the student-facing Tutoring directory
 * (app/tutoring/page.tsx) - a tutor with no specialties set yet just
 * doesn't show up under any subject section until they add one.
 *
 * Shown only on the tutor's own Tutoring dashboard - never on the
 * Mentorship side, and there's deliberately no "availability" language
 * here at all, unlike the shared mentor slot-calendar page.
 */
export default function TutorSpecialtiesEditor({
  mentorId,
  initialSpecialties,
}: {
  mentorId: string;
  initialSpecialties: string[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(initialSpecialties.length === 0);
  const [text, setText] = useState(initialSpecialties.join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function parse(raw: string): string[] {
    return Array.from(
      new Set(
        raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const specialties = parse(text);
    const { error: saveError } = await supabase.from("mentors").update({ specialties }).eq("id", mentorId);
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  const currentTags = parse(text);

  if (!editing) {
    return (
      <div className="card">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-sm font-semibold">Your specialties</p>
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-brand-400 hover:text-brand-300">
            Edit
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {currentTags.map((tag) => (
            <span
              key={tag}
              className="text-xs font-semibold rounded-full px-2.5 py-1 bg-brand-900/40 text-brand-300"
            >
              {tag}
            </span>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Students find you under these subject sections on the Tutoring page.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="text-sm font-semibold mb-2">Your specialties</p>
      <p className="text-xs text-slate-500 mb-2">
        What you tutor, comma-separated (e.g. &ldquo;Neuro, Epi, Cardio&rdquo;). Students find you
        under each of these as its own section on the Tutoring page.
      </p>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Neuro, Epi, Pharm..."
        className="input w-full text-sm"
      />
      {currentTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {currentTags.map((tag) => (
            <span
              key={tag}
              className="text-xs font-semibold rounded-full px-2.5 py-1 bg-brand-900/40 text-brand-300"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      <div className="flex items-center gap-2 mt-3">
        <button type="button" onClick={save} disabled={saving} className="btn-primary text-xs">
          {saving ? "Saving..." : "Save specialties"}
        </button>
        {initialSpecialties.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setText(initialSpecialties.join(", "));
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
