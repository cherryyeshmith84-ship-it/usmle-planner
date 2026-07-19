import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { QBankQuestion } from "@/lib/qbankTypes";
import { buildReframedExplanation, extractQuestionAsk } from "@/lib/errorNotes";
import { decodeSessionQueue, sessionHrefAt } from "@/lib/reviewSession";
import AppShell from "@/components/AppShell";
import ErrorNotePracticeClient from "@/components/ErrorNotePracticeClient";

export const dynamic = "force-dynamic";

export default async function ErrorNotePracticePage({
  params,
  searchParams,
}: {
  params: { questionId: string; choiceId: string };
  searchParams?: { session?: string; pos?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profileRes, questionRes] = await Promise.all([
    supabase.from("profiles").select("is_admin, full_name").eq("id", user.id).single(),
    supabase.from("qbank_questions").select("*").eq("id", params.questionId).single(),
  ]);

  const profile = profileRes.data as { is_admin?: boolean; full_name?: string } | null;
  if (!questionRes.data) notFound();
  const q = questionRes.data as QBankQuestion;

  const chosen = q.choices.find((c) => c.id === params.choiceId);
  const correctChoice = q.choices.find((c) => c.id === q.correct_choice_id);
  // Only makes sense for an actual wrong choice on this question.
  if (!chosen || !correctChoice || chosen.id === correctChoice.id) notFound();

  const concept = q.meta?.primary_concept?.trim() || q.meta?.topic?.trim() || "this concept";
  const questionAsk = extractQuestionAsk(q.question);

  // If this page was reached from Smart Review's "Start full review
  // session," these two params carry the whole session along in the URL -
  // no database row for it. sessionTotal/sessionIndex are for the "2 of 5"
  // progress pill, nextHref is what the "Next concept" button on the
  // finished screen points to (null once this was the last item).
  const encodedQueue = searchParams?.session;
  const pos = Number.parseInt(searchParams?.pos ?? "", 10);
  const sessionQueue = encodedQueue ? decodeSessionQueue(encodedQueue) : [];
  const inSession = sessionQueue.length > 0 && Number.isInteger(pos) && pos >= 0 && pos < sessionQueue.length;
  const sessionTotal = inSession ? sessionQueue.length : null;
  const sessionIndex = inSession ? pos + 1 : null;
  const nextHref = inSession && encodedQueue ? sessionHrefAt(encodedQueue, pos + 1) : null;
  const reframed = buildReframedExplanation({
    chosenText: chosen.text,
    correctText: correctChoice.text,
    confusedWith: chosen.confused_with ?? null,
    weakConcept: chosen.weak_concept ?? null,
    correctKeyConcept: correctChoice.key_concept ?? null,
    questionAsk,
  });

  return (
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name}>
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8 w-full space-y-6">
        <div>
          <div className="flex items-center justify-between gap-3">
            <Link
              href={inSession ? "/smart-review" : "/error-notes"}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              &larr; {inSession ? "Exit review session" : "Back to Error Notes"}
            </Link>
            {inSession && (
              <span className="text-xs font-semibold text-purple-300 bg-purple-900/30 rounded-full px-2.5 py-1">
                Review session &middot; {sessionIndex} of {sessionTotal}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold mt-2">Master This Weakness</h1>
          <p className="text-sm text-slate-400 mt-1">{concept}</p>
        </div>

        <div className="card border-red-900/30">
          <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-2">
            Step 1 of 3 &middot; Quick Fix
          </p>
          <p className="text-sm text-slate-200 mb-3">{reframed}</p>
          {chosen.error_note && (
            <p className="text-xs text-amber-400 mb-3">The mix-up: {chosen.error_note}</p>
          )}
          <div className="flex flex-wrap gap-2 mb-3">
            {chosen.error_type && (
              <span className="text-xs text-slate-400 bg-slate-800 rounded-full px-2 py-1">
                {chosen.error_type}
              </span>
            )}
            {chosen.weak_concept && (
              <span className="text-xs text-slate-400 bg-slate-800 rounded-full px-2 py-1">
                {chosen.weak_concept}
              </span>
            )}
          </div>
          <details className="mt-1">
            <summary className="text-xs text-brand-400 hover:text-brand-300 cursor-pointer">
              Show the full original question
            </summary>
            <p className="text-sm text-slate-300 mt-2 whitespace-pre-line">{q.question}</p>
          </details>
        </div>

        <ErrorNotePracticeClient
          concept={concept}
          weakConcept={chosen.weak_concept ?? null}
          errorNote={chosen.error_note ?? null}
          originalQuestion={q.question}
          userId={user.id}
          sessionIndex={sessionIndex}
          sessionTotal={sessionTotal}
          nextHref={nextHref}
        />
      </main>
    </AppShell>
  );
}
