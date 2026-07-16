import Link from "next/link";
import { requireAdmin } from "@/lib/adminGuard";
import type { QBankQuestion } from "@/lib/qbankTypes";
import AdminNav from "@/components/AdminNav";

export const dynamic = "force-dynamic";

function topEntries(counts: Record<string, number>, n: number) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function BarList({ entries, max }: { entries: [string, number][]; max: number }) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">Nothing tagged yet.</p>;
  }
  return (
    <div className="space-y-2">
      {entries.map(([label, count]) => (
        <div key={label}>
          <div className="flex items-center justify-between gap-2 text-sm mb-1">
            <span className="text-slate-300">{label}</span>
            <span className="text-xs text-slate-400 shrink-0">{count}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${max > 0 ? Math.round((count / max) * 100) : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Cross-question analytics: pulls every submitted Question Bank answer,
 * cross-references it against the Error DNA tags (error_type / weak_concept /
 * confused_with) set on that wrong choice in the editor, and tallies them
 * both cohort-wide (which misconceptions are most common overall) and per
 * student (who's making which kind of mistake most) - useful for spotting
 * patterns worth addressing in a 1:1 coaching session.
 */
export default async function ErrorDnaPage() {
  const { supabase } = await requireAdmin();

  const [{ data: questionRows }, { data: sessionRows }] = await Promise.all([
    supabase.from("qbank_questions").select("*"),
    supabase
      .from("qbank_test_sessions")
      .select("user_id, answers, submitted_at")
      .not("submitted_at", "is", null),
  ]);

  const questions = (questionRows ?? []) as QBankQuestion[];
  const sessions = (sessionRows ?? []) as {
    user_id: string;
    answers: Record<string, string> | null;
    submitted_at: string | null;
  }[];

  const questionById = new Map(questions.map((q) => [q.id, q]));

  const errorTypeCounts: Record<string, number> = {};
  const weakConceptCounts: Record<string, number> = {};
  const confusedWithCounts: Record<string, number> = {};
  let totalTaggedWrong = 0;
  let totalWrong = 0;

  const perStudent: Record<
    string,
    { total: number; errorTypeCounts: Record<string, number>; weakConceptCounts: Record<string, number> }
  > = {};

  for (const session of sessions) {
    const answers = session.answers ?? {};
    for (const [questionId, choiceId] of Object.entries(answers)) {
      const question = questionById.get(questionId);
      if (!question || !choiceId || choiceId === question.correct_choice_id) continue;
      const choice = question.choices.find((c) => c.id === choiceId);
      if (!choice) continue;
      totalWrong++;

      const hasTag = !!(choice.error_type || choice.weak_concept || choice.confused_with);
      if (!hasTag) continue;
      totalTaggedWrong++;

      if (!perStudent[session.user_id]) {
        perStudent[session.user_id] = { total: 0, errorTypeCounts: {}, weakConceptCounts: {} };
      }
      const s = perStudent[session.user_id];
      s.total++;

      if (choice.error_type) {
        errorTypeCounts[choice.error_type] = (errorTypeCounts[choice.error_type] ?? 0) + 1;
        s.errorTypeCounts[choice.error_type] = (s.errorTypeCounts[choice.error_type] ?? 0) + 1;
      }
      if (choice.weak_concept) {
        weakConceptCounts[choice.weak_concept] = (weakConceptCounts[choice.weak_concept] ?? 0) + 1;
        s.weakConceptCounts[choice.weak_concept] = (s.weakConceptCounts[choice.weak_concept] ?? 0) + 1;
      }
      if (choice.confused_with) {
        confusedWithCounts[choice.confused_with] = (confusedWithCounts[choice.confused_with] ?? 0) + 1;
      }
    }
  }

  const studentIds = Object.keys(perStudent);
  const { data: profileRows } = studentIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", studentIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] };

  const nameById: Record<string, string> = {};
  for (const p of profileRows ?? []) {
    nameById[p.id] = p.full_name || p.email || "Unknown student";
  }

  const studentRows = studentIds
    .map((userId) => {
      const s = perStudent[userId];
      return {
        userId,
        name: nameById[userId] ?? "Unknown student",
        total: s.total,
        topErrorType: topEntries(s.errorTypeCounts, 1)[0]?.[0] ?? null,
        topWeakConcept: topEntries(s.weakConceptCounts, 1)[0]?.[0] ?? null,
      };
    })
    .sort((a, b) => b.total - a.total);

  const topErrorTypes = topEntries(errorTypeCounts, 8);
  const topWeakConcepts = topEntries(weakConceptCounts, 8);
  const topConfusedWith = topEntries(confusedWithCounts, 8);
  const maxErrorType = topErrorTypes[0]?.[1] ?? 0;
  const maxWeakConcept = topWeakConcepts[0]?.[1] ?? 0;
  const maxConfusedWith = topConfusedWith[0]?.[1] ?? 0;

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold">Error DNA</h1>
          <p className="text-sm text-slate-400">
            {totalTaggedWrong} of {totalWrong} wrong Question Bank answers have Error DNA tags
            attached, across {studentRows.length} student{studentRows.length === 1 ? "" : "s"}. Tag
            more wrong choices in the question editor to make this more useful.
          </p>
        </div>

        {totalTaggedWrong === 0 ? (
          <p className="text-sm text-slate-400">
            No tagged wrong answers yet. Add error type / confused with / weak concept tags to
            wrong choices in the Question Bank editor, and this page will fill in as students
            answer those questions.
          </p>
        ) : (
          <>
            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <div className="card">
                <h2 className="font-semibold mb-3 text-sm">Top error types</h2>
                <BarList entries={topErrorTypes} max={maxErrorType} />
              </div>
              <div className="card">
                <h2 className="font-semibold mb-3 text-sm">Top weak concepts</h2>
                <BarList entries={topWeakConcepts} max={maxWeakConcept} />
              </div>
              <div className="card">
                <h2 className="font-semibold mb-3 text-sm">Most confused with</h2>
                <BarList entries={topConfusedWith} max={maxConfusedWith} />
              </div>
            </div>

            <div className="card">
              <h2 className="font-semibold mb-3">By student</h2>
              <div className="space-y-2">
                {studentRows.map((row) => (
                  <Link
                    key={row.userId}
                    href={`/admin/students/${row.userId}`}
                    className="flex items-center justify-between gap-2 text-sm px-2 py-2 rounded hover:bg-slate-800 transition"
                  >
                    <span className="text-slate-200 font-medium">{row.name}</span>
                    <span className="flex items-center gap-2 flex-wrap justify-end">
                      {row.topErrorType && (
                        <span className="text-xs font-medium bg-amber-900/30 text-amber-300 rounded-full px-2 py-0.5">
                          {row.topErrorType}
                        </span>
                      )}
                      {row.topWeakConcept && (
                        <span className="text-xs font-medium bg-slate-800 text-slate-300 rounded-full px-2 py-0.5">
                          {row.topWeakConcept}
                        </span>
                      )}
                      <span className="text-xs text-slate-500 shrink-0">
                        {row.total} tagged error{row.total === 1 ? "" : "s"}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
