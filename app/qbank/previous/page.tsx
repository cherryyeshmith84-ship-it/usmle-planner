import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { QBankTestSession } from "@/lib/qbankTypes";
import AppShell from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function PreviousQBankTestsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileData } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  const profile = profileData as Profile | null;
  if (!profile?.onboarding_completed) redirect("/onboarding");

  const { data } = await supabase
    .from("qbank_test_sessions")
    .select("*")
    .eq("user_id", user.id)
    .order("started_at", { ascending: false });

  const sessions = (data ?? []) as QBankTestSession[];

  return (
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name}>
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8 w-full">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">Previous tests</h1>
          <Link href="/qbank" className="btn-primary">
            Create test
          </Link>
        </div>

        {sessions.length === 0 && <p className="text-sm text-slate-400">No tests yet - create your first custom test.</p>}

        <div className="space-y-2">
          {sessions.map((s) => {
            const pct = s.score_total ? Math.round(((s.score_correct ?? 0) / s.score_total) * 100) : null;
            const done = !!s.submitted_at;
            return (
              <Link
                key={s.id}
                href={`/qbank/take/${s.id}`}
                className="card flex items-center justify-between hover:border-brand-500 transition"
              >
                <div>
                  <p className="text-sm font-semibold">
                    {new Date(s.started_at).toLocaleString()} · {s.mode === "tutor" ? "Tutor" : "Timed"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {s.question_ids.length} question{s.question_ids.length === 1 ? "" : "s"}
                    {s.subjects.length > 0 ? ` · ${s.subjects.join(", ")}` : ""}
                    {s.systems.length > 0 ? ` · ${s.systems.join(", ")}` : ""}
                  </p>
                </div>
                {done ? (
                  <span
                    className={`text-sm font-semibold rounded-full px-3 py-1 shrink-0 ml-3 ${
                      pct !== null && pct >= 70 ? "bg-green-900/40 text-green-400" : pct !== null && pct >= 50 ? "bg-amber-900/40 text-amber-400" : "bg-red-900/40 text-red-400"
                    }`}
                  >
                    {s.score_correct}/{s.score_total} ({pct}%)
                  </span>
                ) : (
                  <span className="text-xs font-semibold rounded-full px-3 py-1 shrink-0 ml-3 bg-slate-800 text-slate-300">Resume</span>
                )}
              </Link>
            );
          })}
        </div>
      </main>
    </AppShell>
  );
}
