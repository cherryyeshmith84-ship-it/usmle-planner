import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/adminGuard";
import type { Assessment, AssessmentAttempt, Profile } from "@/lib/types";
import AdminNav from "@/components/AdminNav";
import AttemptReview from "@/components/AttemptReview";

export const dynamic = "force-dynamic";

export default async function AdminAttemptDetailPage({
  params,
}: {
  params: { attemptId: string };
}) {
  const { supabase } = await requireAdmin();

  const { data: attemptData } = await supabase
    .from("assessment_attempts")
    .select("*")
    .eq("id", params.attemptId)
    .single();

  if (!attemptData) notFound();
  const attempt = attemptData as AssessmentAttempt;

  const [assessmentRes, studentRes] = await Promise.all([
    supabase.from("assessments").select("*").eq("id", attempt.assessment_id).single(),
    supabase.from("profiles").select("*").eq("id", attempt.user_id).single(),
  ]);

  if (!assessmentRes.data) notFound();
  const assessment = assessmentRes.data as Assessment;
  const student = studentRes.data as Profile | null;

  const pct =
    attempt.score_total > 0 ? Math.round((attempt.score_correct / attempt.score_total) * 100) : 0;

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div>
          <Link
            href={`/admin/assessments/${assessment.id}`}
            className="text-sm text-brand-400 font-semibold"
          >
            &larr; Back to {assessment.name}
          </Link>
        </div>

        <div className="card">
          <h1 className="text-xl font-bold mb-1">
            {student?.full_name || student?.email || "Unknown student"} - {assessment.name}
          </h1>
          <div className="flex items-center gap-4 mt-3">
            <span
              className={`text-3xl font-bold ${
                pct >= 70 ? "text-green-400" : pct >= 50 ? "text-brand-300" : "text-red-400"
              }`}
            >
              {pct}%
            </span>
            <span className="text-sm text-slate-400">
              {attempt.score_correct}/{attempt.score_total} correct
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-3">
            {attempt.submitted_at
              ? `Submitted ${new Date(attempt.submitted_at).toLocaleString()}`
              : "In progress / not submitted"}
          </p>
        </div>

        <AttemptReview
          assessment={assessment}
          answers={attempt.answers}
          questionTimes={attempt.question_seconds ?? {}}
        />
      </main>
    </div>
  );
}
