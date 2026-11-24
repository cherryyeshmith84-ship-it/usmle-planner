import Link from "next/link";
import { requireAdmin } from "@/lib/adminGuard";
import type { ScoreReport } from "@/lib/scoreReports";
import { isMentorProfile, mentorEmailSet } from "@/lib/mentors";
import AdminNav from "@/components/AdminNav";
import PerformanceClient from "@/components/PerformanceClient";
import AdminScoreReportUpload from "@/components/AdminScoreReportUpload";
import QuestionLevelReportUpload from "@/components/QuestionLevelReportUpload";
import AdminShelfReportUpload from "@/components/AdminShelfReportUpload";
import AdminAnalysisPicker, { type PickerStudent } from "@/components/AdminAnalysisPicker";

export const dynamic = "force-dynamic";

type TrackTab = "step1" | "step2";

/**
 * Admin -> Analysis, in two parts:
 *  - Step 1: CBSE / NBME / UWSA / Free 120 score reports and the question-
 *    level (CBSE 1, CBSE 2...) reports.
 *  - Step 2 / Shelf exams: NBME shelf (subject) exam PDFs for any subject,
 *    plus manual score entry.
 * Students are listed under the part that matches their exam track (Step 2 CK
 * and Shelf / subject students share the second part; anyone with no track
 * saved yet counts as Step 1).
 *
 * Writes go to score_reports with user_id = the chosen student; the existing
 * score_reports_write_own_or_admin policy already lets an admin do this.
 */
export default async function AdminAnalysisPage({
  searchParams,
}: {
  searchParams: { student?: string; track?: string };
}) {
  const { supabase, user } = await requireAdmin();

  const [profilesRes, mentorsRes, viewersRes, reportsRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, is_admin, exam_track").neq("id", user.id).order("full_name"),
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

  const groupOf = (examTrack: string | null | undefined): TrackTab =>
    examTrack === "step2" || examTrack === "subject" ? "step2" : "step1";

  const allStudents = ((profilesRes.data ?? []) as {
    id: string;
    full_name: string | null;
    email: string | null;
    is_admin: boolean;
    exam_track: string | null;
  }[])
    .filter(
      (p) =>
        !p.is_admin &&
        p.email &&
        !isMentorProfile(p.email, mentorEmails) &&
        !viewerEmails.has(p.email.toLowerCase())
    )
    .map((p) => ({
      group: groupOf(p.exam_track),
      student: {
        id: p.id,
        name: p.full_name || p.email || "Unnamed",
        email: p.email as string,
        reportCount: countByUser.get(p.id) ?? 0,
      } as PickerStudent,
    }))
    .sort((a, b) => a.student.name.localeCompare(b.student.name));

  const step1Students = allStudents.filter((s) => s.group === "step1").map((s) => s.student);
  const step2Students = allStudents.filter((s) => s.group === "step2").map((s) => s.student);

  // A chosen student decides which part is open; otherwise the ?track= tab.
  const selectedEntry = searchParams.student ? allStudents.find((s) => s.student.id === searchParams.student) ?? null : null;
  const selected = selectedEntry?.student ?? null;
  const tab: TrackTab = selectedEntry ? selectedEntry.group : searchParams.track === "step2" ? "step2" : "step1";
  const students = tab === "step2" ? step2Students : step1Students;

  let reports: ScoreReport[] = [];
  if (selected) {
    const { data } = await supabase
      .from("score_reports")
      .select("*")
      .eq("user_id", selected.id)
      .order("taken_date", { ascending: false });
    reports = (data ?? []) as ScoreReport[];
  }

  const tabClass = (on: boolean) =>
    `text-sm rounded-full px-4 py-2 border transition ${
      on ? "border-brand-400 bg-brand-900/40 text-brand-300 font-semibold" : "border-slate-700 text-slate-300 hover:border-slate-600"
    }`;

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-1">Analysis</h1>
        <p className="text-sm text-slate-400 mb-6">
          For students who send their score reports by email: pick the student, add their report, and the
          analysis is built for them. They will see it on their own Analysis page, and their mentor sees it too.
        </p>

        <div className="flex flex-wrap gap-2 mb-6">
          <Link href="/admin/analysis?track=step1" className={tabClass(tab === "step1")}>
            Step 1 ({step1Students.length})
          </Link>
          <Link href="/admin/analysis?track=step2" className={tabClass(tab === "step2")}>
            Step 2 / Shelf exams ({step2Students.length})
          </Link>
        </div>

        <AdminAnalysisPicker key={tab} students={students} selectedId={selected?.id ?? null} />

        {!selected ? (
          <p className="text-sm text-slate-500">
            Choose a {tab === "step2" ? "Step 2 / Shelf" : "Step 1"} student above to see and add their score reports.
          </p>
        ) : (
          <div>
            <div className="mb-4">
              <h2 className="text-lg font-bold">{selected.name}</h2>
              <p className="text-sm text-slate-400">{selected.email}</p>
            </div>
            <div className="space-y-4 mb-6">
              {tab === "step1" ? (
                <>
                  <AdminScoreReportUpload key={`sr-${selected.id}`} userId={selected.id} />
                  <QuestionLevelReportUpload key={`ql-${selected.id}`} userId={selected.id} />
                </>
              ) : (
                <>
                  <AdminShelfReportUpload key={`sh-${selected.id}`} userId={selected.id} />
                  <AdminScoreReportUpload key={`sr-${selected.id}`} userId={selected.id} />
                </>
              )}
            </div>
            {/* key forces a fresh state when switching between students */}
            <PerformanceClient key={selected.id} userId={selected.id} initialReports={reports} />
          </div>
        )}
      </main>
    </div>
  );
}
