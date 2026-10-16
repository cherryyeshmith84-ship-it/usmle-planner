"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type PassedRow = { id: string; name: string; students_passed: number };

/**
 * Admin-only: set how many students passed USMLE Step 1 with each mentor.
 * The number is shown to students on the mentor's card and profile.
 */
export default function MentorPassedEditor({ rows }: { rows: PassedRow[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(rows.map((r) => [r.id, String(r.students_passed ?? 0)]))
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(id: string) {
    const n = Math.max(0, Math.floor(Number(values[id])));
    if (Number.isNaN(n)) {
      setError("Enter a valid number.");
      return;
    }
    setBusyId(id);
    setError(null);
    setSavedId(null);
    const supabase = createClient();
    const { error: err } = await supabase.from("mentors").update({ students_passed: n }).eq("id", id);
    setBusyId(null);
    if (err) {
      setError(err.message);
      return;
    }
    setValues((v) => ({ ...v, [id]: String(n) }));
    setSavedId(id);
    router.refresh();
  }

  if (rows.length === 0) return null;

  return (
    <div className="card mb-6">
      <p className="text-sm font-semibold mb-1">Students passed</p>
      <p className="text-xs text-slate-400 mb-3">
        How many students passed Step 1 with each mentor. Students see this on the mentor&apos;s
        card and profile (hidden while it is 0).
      </p>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3">
            <span className="text-sm flex-1 min-w-0 truncate">{r.name}</span>
            <input
              type="number"
              min={0}
              value={values[r.id] ?? "0"}
              onChange={(e) => setValues((v) => ({ ...v, [r.id]: e.target.value }))}
              className="input !w-24 text-sm"
            />
            <button
              type="button"
              onClick={() => save(r.id)}
              disabled={busyId === r.id}
              className="btn-secondary text-xs"
            >
              {busyId === r.id ? "Saving..." : savedId === r.id ? "Saved ✓" : "Save"}
            </button>
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
