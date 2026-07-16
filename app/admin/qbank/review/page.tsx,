import Link from "next/link";
import { requireAdmin } from "@/lib/adminGuard";
import type { QBankQuestion } from "@/lib/qbankTypes";
import AdminNav from "@/components/AdminNav";
import QBankReviewActions from "@/components/QBankReviewActions";

export const dynamic = "force-dynamic";

/** Same checklist shown in the editor's "Question quality" card, reused here
 * so the reviewer can see at a glance what's still missing without opening
 * each question. */
function checklistFor(q: QBankQuestion) {
  const wrongChoices = q.choices.filter((c) => c.id !== q.correct_choice_id);
  return [
    { label: "Correct answer selected", ok: !!q.correct_choice_id },
    {
      label: "All options have explanations",
      ok: q.choices.length > 0 && q.choices.every((c) => (c.rationale ?? "").trim().length > 0),
    },
    {
      label: "All wrong options have Error Notes",
      ok: wrongChoices.length === 0 || wrongChoices.every((c) => (c.error_note ?? "").trim().length > 0),
    },
    { label: "System and discipline selected", ok: q.subjects.length > 0 && q.systems.length > 0 },
    { label: "Educational objective completed", ok: (q.meta?.educational_objective ?? "").trim().length > 0 },
    { label: "Main explanation added", ok: q.explanation.trim().length > 0 },
  ];
}

/** Review queue: every question an author has marked "Send for review",
 * with a quick quality checklist and one-click Publish / Send back to
 * draft, so the whole draft -> review -> publish loop doesn't require
 * opening the full editor unless something needs fixing. */
export default async function QBankReviewPage() {
  const { supabase } = await requireAdmin();

  const { data } = await supabase
    .from("qbank_questions")
    .select("*")
    .eq("meta->>status", "under_review")
    .order("updated_at", { ascending: false });

  const questions = (data ?? []) as QBankQuestion[];

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold">Question review</h1>
          <p className="text-sm text-slate-400">
            {questions.length} question{questions.length === 1 ? "" : "s"} waiting for review. Publish
            when it&apos;s ready, or send it back to draft if it still needs work.
          </p>
        </div>

        {questions.length === 0 && (
          <p className="text-sm text-slate-400">Nothing waiting for review right now.</p>
        )}

        <div className="space-y-3">
          {questions.map((q) => {
            const checklist = checklistFor(q);
            const failing = checklist.filter((c) => !c.ok);
            const canPublish = !!q.correct_choice_id && q.explanation.trim().length > 0;
            return (
              <div key={q.id} className="card">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <Link
                    href={`/admin/qbank/${q.id}`}
                    className="text-sm font-semibold hover:text-brand-300 line-clamp-2"
                  >
                    {q.question || "(no question text yet)"}
                  </Link>
                  <Link
                    href={`/admin/qbank/${q.id}/performance`}
                    className="text-xs text-brand-400 hover:text-brand-300 shrink-0"
                  >
                    Performance
                  </Link>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  {q.subjects.map((s) => (
                    <span
                      key={s}
                      className="text-xs font-medium bg-brand-900/30 text-brand-300 rounded-full px-2 py-0.5"
                    >
                      {s}
                    </span>
                  ))}
                  {q.systems.map((s) => (
                    <span
                      key={s}
                      className="text-xs font-medium bg-slate-800 text-slate-300 rounded-full px-2 py-0.5"
                    >
                      {s}
                    </span>
                  ))}
                  {q.subjects.length === 0 && q.systems.length === 0 && (
                    <span className="text-xs text-amber-400">Untagged</span>
                  )}
                </div>

                {failing.length > 0 ? (
                  <div className="mb-3 space-y-1">
                    {failing.map((c) => (
                      <p key={c.label} className="text-xs text-amber-400 flex items-center gap-1.5">
                        <span>&#9888;</span> {c.label}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-green-400 mb-3 flex items-center gap-1.5">
                    <span>&#10003;</span> Passes the quality checklist
                  </p>
                )}

                <QBankReviewActions question={q} canPublish={canPublish} />
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
