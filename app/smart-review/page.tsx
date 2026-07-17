import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { QBankQuestion } from "@/lib/qbankTypes";
import { computeSmartReviewQueue, type QBankAnswerEvent } from "@/lib/masteryDashboard";
import { computeAllConceptMasteryStates, MASTERY_LABELS, type MasteryState } from "@/lib/conceptMastery";
import AppShell from "@/components/AppShell";

export const dynamic = "force-dynamic";

const MASTERY_BADGE_CLASS: Record<MasteryState, string> = {
  learning: "bg-red-900/30 text-red-300",
  improving: "bg-amber-900/30 text-amber-300",
  strong: "bg-green-900/30 text-green-300",
};

function priorityBadge(priority: "high" | "medium" | "low") {
  if (priority === "high") {
    return <span className="text-xs font-semibold bg-red-900/30 text-red-300 rounded-full px-2 py-0.5">High priority</span>;
  }
  if (priority === "medium") {
    return <span className="text-xs font-semibold bg-orange-900/30 text-orange-300 rounded-full px-2 py-0.5">Medium priority</span>;
  }
  return <span className="text-xs font-semibold bg-yellow-900/30 text-yellow-300 rounded-full px-2 py-0.5">Low priority</span>;
}

/**
 * A prioritized queue of concepts the student is still missing, pulled from
 * their recent Question Bank answer history (lib/masteryDashboard.ts). Not a
 * literal spaced-repetition scheduler - a concept is "due" as long as it's
 * had at least one miss in the student's last (up to) 7 attempts at it, and
 * priority reflects how often they're still getting it wrong. Once they
 * string together correct answers on a concept, it drops off the queue.
 */
export default async function SmartReviewPage() {
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

  const [qbankSessionsRes, qbankQuestionsRes, practiceRes] = await Promise.all([
    supabase
      .from("qbank_test_sessions")
      .select("answers, submitted_at")
      .eq("user_id", user.id)
      .not("submitted_at", "is", null),
    supabase.from("qbank_questions").select("*"),
    supabase
      .from("concept_practice_attempts")
      .select("concept, correct, created_at")
      .eq("user_id", user.id),
  ]);

  const qbankSessions = (qbankSessionsRes.data ?? []) as {
    answers: Record<string, string> | null;
    submitted_at: string | null;
  }[];
  const qbankQuestions = (qbankQuestionsRes.data ?? []) as QBankQuestion[];
  const questionById = new Map(qbankQuestions.map((q) => [q.id, q]));
  const practiceAttempts = (practiceRes.data ?? []) as {
    concept: string;
    correct: boolean;
    created_at: string;
  }[];

  const qbankEvents: QBankAnswerEvent[] = [];
  for (const session of qbankSessions) {
    if (!session.submitted_at) continue;
    for (const [questionId, choiceId] of Object.entries(session.answers ?? {})) {
      if (!choiceId) continue;
      qbankEvents.push({ questionId, choiceId, submittedAt: session.submitted_at });
    }
  }

  const queue = computeSmartReviewQueue(qbankEvents, questionById);
  const masteryByConcept = computeAllConceptMasteryStates(
    qbankEvents,
    questionById,
    practiceAttempts.map((p) => ({ concept: p.concept, correct: p.correct, createdAt: p.created_at }))
  );
  const highCount = queue.filter((q) => q.priority === "high").length;
  const mediumCount = queue.filter((q) => q.priority === "medium").length;
  const lowCount = queue.filter((q) => q.priority === "low").length;
  const hasAnyHistory = qbankEvents.length > 0;

  return (
    <AppShell isAdmin={profileData?.is_admin} userName={profileData?.full_name}>
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8 w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="text-purple-400">&#10022;</span> Smart Review
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {queue.length > 0
              ? `${queue.length} concept${queue.length === 1 ? "" : "s"} due for review - ${highCount} high · ${mediumCount} medium · ${lowCount} low priority`
              : "Your prioritized queue of concepts you're still missing, pulled from your Question Bank history."}
          </p>
        </div>

        {queue.length === 0 ? (
          <div className="card border-purple-900/40">
            <p className="text-sm text-slate-400">
              {hasAnyHistory
                ? "Nothing due right now - you're not currently missing any concept more than once recently. Nice work. Keep working the Question Bank and this will update automatically."
                : (
                  <>
                    You haven&apos;t answered enough Question Bank questions yet for a review queue to
                    form.{" "}
                    <Link href="/qbank" className="text-brand-400 hover:text-brand-300 font-medium">
                      Start a session
                    </Link>{" "}
                    and this page will fill in as you build up an answer history.
                  </>
                )}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {queue.map((item) => {
              const mastery = item.kind === "concept" ? masteryByConcept.get(item.key) ?? null : null;
              return (
              <div key={`${item.kind}:${item.key}`} className="card border-purple-900/40">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-sm font-semibold">{item.label}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    {mastery && (
                      <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${MASTERY_BADGE_CLASS[mastery]}`}>
                        {MASTERY_LABELS[mastery]}
                      </span>
                    )}
                    {priorityBadge(item.priority)}
                  </div>
                </div>
                <p className="text-xs text-slate-500 mb-1">
                  {item.kind === "concept"
                    ? `Missed ${item.missed} of your last ${item.total} related attempt${item.total === 1 ? "" : "s"}`
                    : `This exact mix-up has come up ${item.missed} time${item.missed === 1 ? "" : "s"} recently`}
                </p>
                {item.relatedConcepts.length > 0 && (
                  <p className="text-xs text-slate-500 mb-2">
                    Related concepts: {item.relatedConcepts.join(" · ")}
                  </p>
                )}
                {item.primaryProblem && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className="text-xs text-slate-400 bg-slate-800 rounded-full px-2 py-1">
                      Error pattern: {item.primaryProblem}
                    </span>
                  </div>
                )}
                {item.sampleQuestionId && item.sampleChoiceId ? (
                  <Link
                    href={`/error-notes/practice/${item.sampleQuestionId}/${item.sampleChoiceId}`}
                    className="btn-secondary inline-block text-sm mt-1"
                  >
                    Start Review &rarr;
                  </Link>
                ) : (
                  <Link href="/qbank" className="btn-secondary inline-block text-sm mt-1">
                    Start Review &rarr;
                  </Link>
                )}
              </div>
              );
            })}
          </div>
        )}
      </main>
    </AppShell>
  );
}
