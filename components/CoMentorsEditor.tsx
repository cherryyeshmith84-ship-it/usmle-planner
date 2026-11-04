"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CoMentorsEditor({
  studentId,
  mentors,
  coMentorIds,
  primaryMentorId,
}: {
  studentId: string;
  mentors: { id: string; name: string }[];
  coMentorIds: string[];
  primaryMentorId: string | null;
}) {
  const router = useRouter();
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = mentors.filter((m) => m.id !== primaryMentorId && !coMentorIds.includes(m.id));

  async function add() {
    if (!pick) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: err } = await supabase
      .from("student_co_mentors")
      .insert({ student_id: studentId, mentor_id: pick, granted_by: user?.id ?? null });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setPick("");
    router.refresh();
  }

  async function remove(mentorId: string) {
    if (!confirm("Remove this mentor's access to the student?")) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("student_co_mentors")
      .delete()
      .eq("student_id", studentId)
      .eq("mentor_id", mentorId);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Admin: add another mentor</p>
      <div className="flex items-center gap-2 flex-wrap">
        <select value={pick} onChange={(e) => setPick(e.target.value)} className="input text-xs py-1 px-2">
          <option value="">Choose a mentor...</option>
          {available.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={add} disabled={!pick || busy} className="btn-secondary text-xs py-1 px-2">
          {busy ? "Saving..." : "Add mentor"}
        </button>
        {coMentorIds.map((id) => {
          const m = mentors.find((x) => x.id === id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => remove(id)}
              disabled={busy}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Remove {m?.name ?? "mentor"}
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
