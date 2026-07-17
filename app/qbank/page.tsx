import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { QBankQuestion, QBankTestSession } from "@/lib/qbankTypes";
import { computeQuestionStatuses, countByStatus, countByTag } from "@/lib/qbank";
import NavBar from "@/components/NavBar";
import QBankCreateTestForm from "@/components/QBankCreateTestForm";

export const dynamic = "force-dynamic";

export default async function QuestionBankCreateTestPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  const profile = profileData as Profile | null;
  if (!profile?.onboarding_completed) redirect("/onboarding");

  // Only questions an admin has actually published belong in the student
  // pool - without this filter, draft and legacy untagged stub questions
  // (created while building out the editor) were just as selectable as
  // finished ones, which is confusing for students and silently defeats
  // the whole point of the draft/under_review/published workflow.
  const [questionsRes, sessionsRes, marksRes] = await Promise.all([
    supabase
      .from("qbank_questions")
      .select("*")
      .filter("meta->>status", "eq", "published")
      .order("created_at", { ascending: true }),
    supabase.from("qbank_test_sessions").select("*").eq("user_id", user.id),
    supabase.from("qbank_marks").select("question_id").eq("user_id", user.id).eq("marked", true),
  ]);

  const questions = (questionsRes.data ?? []) as QBankQuestion[];
  const sessions = (sessionsRes.data ?? []) as QBankTestSession[];
  const markedIds = new Set((marksRes.data ?? []).map((m: { question_id: string }) => m.question_id));

  const { statuses, marked } = computeQuestionStatuses(questions, sessions, markedIds);
  const statusCounts = countByStatus(questions, statuses, marked);
  const subjectCounts = countByTag(questions, "subjects");
  const systemCounts = countByTag(questions, "systems");

  return (
    <div className="min-h-screen flex">
      <NavBar isAdmin={profile?.is_admin} />
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold">Question bank</h1>
          <Link href="/qbank/previous" className="text-sm font-semibold text-brand-400 hover:text-brand-300">
            Previous tests &rarr;
          </Link>
        </div>
        <p className="text-sm text-slate-400 mb-6">
          Build a custom test from the question pool - filter by whether you&apos;ve seen a
          question before, by subject, or by organ system.
        </p>

        {questions.length === 0 ? (
          <p className="text-sm text-slate-400">
            No questions in the pool yet - your coach hasn&apos;t added any.
          </p>
        ) : (
          <QBankCreateTestForm
            questions={questions}
            statuses={statuses}
            marked={marked}
            statusCounts={statusCounts}
            subjectCounts={subjectCounts}
            systemCounts={systemCounts}
            userId={user.id}
          />
        )}
      </main>
    </div>
  );
}
