"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TermsText from "./TermsText";
import { TERMS_ACCEPT_STATEMENT } from "@/lib/terms";

/**
 * Full-screen blocking overlay shown by AppShell to any student who hasn't
 * yet accepted the current TERMS_VERSION. Nothing else on the page is
 * rendered until they tick the box and press Accept (AppShell renders this
 * INSTEAD of the page content). Acceptance is recorded server-side by
 * /api/terms/accept (name, email, timestamp, IP, browser, version) and is
 * visible to admins under Admin -> Terms acceptances.
 */
export default function TermsGate({ userName }: { userName?: string | null }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    if (!checked || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/terms/accept", { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Could not save your acceptance. Please try again.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-[#f0fdfe] overflow-y-auto">
      <div className="min-h-full flex items-center justify-center px-4 py-8">
        <div className="card w-full max-w-3xl">
          <h1 className="text-xl font-bold mb-1">
            Welcome{userName ? `, ${userName.trim().split(/\s+/)[0]}` : ""} - one last step
          </h1>
          <p className="text-sm text-slate-400 mb-4">
            Please read our Terms and Conditions and Refund Policy below. You need to accept them to
            continue using Master Grid.
          </p>

          <div className="border border-slate-800 rounded-xl p-4 h-[50vh] overflow-y-auto bg-white">
            <TermsText />
          </div>

          <label className="flex items-start gap-3 mt-4 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-1 w-5 h-5 shrink-0"
            />
            <span className="text-sm text-slate-300">{TERMS_ACCEPT_STATEMENT}</span>
          </label>

          {error && <p className="text-sm text-red-400 mt-3">{error}</p>}

          <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-sm text-slate-400 hover:text-slate-300">
                Log out
              </button>
            </form>
            <button type="button" onClick={accept} disabled={!checked || saving} className="btn-primary">
              {saving ? "Saving..." : "Accept and continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
