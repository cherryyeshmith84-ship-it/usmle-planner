import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { STEP1_SYSTEMS, type QBankQuestion } from "@/lib/qbankTypes";
import { computeDashboardInsights, computeMasteryGrid, type QBankAnswerEvent } from "@/lib/masteryDashboard";
import AppShell from "@/components/AppShell";
import MasteryGridClient from "@/components/MasteryGridClient";

export const dynamic = "force-dynamic";

/**
 * The full performance map: System -> Topic -> Concept, computed from every
 * submitted Question Bank answer this student has. This is the "signature
 * page" version of the mini System table shown on the Home dashboard - same
 * underlying math (lib/masteryDashboard.ts), just the complete drill-down
 * instead of a top-5 preview.
 */
export default async function MasterGridPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("is_admin, full_name")
    .eq("id", user.id)
    .single();

  const [qbankSessionsRes, qbankQuestionsRes] = await Promise.all([
    supabase
      .from("qbank_test_sessions")
      .select("answers, submitted_at")
      .eq("user_id", user.id)
      .not("submitted_at", "is", null),
    supabase.from("qbank_questions").select("*"),
  ]);

  const qbankSessions = (qbankSessionsRes.data ?? []) as {
    answers: Record<string, string> | null;
    submitted_at: string | null;
  }[];
  const qbankQuestions = (qbankQuestionsRes.data ?? []) as QBankQuestion[];
  const questionById = new Map(qbankQuestions.map((q) => [q.id, q]));

  const qbankEvents: QBankAnswerEvent[] = [];
  for (const session of qbankSessions) {
    if (!session.submitted_at) continue;
    for (const [questionId, choiceId] of Object.entries(session.answers ?? {})) {
      if (!choiceId) continue;
      qbankEvents.push({ questionId, choiceId, submittedAt: session.submitted_at });
    }
  }

  const insights = computeDashboardInsights(qbankEvents, questionById, 0, 0);
  const grid = computeMasteryGrid(qbankEvents, questionById);

  return (
    <AppShell isAdmin={profileData?.is_admin} userName={profileData?.full_name}>
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8 w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Master Grid</h1>
          <p className="text-sm text-slate-400 mt-1">
            Your complete performance map, built from every Question Bank question you&apos;ve
            answered. Click a system to drill into topics, then a topic to drill into concepts.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div className="card py-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Questions answered</p>
            <p className="text-lg font-bold mt-1">{insights.totalAnswered.toLocaleString()}</p>
          </div>
          <div className="card py-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Overall accuracy</p>
            <p className="text-lg font-bold mt-1">
              {insights.totalAnswered > 0 ? `${insights.overallAccuracyPct}%` : "—"}
            </p>
          </div>
          <div className="card py-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Mastery</p>
            <p className="text-lg font-bold mt-1">{insights.masteryPct !== null ? `${insights.masteryPct}%` : "—"}</p>
          </div>
        </div>

        {insights.totalAnswered === 0 ? (
          <div className="card">
            <p className="text-sm text-slate-400">
              You haven&apos;t answered any Question Bank questions yet. Take a test from the{" "}
              <a href="/qbank" className="text-brand-400 hover:text-brand-300 font-medium">
                Question Bank
              </a>{" "}
              and this page will fill in with your real performance map.
            </p>
          </div>
        ) : (
          <MasteryGridClient allSystems={STEP1_SYSTEMS} grid={grid} />
        )}
      </main>
    </AppShell>
  );
}
