import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/adminGuard";
import { choiceStatsToPercents, type ChoiceStatRow } from "@/lib/qbank";
import type { QBankQuestion } from "@/lib/qbankTypes";
import AdminNav from "@/components/AdminNav";

export const dynamic = "force-dynamic";

/**
 * Per-question analytics: how many students have attempted it, the overall
 * % correct, a breakdown of which choice each student picked, and - most
 * useful for spotting a genuinely ambiguous question vs. a real misconception -
 * whichever wrong choice gets picked most, along with whatever Error DNA
 * (error type / confused with / weak concept / error note) the admin tagged
 * on that choice in the editor.
 */
export default async function QBankQuestionPerformancePage({ params }: { params: { id: string } }) {
  const { supabase } = await requireAdmin();

  const { data: questionData } = await supabase
    .from("qbank_questions")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!questionData) notFound();
  const question = questionData as QBankQuestion;

  const { data: statRows } = await supabase.rpc("qbank_choice_stats", { p_question_id: question.id });
  const { percents, counts, total } = choiceStatsToPercents((statRows ?? []) as ChoiceStatRow[]);

  const correctCount = counts[question.correct_choice_id] ?? 0;
  const correctPct = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  const wrongChoices = question.choices.filter((c) => c.id !== question.correct_choice_id);
  const mostMissed = wrongChoices
    .map((c) => ({ choice: c, count: counts[c.id] ?? 0, pct: percents[c.id] ?? 0 }))
    .sort((a, b) => b.count - a.count)[0];
  const mostMissedLetter =
    mostMissed && question.choices.findIndex((c) => c.id === mostMissed.choice.id) >= 0
      ? String.fromCharCode(65 + question.choices.findIndex((c) => c.id === mostMissed.choice.id))
      : "";

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8">
        <Link
          href={`/admin/qbank/${question.id}`}
          className="text-sm text-brand-400 hover:text-brand-300 mb-4 inline-block"
        >
          &larr; Back to question
        </Link>
        <h1 className="text-xl font-bold mb-1">Question performance</h1>
        <p className="text-sm text-slate-400 mb-6 line-clamp-3">{question.question}</p>

        <div className="card mb-4">
          <div className="flex items-center gap-4">
            <span
              className={`text-3xl font-bold ${
                total === 0
                  ? "text-slate-500"
                  : correctPct >= 70
                  ? "text-green-400"
                  : correctPct >= 50
                  ? "text-brand-300"
                  : "text-red-400"
              }`}
            >
              {total > 0 ? `${correctPct}%` : "—"}
            </span>
            <span className="text-sm text-slate-400">
              {total} attempt{total === 1 ? "" : "s"}
              {total > 0 ? ` · ${correctPct}% correct` : " so far"}
            </span>
          </div>
        </div>

        <div className="card mb-4">
          <h2 className="font-semibold mb-3">Answer breakdown</h2>
          {total === 0 ? (
            <p className="text-sm text-slate-400">No one has answered this question yet.</p>
          ) : (
            <div className="space-y-3">
              {question.choices.map((c, i) => {
                const isCorrect = c.id === question.correct_choice_id;
                const pct = percents[c.id] ?? 0;
                const count = counts[c.id] ?? 0;
                return (
                  <div key={c.id}>
                    <div className="flex items-center justify-between gap-2 text-sm mb-1">
                      <span className={isCorrect ? "text-green-400 font-medium" : "text-slate-300"}>
                        {String.fromCharCode(65 + i)}. {c.text}
                        {isCorrect ? " (correct)" : ""}
                      </span>
                      <span className="text-xs text-slate-400 shrink-0">
                        {pct}% ({count})
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isCorrect ? "bg-green-500" : "bg-slate-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {mostMissed && mostMissed.count > 0 && (
          <div className="card">
            <h2 className="font-semibold mb-2">Most common error</h2>
            <p className="text-sm text-slate-300 mb-2">
              {mostMissed.pct}% of students picked{" "}
              <span className="font-medium text-red-400">
                {mostMissedLetter}. {mostMissed.choice.text}
              </span>{" "}
              instead of the correct answer.
            </p>
            {(mostMissed.choice.error_type || mostMissed.choice.confused_with || mostMissed.choice.weak_concept) && (
              <div className="flex flex-wrap gap-2 mb-2">
                {mostMissed.choice.error_type && (
                  <span className="text-xs text-slate-400 bg-slate-800 rounded-full px-2 py-1">
                    Error type: {mostMissed.choice.error_type}
                  </span>
                )}
                {mostMissed.choice.confused_with && (
                  <span className="text-xs text-slate-400 bg-slate-800 rounded-full px-2 py-1">
                    Confused with: {mostMissed.choice.confused_with}
                  </span>
                )}
                {mostMissed.choice.weak_concept && (
                  <span className="text-xs text-slate-400 bg-slate-800 rounded-full px-2 py-1">
                    Weak concept: {mostMissed.choice.weak_concept}
                  </span>
                )}
              </div>
            )}
            {mostMissed.choice.error_note && (
              <p className="text-sm text-amber-400">Error note: {mostMissed.choice.error_note}</p>
            )}
            {!mostMissed.choice.error_type &&
              !mostMissed.choice.confused_with &&
              !mostMissed.choice.weak_concept &&
              !mostMissed.choice.error_note && (
                <p className="text-xs text-slate-500">
                  No Error DNA tagged on this choice yet - add one in the question editor to see it
                  surfaced here.
                </p>
              )}
          </div>
        )}
      </main>
    </div>
  );
}
