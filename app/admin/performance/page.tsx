import Link from "next/link";
import { requireAdmin } from "@/lib/adminGuard";
import type { Profile } from "@/lib/types";
import { computeSystemStrengths, type ScoreReport } from "@/lib/scoreReports";
import AdminNav from "@/components/AdminNav";

export const dynamic = "force-dynamic";

function scoreBadgeClass(pct: number | null) {
  if (pct === null) return "bg-slate-800 text-slate-300";
  if (pct >= 75) return "bg-green-900/40 text-green-400";
  if (pct >= 60) return "bg-yellow-900/40 text-yellow-400";
  if (pct >= 45) return "bg-orange-900/40 text-orange-400";
  return "bg-red-900/40 text-red-400";
}

/**
 * One-page overview of every student's score-report performance, so you
 * don't have to open each student individually to see who needs attention.
 * Sorted worst-latest-score first; students with no reports uploaded yet
 * are listed separately at the bottom. Click through to a student's full
 * detail page (which has the same Planner + Performance sections, editable)
 * for the complete picture.
 */
export default async function AdminPerformanceOverviewPage() {
  const { supabase, user } = await requireAdmin();

  const [profilesRes, reportsRes] = await Promise.all([
    supabase.from("profiles").select("*").neq("id", user.id).order("full_name", { ascending: true }),
    supabase.from("score_reports").select("*").order("taken_date", { ascending: false }),
  ]);

  const students = (profilesRes.data ?? []) as Profile[];
  const allReports = (reportsRes.data ?? []) as ScoreReport[];
  const reportsByStudent = new Map<string, ScoreReport[]>();
  for (const r of allReports) {
    const list = reportsByStudent.get(r.user_id) ?? [];
    list.push(r);
    reportsByStudent.set(r.user_id, list);
  }

  const summaries = students.map((s) => {
    const reports = reportsByStudent.get(s.id) ?? [];
    const latest = reports[0] ?? null; // already sorted desc by taken_date
    const strengths = computeSystemStrengths(reports);
    const weakest = strengths[0] ?? null;
    return { student: s, reportCount: reports.length, latest, weakest };
  });

  const withReports = summaries
    .filter((s) => s.reportCount > 0)
    .sort((a, b) => {
      const aPct = a.latest?.overall_percent ?? 100;
      const bPct = b.latest?.overall_percent ?? 100;
      return aPct - bPct;
    });
  const withoutReports = summaries.filter((s) => s.reportCount === 0);

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-1">Performance overview</h1>
        <p className="text-sm text-slate-400 mb-6">
          Every student's latest score report and weakest system, worst-first. Click a student to see
          their full history, Planner, and Performance page.
        </p>

        {withReports.length === 0 ? (
          <p className="text-sm text-slate-400 mb-6">No students have uploaded a score report yet.</p>
        ) : (
          <div className="space-y-2 mb-8">
            {withReports.map(({ student, reportCount, latest, weakest }) => (
              <Link
                key={student.id}
                href={`/admin/students/${student.id}`}
                className="card flex items-center justify-between gap-3 flex-wrap hover:border-brand-500 transition"
              >
                <div>
                  <p className="text-sm font-semibold">{student.full_name || student.email || "Unnamed student"}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {reportCount} report{reportCount === 1 ? "" : "s"}
                    {latest && ` · latest: ${latest.exam_name} (${latest.taken_date ?? "no date"})`}
                  </p>
                  {weakest && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      Weakest: {weakest.system} &middot; avg {weakest.averagePercent}%
                    </p>
                  )}
                </div>
                {latest && (latest.overall_percent !== null || latest.overall_score !== null) && (
                  <span className={`text-sm font-semibold rounded-full px-3 py-1 shrink-0 ${scoreBadgeClass(latest.overall_percent)}`}>
                    {latest.overall_percent !== null ? `${latest.overall_percent}%` : latest.overall_score}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}

        {withoutReports.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-slate-400 mb-2">No score reports yet</p>
            <div className="space-y-2">
              {withoutReports.map(({ student }) => (
                <Link
                  key={student.id}
                  href={`/admin/students/${student.id}`}
                  className="card block hover:border-brand-500 transition"
                >
                  <p className="text-sm font-semibold">{student.full_name || student.email || "Unnamed student"}</p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
