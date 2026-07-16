import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { QBankQuestion } from "@/lib/qbankTypes";
import AppShell from "@/components/AppShell";

export const dynamic = "force-dynamic";

interface ErrorNoteEntry {
  questionId: string;
  choiceId: string;
  questionText: string;
  chosenText: string;
  correctText: string;
  errorNote: string | null;
  errorType: string | null;
  confusedWith: string | null;
  weakConcept: string | null;
  missedCount: number;
  lastMissedAt: string;
}

/**
 * Every misconception this student has actually hit, pulled straight from
 * the Error DNA tags (error_note/error_type/confused_with/weak_concept) an
 * admin set on the wrong choice they picked. One card per distinct
 * question+wrong-choice pairing - if they've missed the same one more than
 * once (e.g. on a retake), that's shown as a "Missed Nx" badge instead of
 * duplicate cards.
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

  const [sessionsRes, questionsRes] = await Promise.all([
    supabase
      .from("qbank_test_sessions")
      .select("answers, submitted_at")
      .eq("user_id", user.id)
      .not("submitted_at", "is", null),
    supabase.from("qbank_questions").select("*"),
  ]);

  const sessions = (sessionsRes.data ?? []) as {
    answers: Record<string, string> | null;
    submitted_at: string | null;
  }[];
  const questions = (questionsRes.data ?? []) as QBankQuestion[];
  const questionById = new Map(questions.map((q) => [q.id, q]));

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
        entries.set(key, {
          questionId,
          choiceId,
          questionText: q.question,
          chosenText: choice.text,
          correctText: correctChoice?.text ?? "",
          errorNote: choice.error_note ?? null,
          errorType: choice.error_type ?? null,
          confusedWith: choice.confused_with ?? null,
          weakConcept: choice.weak_concept ?? null,
          missedCount: 1,
          lastMissedAt: session.submitted_at,
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
                  {e.missedCount > 1 && (
                    <span className="text-xs font-medium bg-red-900/30 text-red-300 rounded-full px-2 py-0.5 shrink-0">
                      Missed {e.missedCount}x
                    </span>
                  )}
                </div>

                {e.errorNote && <p className="text-sm text-slate-300 mb-3">{e.errorNote}</p>}

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

                <p className="text-xs text-slate-500 mb-1">
                  You picked <span className="text-red-400">{e.chosenText}</span> instead of{" "}
                  <span className="text-green-400">{e.correctText}</span>
                </p>
                <p className="text-xs text-slate-600 line-clamp-2 mb-3">Source: {e.questionText}</p>

                <Link href="/qbank" className="btn-secondary inline-block text-sm">
                  Practice this concept &rarr;
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
