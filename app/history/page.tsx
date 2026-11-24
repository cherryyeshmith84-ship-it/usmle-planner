import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ScoreReport } from "@/lib/scoreReports";
import type { UWorldBlock } from "@/lib/uworldBlocks";
import { computeQBankSystemBreakdown } from "@/lib/qbankBlockStats";
import { getContentPublished } from "@/lib/platformSettings";
import AppShell from "@/components/AppShell";
import ScoreReportUpload from "@/components/ScoreReportUpload";
import QBankSystemBreakdown from "@/components/QBankSystemBreakdown";
import StudentProgressGraphs, { type GraphBlock, type GraphReport } from "@/components/StudentProgressGraphs";
import StudentTopicChecklist, { type TopicChecklistRow } from "@/components/StudentTopicChecklist";
import AiExamReviewCard from "@/components/AiExamReviewCard";
import ShelfAnalysis from "@/components/ShelfAnalysis";

export const dynamic = "force-dynamic";

/**
 * Analysis page, in two sections for Step 1 students (tabs at the top):
 *  - Analysis: progress graphs, the AI Exam Review / Default AI Study Plan,
 *    the "Upload score manually" card and question bank performance.
 *  - Systems Covered (?view=systems): the read-only Systems & Disciplines /
 *    Self Assessments checklist your mentor fills in.
 * The "Assessment and plan" notes card was removed on request.
 *
 * Step 2 CK / Shelf students get the same graphs (shelf mode: one colour per
 * subject), the question bank performance, and below them the per-subject
 * detail (components/ShelfAnalysis.tsx). No tabs, no checklist, and they
 * cannot upload reports themselves - the admin adds them from
 * Admin -> Analysis.
 */
export default async function HistoryPage({ searchParams }: { searchParams: { view?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("is_admin, full_name, exam_track")
    .eq("id", user.id)
    .single();

  const contentPublished = profileData?.is_admin ? true : await getContentPublished(supabase);

  // Step 2 CK and Shelf / subject exam students share one group; anyone else
  // (including no track saved yet) is treated as Step 1.
  const examTrack = (profileData as { exam_track?: string | null } | null)?.exam_track ?? null;
  const isStep2OrShelf = examTrack === "step2" || examTrack === "subject";

  // ---------------- Step 2 CK / Shelf ----------------
  if (isStep2OrShelf) {
    const { data } = await supabase
      .from("score_reports")
      .select("*")
      .eq("user_id", user.id)
      .order("taken_date", { ascending: false });
    const reports = (data ?? []) as ScoreReport[];

    const { data: blocksData } = await supabase.from("uworld_blocks").select("*").eq("user_id", user.id);
    const qbankBreakdown = computeQBankSystemBreakdown((blocksData ?? []) as UWorldBlock[]);
    const graphReports = reports as unknown as GraphReport[];
    const graphBlocks = (blocksData ?? []) as unknown as GraphBlock[];

    return (
      <AppShell isAdmin={profileData?.is_admin} userName={profileData?.full_name} contentPublished={contentPublished}>
        <main className="flex-1 px-6 py-8 w-full">
          <h1 className="text-xl font-bold mb-1">Analysis</h1>
          <p className="text-sm text-slate-400 mb-6">
            Your shelf exam results over time, arranged by subject, with your weak topics and question patterns.
          </p>

          {reports.length === 0 ? (
            <div className="card mb-8">
              <p className="text-sm text-slate-400">
                No shelf exam reports yet. Send your NBME reports to the Master Grid team and your analysis will
                appear here, arranged by subject.
              </p>
            </div>
          ) : null}

          <div className="mb-8">
            <h2 className="text-lg font-bold mb-3">Progress graphs</h2>
            <StudentProgressGraphs reports={graphReports} blocks={graphBlocks} shelf />
          </div>

          {reports.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-bold mb-3">By subject</h2>
              <ShelfAnalysis reports={reports as unknown as React.ComponentProps<typeof ShelfAnalysis>["reports"]} />
            </div>
          )}

          <div className="mt-8">
            <h2 className="text-lg font-bold mb-3">Question bank performance</h2>
            <QBankSystemBreakdown cells={qbankBreakdown} />
          </div>
        </main>
      </AppShell>
    );
  }

  // ---------------- Step 1 ----------------
  const view = searchParams?.view === "systems" ? "systems" : "analysis";

  const tabClass = (on: boolean) =>
    `text-sm rounded-full px-4 py-2 border transition ${
      on
        ? "border-brand-400 bg-brand-900/40 text-brand-300 font-semibold"
        : "border-slate-700 text-slate-300 hover:border-slate-600"
    }`;

  const tabs = (
    <div className="flex flex-wrap gap-2 mb-6">
      <Link href="/history" className={tabClass(view === "analysis")}>
        Analysis
      </Link>
      <Link href="/history?view=systems" className={tabClass(view === "systems")}>
        Systems Covered
      </Link>
    </div>
  );

  // Section 2: Systems Covered - the read-only checklist a mentor fills in.
  if (view === "systems") {
    const { data: topicChecklistData } = await supabase
      .from("student_topic_checklist")
      .select("resource, category, topic, completed")
      .eq("student_id", user.id);
    const topicChecklistRows = (topicChecklistData ?? []) as TopicChecklistRow[];

    return (
      <AppShell isAdmin={profileData?.is_admin} userName={profileData?.full_name} contentPublished={contentPublished}>
        <main className="flex-1 px-6 py-8 w-full">
          <h1 className="text-xl font-bold mb-1">Analysis</h1>
          <p className="text-sm text-slate-400 mb-4">
            The systems, disciplines and self-assessments your mentor has covered with you.
          </p>
          {tabs}
          <StudentTopicChecklist studentId={user.id} initialRows={topicChecklistRows} readOnly />
        </main>
      </AppShell>
    );
  }

  // Section 1: Analysis.
  const { data } = await supabase
    .from("score_reports")
    .select("*")
    .eq("user_id", user.id)
    .order("taken_date", { ascending: false });
  const reports = (data ?? []) as ScoreReport[];

  // Self-reported day-to-day qbank performance (Question Bank Blocks,
  // logged from the Study Planner calendar).
  const { data: blocksData } = await supabase.from("uworld_blocks").select("*").eq("user_id", user.id);
  const qbankBreakdown = computeQBankSystemBreakdown((blocksData ?? []) as UWorldBlock[]);

  // Same graphs the mentor sees on the student's Analysis tab. Every uploaded
  // report counts, including question-level reports (CBSE 1, CBSE 2...).
  const graphReports = reports as unknown as GraphReport[];
  const graphBlocks = (blocksData ?? []) as unknown as GraphBlock[];

  // Mentor-authored study plan, if this student's mentor has written one.
  // When this is null, the AI card shows the Default AI Study Plan.
  const { data: studyPlanRow } = await supabase
    .from("mentor_study_plans")
    .select("content, updated_at")
    .eq("student_id", user.id)
    .maybeSingle();
  const hasMentorPlan = !!studyPlanRow;

  return (
    <AppShell isAdmin={profileData?.is_admin} userName={profileData?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 px-6 py-8 w-full">
        <h1 className="text-xl font-bold mb-1">Analysis</h1>
        <p className="text-sm text-slate-400 mb-4">
          Upload your NBME, UWSA, Free 120, and UWorld self-assessment results to track your weak and
          strong systems over time.
        </p>
        {tabs}

        <div className="mb-8">
          <h2 className="text-lg font-bold mb-3">Progress graphs</h2>
          <StudentProgressGraphs reports={graphReports} blocks={graphBlocks} />
        </div>

        <div className="mb-8">
          <AiExamReviewCard reportCount={reports.length} hasMentorPlan={hasMentorPlan} />
        </div>

        <ScoreReportUpload userId={user.id} />

        <div className="mt-8">
          <h2 className="text-lg font-bold mb-3">Question bank performance</h2>
          <QBankSystemBreakdown cells={qbankBreakdown} />
        </div>
      </main>
    </AppShell>
  );
}
