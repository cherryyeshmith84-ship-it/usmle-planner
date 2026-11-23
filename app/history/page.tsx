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
import SessionNotesPanel from "@/components/SessionNotesPanel";
import AiExamReviewCard from "@/components/AiExamReviewCard";

export const dynamic = "force-dynamic";

/**
 * Analysis page: progress graphs, the AI Exam Review / Default AI Study
 * Plan, the "Upload score manually" card, question bank performance, the
 * assessment and plan notes, and the systems checklist. The old
 * PerformanceClient tables (Action Center, weakest/strongest lists, progress
 * tables, Compare Exams, score report history) were removed on request.
 */
export default async function HistoryPage() {
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

  const contentPublished = profileData?.is_admin ? true : await getContentPublished(supabase);

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

  // Read-only view of the Systems & Disciplines checklist a mentor fills in.
  const { data: topicChecklistData } = await supabase
    .from("student_topic_checklist")
    .select("resource, category, topic, completed")
    .eq("student_id", user.id);
  const topicChecklistRows = (topicChecklistData ?? []) as TopicChecklistRow[];

  // Read-only view of the mentor's standing "Notes" on this student.
  const { data: mentorNoteData } = await supabase
    .from("mentor_student_notes")
    .select("note, updated_at")
    .eq("student_id", user.id)
    .maybeSingle();
  const mentorNote = mentorNoteData as { note: string | null; updated_at: string | null } | null;

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
        <p className="text-sm text-slate-400 mb-6">
          Upload your NBME, UWSA, Free 120, and UWorld self-assessment results to track your weak and
          strong systems over time.
        </p>

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

        <div className="mt-8">
          <SessionNotesPanel studentId={user.id} canEdit={false} isStudentSelf legacyNote={mentorNote?.note ?? null} />
        </div>

        <div className="mt-8">
          <StudentTopicChecklist studentId={user.id} initialRows={topicChecklistRows} readOnly />
        </div>
      </main>
    </AppShell>
  );
}
