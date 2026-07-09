import Link from "next/link";
import { requireAdmin } from "@/lib/adminGuard";
import type { Assessment, AssessmentAttempt } from "@/lib/types";
import AdminNav from "@/components/AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminQuestionBankPage() {
  const { supabase } = await requireAdmin();

  const [assessmentsRes, attemptsRes] = await Promise.all([
    supabase
      .from("assessments")
      .select("*")
      .eq("kind", "qbank")
      .order("created_at", { ascending: false }),
    supabase.from("assessment_attempts").select("assessment_id"),
  ]);

  const assessments = (assessmentsRes.data ?? []) as Assessment[];
  const attempts = (attemptsRes.data ?? []) as Pick<AssessmentAttempt, "assessment_id">[];
  const attemptCounts = new Map<string, number>();
  for (const a of attempts) {
    attemptCounts.set(a.assessment_id, (attemptCounts.get(a.assessment_id) ?? 0) + 1);
  }

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">Question bank</h1>
          <Link href="/admin/assessments/new?kind=qbank" className="btn-primary">
            New question bank item
          </Link>
        </div>

        {assessments.length === 0 && (
          <p className="text-sm text-slate-400">
            No question bank items yet. Create one and students can practice it as many
            times as they want from their Question Bank tab - paste a full question with
            options and it&apos;ll auto-split into the question and choices for you.
          </p>
        )}

        <div className="space-y-3">
          {assessments.map((a) => (
            <Link
              key={a.id}
              href={`/admin/assessments/${a.id}`}
              className="card block hover:border-brand-500 transition"
            >
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold">{a.name}</h3>
                <span className="text-xs font-semibold bg-slate-800 text-slate-300 rounded-full px-2 py-1">
                  {Math.max(1, Math.ceil(a.questions.length / (a.questions_per_block || 20)))} block
                  {Math.max(1, Math.ceil(a.questions.length / (a.questions_per_block || 20))) === 1 ? "" : "s"}
                </span>
              </div>
              <p className="text-sm text-slate-400">
                {a.questions.length} question{a.questions.length === 1 ? "" : "s"} · {a.questions_per_block}
                /block · {a.block_time_minutes} min/block
                {a.test_id ? ` · Test Id: ${a.test_id}` : ""} ·{" "}
                {attemptCounts.get(a.id) ?? 0} attempt{(attemptCounts.get(a.id) ?? 0) === 1 ? "" : "s"} so
                far
              </p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
