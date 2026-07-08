import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/adminGuard";
import type { Assessment, AssessmentAttempt, Profile } from "@/lib/types";
import AdminNav from "@/components/AdminNav";
import AssessmentForm from "@/components/AssessmentForm";

export const dynamic = "force-dynamic";

export default async function EditAssessmentPage({ params }: { params: { id: string } }) {
  const { supabase, user } = await requireAdmin();

  const [assessmentRes, attemptsRes] = await Promise.all([
    supabase.from("assessments").select("*").eq("id", params.id).single(),
    supabase
      .from("assessment_attempts")
      .select("*")
      .eq("assessment_id", params.id)
      .order("submitted_at", { ascending: false }),
  ]);

  if (!assessmentRes.data) notFound();
  const assessment = assessmentRes.data as Assessment;
  const attempts = (attemptsRes.data ?? []) as AssessmentAttempt[];

  const studentIds = Array.from(new Set(attempts.map((a) => a.user_id)));
  let studentMap = new Map<string, Profile>();
  if (studentIds.length > 0) {
    const { data: studentsData } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", studentIds);
    studentMap = new Map((studentsData ?? []).map((s: any) => [s.id, s as Profile]));
  }

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8 space-y-6">
        <h1 className="text-xl font-bold">Edit self assessment</h1>
        <AssessmentForm userId={user.id} initial={assessment} />

        <div className="card">
          <h2 className="font-semibold mb-3">Student attempts ({attempts.length})</h2>
          {attempts.length === 0 && (
            <p className="text-sm text-slate-400">No one has taken this yet.</p>
          )}
          <div className="space-y-2">
            {attempts.map((a) => {
              const student = studentMap.get(a.user_id);
              const pct = a.score_total > 0 ? Math.round((a.score_correct / a.score_total) * 100) : 0;
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between border border-slate-700 rounded-xl px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {student?.full_name || student?.email || "Unknown student"}
                    </p>
                    <p className="text-xs text-slate-400">
                      {a.submitted_at
                        ? new Date(a.submitted_at).toLocaleString()
                        : "In progress / not submitted"}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold rounded-full px-3 py-1 ${
                      pct >= 70
                        ? "bg-green-900/40 text-green-400"
                        : pct >= 50
                        ? "bg-amber-900/40 text-amber-400"
                        : "bg-red-900/40 text-red-400"
                    }`}
                  >
                    {a.score_correct}/{a.score_total} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
