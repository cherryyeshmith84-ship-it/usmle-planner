import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { QBankQuestion } from "@/lib/qbankTypes";
import { buildReframedExplanation, extractQuestionAsk } from "@/lib/errorNotes";
import { canonicalConceptFor, type QBankAnswerEvent } from "@/lib/masteryDashboard";
import { computeAllConceptMasteryStates, MASTERY_LABELS, type MasteryState } from "@/lib/conceptMastery";
import AppShell from "@/components/AppShell";

export const dynamic = "force-dynamic";

interface ErrorNoteEntry {
  questionId: string;
  choiceId: string;
  questionText: string;
  chosenText: string;
  correctText: string;
  reframed: string;
  errorNote: string | null;
  errorType: string | null;
  confusedWith: string | null;
  weakConcept: string | null;
  missedCount: number;
  lastMissedAt: string;
  masteryState: MasteryState | null;
}

const MASTERY_BADGE_CLASS: Record<MasteryState, string> = {
  learning: "bg-red-900/30 text-red-300",
  improving: "bg-amber-900/30 text-amber-300",
  strong: "bg-green-900/30 text-green-300",
};

/**
 * Every misconception this student has actually hit, pulled straight from
 * the Error DNA tags (error_note/error_type/confused_with/weak_concept) an
 * admin set on the wrong choice they picked. One card per distinct
 * question+wrong-choice pairing - if they've missed the same one more than
 * once (e.g. on a retake), that's shown as a "Missed Nx" badge instead of
 * duplicate cards. Each card leads with a plain-language recap of the
 * mistake (what they picked, why that's tempting, what was actually being
 * asked, why the real answer is right) built by lib/errorNotes.ts, rather
 * than just the raw tag fields.
 */
export default async function ErrorNotesPage() {
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

  const [sessionsRes, questionsRes, practiceRes] = await Promise.all([
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

  const sessions = (sessionsRes.data ?? []) as {
    answers: Record<string, string> | null;
    submitted_at: string | null;
  }[];
  const questions = (questionsRes.data ?? []) as QBankQuestion[];
  const questionById = new Map(questions.map((q) => [q.id, q]));
  const practiceAttempts = (practiceRes.data ?? []) as {
    concept: string;
    correct: boolean;
    created_at: string;
  }[];

  // Full answer history (not just misses) so mastery state can be computed
  // the same way Smart Review groups concepts - primary concept, falling
  // back to topic/subtopic.
  const qbankEvents: QBankAnswerEvent[] = [];
  for (const session of sessions) {
    if (!session.submitted_at) continue;
    for (const [questionId, choiceId] of Object.entries(session.answers ?? {})) {
      if (!choiceId) continue;
      qbankEvents.push({ questionId, choiceId, submittedAt: session.submitted_at });
    }
  }
  const masteryByConcept = computeAllConceptMasteryStates(
    qbankEvents,
    questionById,
    practiceAttempts.map((p) => ({ concept: p.concept, correct: p.correct, createdAt: p.created_at }))
  );

  const entries = new Map<string, ErrorNoteEntry>();

  for (const session of sessions) {
    if (!session.submitted_at) continue;
    for (const [questionId, choiceId] of Object.entries(session.answers ?? {})) {
      const q = questionById.get(questionId);
      if (!q || !choiceId || choiceId === q.correct_choice_id) continue;
      const choice = q.choices.find((c) => c.id === choiceId);
      if (!choice) continue;
      const hasTag = !!(choice.error_note || choice.error_type || choice.confused_with || choice.weak_concept);
      if (!hasTag) continue;

      const key = `${questionId}:${choiceId}`;
      const correctChoice = q.choices.find((c) => c.id === q.correct_choice_id);
      const existing = entries.get(key);
      if (existing) {
        existing.missedCount++;
        if (new Date(session.submitted_at) > new Date(existing.lastMissedAt)) {
          existing.lastMissedAt = session.submitted_at;
        }
      } else {
        const questionAsk = extractQuestionAsk(q.question);
        const reframed = buildReframedExplanation({
          chosenText: choice.text,
          correctText: correctChoice?.text ?? "",
          confusedWith: choice.confused_with ?? null,
          weakConcept: choice.weak_concept ?? null,
          correctKeyConcept: correctChoice?.key_concept ?? null,
          questionAsk,
        });
        const canonicalConcept = canonicalConceptFor(q);
        entries.set(key, {
          questionId,
          choiceId,
          questionText: q.question,
          chosenText: choice.text,
          correctText: correctChoice?.text ?? "",
          reframed,
          errorNote: choice.error_note ?? null,
          errorType: choice.error_type ?? null,
          confusedWith: choice.confused_with ?? null,
          weakConcept: choice.weak_concept ?? null,
          missedCount: 1,
          lastMissedAt: session.submitted_at,
          masteryState: canonicalConcept ? masteryByConcept.get(canonicalConcept) ?? null : null,
        });
      }
    }
  }

  const list = Array.from(entries.values()).sort(
    (a, b) => new Date(b.lastMissedAt).getTime() - new Date(a.lastMissedAt).getTime()
  );

  return (
    <AppShell isAdmin={profileData?.is_admin} userName={profileData?.full_name}>
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8 w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Error Notes</h1>
          <p className="text-sm text-slate-400 mt-1">
            {list.length > 0
              ? `${list.length} misconception${list.length === 1 ? "" : "s"} saved, pulled from the questions you've gotten wrong.`
              : "Every misconception you've hit, pulled straight from the questions you've gotten wrong."}
          </p>
        </div>

        {list.length === 0 ? (
          <div className="card">
            <p className="text-sm text-slate-400">
              Nothing here yet. As you answer Question Bank questions, any wrong choice that&apos;s
              been tagged with an Error Note will show up here automatically -{" "}
              <Link href="/qbank" className="text-brand-400 hover:text-brand-300 font-medium">
                start a session
              </Link>{" "}
              to begin building this out.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((e) => (
              <div key={`${e.questionId}:${e.choiceId}`} className="card">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-sm font-semibold">{e.weakConcept || e.confusedWith || "Error note"}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    {e.masteryState && (
                      <span
                        className={`text-xs font-medium rounded-full px-2 py-0.5 ${MASTERY_BADGE_CLASS[e.masteryState]}`}
                      >
                        {MASTERY_LABELS[e.masteryState]}
                      </span>
                    )}
                    {e.missedCount > 1 && (
                      <span className="text-xs font-medium bg-red-900/30 text-red-300 rounded-full px-2 py-0.5">
                        Missed {e.missedCount}x
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-sm text-slate-200 mb-3">{e.reframed}</p>

                {e.errorNote && (
                  <p className="text-xs text-amber-400 mb-3">The mix-up: {e.errorNote}</p>
                )}

                {(e.errorType || e.confusedWith) && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {e.errorType && (
                      <span className="text-xs text-slate-400 bg-slate-800 rounded-full px-2 py-1">
                        {e.errorType}
                      </span>
                    )}
                    {e.confusedWith && (
                      <span className="text-xs text-slate-400 bg-slate-800 rounded-full px-2 py-1">
                        Confused with: {e.confusedWith}
                      </span>
                    )}
                  </div>
                )}

                <details className="mb-3">
                  <summary className="text-xs text-slate-500 hover:text-slate-300 cursor-pointer">
                    Show the full question this came from
                  </summary>
                  <p className="text-sm text-slate-400 mt-2 whitespace-pre-line">{e.questionText}</p>
                </details>

                <Link
                  href={`/error-notes/practice/${e.questionId}/${e.choiceId}`}
                  className="btn-secondary inline-block text-sm"
                >
                  Start Review &rarr;
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
