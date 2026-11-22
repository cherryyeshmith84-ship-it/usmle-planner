"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type DemoMember = { id: string; email: string; name: string | null; active: boolean };

export default function DemoTeamAdmin({ members }: { members: DemoMember[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const e = email.trim().toLowerCase();
    if (!e || !e.includes("@")) {
      setError("Enter the person's email address.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await createClient().from("demo_team").insert({ email: e, name: name.trim() || null });
    setBusy(false);
    if (err) {
      setError(err.message.includes("duplicate") ? "That email is already on the demo team." : err.message);
      return;
    }
    setEmail("");
    setName("");
    router.refresh();
  }

  async function toggle(m: DemoMember) {
    const { error: err } = await createClient().from("demo_team").update({ active: !m.active }).eq("id", m.id);
    if (err) setError(err.message);
    else router.refresh();
  }

  async function remove(m: DemoMember) {
    if (!confirm(`Remove ${m.email} from the demo team?`)) return;
    const { error: err } = await createClient().from("demo_team").delete().eq("id", m.id);
    if (err) setError(err.message);
    else router.refresh();
  }

  return (
    <div className="card mb-8">
      <p className="text-sm font-semibold mb-1">Demo team</p>
      <p className="text-xs text-slate-500 mb-3">
        These people introduce Master Grid to new students and run the demo. They sign up or log in at the normal
        student login with the email you add here, then land on the New students page. They cannot see mentor or admin
        pages.
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        <input className="input max-w-[14rem]" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input max-w-xs" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="button" onClick={add} disabled={busy} className="btn-primary text-sm">
          {busy ? "Adding..." : "Add"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

      {members.length === 0 ? (
        <p className="text-sm text-slate-500">No demo team members yet.</p>
      ) : (
        <div className="space-y-1.5">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 text-sm rounded-lg border border-slate-800 px-3 py-2">
              <span>
                <b>{m.name || m.email}</b>
                {m.name ? <span className="text-slate-500"> · {m.email}</span> : null}
                {!m.active && <span className="text-xs text-amber-500"> · paused</span>}
              </span>
              <span className="flex items-center gap-3 text-xs">
                <button type="button" onClick={() => toggle(m)} className="text-slate-400 hover:text-slate-200">
                  {m.active ? "Pause" : "Activate"}
                </button>
                <button type="button" onClick={() => remove(m)} className="text-red-400 hover:text-red-300">
                  Remove
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
