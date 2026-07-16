import Link from "next/link";
import { requireAdmin } from "@/lib/adminGuard";
import type { QBankQuestion } from "@/lib/qbankTypes";
import AdminNav from "@/components/AdminNav";
import QBankFilters from "@/components/QBankFilters";

export const dynamic = "force-dynamic";

export default async function AdminQuestionBankPage({
  searchParams,
}: {
  searchParams?: { status?: string; subject?: string; system?: string; difficulty?: string };
}) {
  const { supabase } = await requireAdmin();

  const { data } = await supabase
    .from("qbank_questions")
    .select("*")
    .order("created_at", { ascending: false });

  const allQuestions = (data ?? []) as QBankQuestion[];

  const statusFilter = searchParams?.status ?? "";
  const subjectFilter = searchParams?.subject ?? "";
  const systemFilter = searchParams?.system ?? "";
  const difficultyFilter = searchParams?.difficulty ?? "";

  const questions = allQuestions.filter((q) => {
    if (statusFilter && (q.meta?.status ?? "draft") !== statusFilter) return false;
    if (subjectFilter && !q.subjects.includes(subjectFilter)) return false;
    if (systemFilter && !q.systems.includes(systemFilter)) return false;
    if (difficultyFilter && q.meta?.difficulty !== difficultyFilter) return false;
    return true;
  });

  const hasFilters = !!(statusFilter || subjectFilter || systemFilter || difficultyFilter);

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold">Question bank</h1>
            <p className="text-sm text-slate-400">
              {hasFilters
                ? `${questions.length} of ${allQuestions.length} questions match these filters.`
                : `${allQuestions.length} question${allQuestions.length === 1 ? "" : "s"} in the pool.`}{" "}
              Students build their own custom tests from these by subject, system, and status.
            </p>
          </div>
          <Link href="/admin/qbank/new" className="btn-primary shrink-0">
            + Add question
          </Link>
        </div>

        <QBankFilters
          status={statusFilter}
          subject={subjectFilter}
          system={systemFilter}
          difficulty={difficultyFilter}
        />

        {allQuestions.length === 0 && (
          <p className="text-sm text-slate-400">
            No questions in the pool yet. Add one - you can paste a full question with its answer
            choices and it&apos;ll auto-split into the fields for you, then tag it with a subject
            and system.
          </p>
        )}

        {allQuestions.length > 0 && questions.length === 0 && (
          <p className="text-sm text-slate-400">No questions match these filters.</p>
        )}

        <div className="space-y-3">
          {questions.map((q) => (
            <div key={q.id} className="card hover:border-brand-500 transition">
              <Link href={`/admin/qbank/${q.id}`} className="block mb-2">
                <p className="text-sm font-semibold line-clamp-2">{q.question}</p>
              </Link>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex flex-wrap gap-1.5">
                  {q.subjects.map((s) => (
                    <span key={s} className="text-xs font-medium bg-brand-900/30 text-brand-300 rounded-full px-2 py-0.5">
                      {s}
                    </span>
                  ))}
                  {q.systems.map((s) => (
                    <span key={s} className="text-xs font-medium bg-slate-800 text-slate-300 rounded-full px-2 py-0.5">
                      {s}
                    </span>
                  ))}
                  {q.subjects.length === 0 && q.systems.length === 0 && (
                    <span className="text-xs text-amber-400">Untagged</span>
                  )}
                  {q.meta?.status && q.meta.status !== "published" && (
                    <span className="text-xs font-medium bg-amber-900/30 text-amber-300 rounded-full px-2 py-0.5">
                      {q.meta.status === "under_review" ? "Under review" : "Draft"}
                    </span>
                  )}
                </div>
                <Link
                  href={`/admin/qbank/${q.id}/performance`}
                  className="text-xs font-medium text-brand-400 hover:text-brand-300 shrink-0"
                >
                  View performance
                </Link>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
