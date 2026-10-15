import { requireAdmin } from "@/lib/adminGuard";
import type { ScoreReport } from "@/lib/scoreReports";
import { isMentorProfile, mentorEmailSet } from "@/lib/mentors";
import AdminNav from "@/components/AdminNav";
import PerformanceClient from "@/components/PerformanceClient";
import AdminAnalysisPicker, { type PickerStudent } from "@/components/AdminAnalysisPicker";

export const dynamic = "force-dynamic";

/**
 * Admin -> Analysis. For students who email their score reports instead of
 * entering them themselves: the admin picks the student here, reads the
 * report, enters the numbers (overall %, system and discipline breakdowns)
 * with "Enter a score manually", and the full analysis (weak/strong
 * systems, progress over time, AI suggestions) is built from it exactly as
 * if the student had entered it - the student sees it on their own
 * Analysis page and their mentor sees it on their progress view.
 *
 * Writes go to score_reports with user_id = the chosen student; the
 * existing score_reports_write_own_or_admin policy already lets an admin
 * do this.
 */
export default async function AdminAnalysisPage({ searchParams }: { searchParams: { student?: string } }) {
  const { supabase, user } = await requireAdmin();

  const [profilesRes, mentorsRes, viewersRes, reportsRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, is_admin").neq("id", user.id).order("full_name"),
    supabase.from("mentors").select("email"),
    supabase.from("viewers").select("email"),
    supabase.from("score_reports").select("user_id"),
  ]);

  const mentorEmails = mentorEmailSet((mentorsRes.data ?? []) as { email: string }[]);
  const viewerEmails = new Set(((viewersRes.data ?? []) as { email: string }[]).map((v) => v.email.toLowerCase()));

  const countByUser = new Map<string, number>();
  for (const r of (reportsRes.data ?? []) as { user_id: string }[]) {
    countByUser.set(r.user_id, (countByUser.get(r.user_id) ?? 0) + 1);
  }

  const students: PickerStudent[] = ((profilesRes.data ?? []) as {
    id: string;
    full_name: string | null;
    email: string | null;
    is_admin: boolean;
  }[])
    .filter(
      (p) =>
        !p.is_admin &&
        p.email &&
        !isMentorProfile(p.email, mentorEmails) &&
        !viewerEmails.has(p.email.toLowerCase())
    )
    .map((p) => ({
      id: p.id,
      name: p.full_name || p.email || "Unnamed",
      email: p.email as string,
      reportCount: countByUser.get(p.id) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const selected = searchParams.student ? students.find((s) => s.id === searchParams.student) ?? null : null;

  let reports: ScoreReport[] = [];
  if (selected) {
    const { data } = await supabase
      .from("score_reports")
      .select("*")
      .eq("user_id", selected.id)
      .order("taken_date", { ascending: false });
    reports = (data ?? []) as ScoreReport[];
  }

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-1">Analysis</h1>
        <p className="text-sm text-slate-400 mb-6">
          For students who send their score reports by email: pick the student, enter the numbers from
          their report with &ldquo;Enter a score manually&rdquo;, and the analysis is built for them. They
          will see it on their own Analysis page, and their mentor sees it too.
        </p>

        <AdminAnalysisPicker students={students} selectedId={selected?.id ?? null} />

        {!selected ? (
          <p className="text-sm text-slate-500">Choose a student above to see and add their score reports.</p>
        ) : (
          <div>
            <div className="mb-4">
              <h2 className="text-lg font-bold">{selected.name}</h2>
              <p className="text-sm text-slate-400">{selected.email}</p>
            </div>
            {/* key forces a fresh state when switching between students */}
            <PerformanceClient key={selected.id} userId={selected.id} initialReports={reports} />
          </div>
        )}
      </main>
    </div>
  );
}
