import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Assessment, AssessmentAttempt, Profile } from "@/lib/types";
import NavBar from "@/components/NavBar";

export const dynamic = "force-dynamic";

export default async function AssessmentsListPage() {
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

  const [assessmentsRes, attemptsRes] = await Promise.all([
    supabase.from("assessments").select("*").order("created_at", { ascending: false }),
    supabase
      .from("assessment_attempts")
      .select("*")
      .eq("user_id", user.id)
      .not("submitted_at", "is", null),
  ]);

  const assessments = (assessmentsRes.data ?? []) as Assessment[];
  const attempts = (attemptsRes.data ?? []) as AssessmentAttempt[];

  const bestByAssessment = new Map<string, number>();
  for (const a of attempts) {
    const pct = a.score_total > 0 ? Math.round((a.score_correct / a.score_total) * 100) : 0;
    const current = bestByAssessment.get(a.assessment_id);
    if (current === undefined || pct > current) bestByAssessment.set(a.assessment_id, pct);
  }

  return (
    <div className="min-h-screen flex">
      <NavBar isAdmin={profile?.is_admin} />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-1">Self assessment</h1>
        <p className="text-sm text-slate-400 mb-6">
          Timed practice tests your coach has put together. Once you start one, the
          clock starts - answer everything you can before time runs out.
        </p>

        {assessments.length === 0 && (
          <p className="text-sm text-slate-400">
            No self-assessments yet - your coach hasn&apos;t added any.
          </p>
        )}

        <div className="space-y-3">
          {assessments.map((a) => {
            const best = bestByAssessment.get(a.id);
            return (
              <Link
                key={a.id}
                href={`/assessments/${a.id}`}
                className="card block hover:border-brand-500 transition"
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold">{a.name}</h3>
                  <span className="text-xs font-semibold bg-slate-800 text-slate-300 rounded-full px-2 py-1">
                    {Math.max(1, Math.ceil(a.questions.length / (a.questions_per_block || 20)))} block
                    {Math.max(1, Math.ceil(a.questions.length / (a.questions_per_block || 20))) === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="text-sm text-slate-400">
                  {a.questions.length} question{a.questions.length === 1 ? "" : "s"} · {a.questions_per_block}
                  /block · {a.block_time_minutes} min/block
                  {best !== undefined ? ` · completed - score: ${best}%` : " · not attempted yet"}
                </p>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
