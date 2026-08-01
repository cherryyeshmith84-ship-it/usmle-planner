import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/adminGuard";
import type {
  BlockScore,
  CoachMessage,
  DailyLog,
  PersonalTemplate,
  Profile,
  ScheduleTemplate,
} from "@/lib/types";
import { buildRoadmap, computePlanProgress, getTemplateDays, type PlanProgress } from "@/lib/templateDays";
import type { PlannerColumn, PlannerEntry } from "@/lib/plannerColumns";
import { resolvePlannerColumns } from "@/lib/plannerColumns";
import type { ScoreReport } from "@/lib/scoreReports";
import AdminNav from "@/components/AdminNav";
import AdminStudentDetail from "@/components/AdminStudentDetail";
import PlannerGridClient from "@/components/PlannerGridClient";
import PlannerStartDateControl from "@/components/PlannerStartDateControl";
import PerformanceClient from "@/components/PerformanceClient";

export const dynamic = "force-dynamic";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default async function StudentDetailPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireAdmin();

  // None of these six queries depend on each other's results - only on the
  // student id from the URL - so run them all at once instead of one by one.
  const [
    studentRes,
    logsRes,
    templatesRes,
    messagesRes,
    scoreRes,
    personalRes,
    plannerColumnsRes,
    plannerEntriesRes,
    scoreReportsRes,
    plannerSettingsRes,
  ] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", params.id).single(),
      supabase
        .from("daily_logs")
        .select("*")
        .eq("user_id", params.id)
        .order("log_date", { ascending: false })
        .limit(14),
      supabase.from("schedule_templates").select("*").order("stage", { ascending: true }).order("name", { ascending: true }),
      supabase.from("messages").select("*").eq("student_id", params.id).order("created_at", { ascending: true }),
      supabase.from("daily_logs").select("block_scores").eq("user_id", params.id),
      supabase.from("personal_templates").select("*").eq("user_id", params.id).maybeSingle(),
      // This student's resolved columns (their own customization if their
      // mentor set one up, else the shared defaults) - not every column
      // that exists across every student, which is_admin() would otherwise
      // return unfiltered.
      supabase
        .from("planner_columns")
        .select("*")
        .or(`student_id.is.null,student_id.eq.${params.id}`)
        .order("sort_order", { ascending: true }),
      supabase.from("planner_entries").select("*").eq("user_id", params.id),
      supabase.from("score_reports").select("*").eq("user_id", params.id).order("taken_date", { ascending: false }),
      supabase.from("student_planner_settings").select("start_date").eq("student_id", params.id).maybeSingle(),
    ]);

  if (!studentRes.data) notFound();
  const student = studentRes.data as Profile;
  const logsData = logsRes.data;
  const templates = (templatesRes.data ?? []) as ScheduleTemplate[];
  const messagesData = messagesRes.data;
  const allBlockScores: BlockScore[] = (scoreRes.data ?? []).flatMap(
    (r: any) => (r.block_scores ?? []) as BlockScore[]
  );
  const personalTemplate = (personalRes.data as PersonalTemplate) ?? null;
  const plannerColumns = resolvePlannerColumns((plannerColumnsRes.data ?? []) as PlannerColumn[], params.id);
  const plannerEntries = (plannerEntriesRes.data ?? []) as PlannerEntry[];
  const scoreReports = (scoreReportsRes.data ?? []) as ScoreReport[];
  const plannerStartDate = (plannerSettingsRes.data as { start_date: string } | null)?.start_date ?? null;

  // Full day-by-day roadmap for whatever this student is currently using -
  // their coach-assigned plan, or their own self-built one - so the coach
  // sees the whole thing (not just the last 14 days) in one place.
  const today = todayStr();
  const activeSource = student.active_plan_source || "coach";
  const assignedTemplate = templates.find((t) => t.id === student.assigned_template_id) ?? null;

  const activeTemplate = activeSource === "own" ? personalTemplate : assignedTemplate;
  const days = getTemplateDays(activeTemplate);
  const startDate =
    (activeSource === "own" ? personalTemplate?.start_date : student.assigned_template_start_date) ||
    today;
  let roadmap: ReturnType<typeof buildRoadmap> = [];
  let planProgress: PlanProgress | null = null;
  if (days.length > 0) {
    const { data: roadmapLogsData } = await supabase
      .from("daily_logs")
      .select("*")
      .eq("user_id", params.id)
      .gte("log_date", startDate);
    const roadmapLogs = (roadmapLogsData ?? []) as DailyLog[];
    roadmap = buildRoadmap(days, startDate, roadmapLogs);
    planProgress = computePlanProgress(days, roadmapLogs);
  }

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8">
        <AdminStudentDetail
          student={student}
          recentLogs={(logsData ?? []) as DailyLog[]}
          templates={templates}
          initialMessages={(messagesData ?? []) as CoachMessage[]}
          allBlockScores={allBlockScores}
          roadmap={roadmap}
          today={today}
          planProgress={planProgress}
          activeSource={activeSource}
          hasOwnPlan={!!personalTemplate}
        />

        <div className="mt-8">
          <h2 className="text-lg font-bold mb-1">Study Planner</h2>
          <p className="text-sm text-slate-400 mb-3">
            Same day-by-day grid the student sees and edits themselves - you can fill in "Planned
            system" ahead of time or correct anything here.
          </p>
          <div className="mb-3">
            <PlannerStartDateControl studentId={params.id} initialStartDate={plannerStartDate} />
          </div>
          <PlannerGridClient
            targetUserId={params.id}
            columns={plannerColumns}
            initialEntries={plannerEntries}
            startDate={plannerStartDate}
          />
        </div>

        <div className="mt-8">
          <h2 className="text-lg font-bold mb-1">Performance</h2>
          <p className="text-sm text-slate-400 mb-3">
            Score reports this student has uploaded, plus their weak/strong systems and AI suggestions.
          </p>
          <PerformanceClient userId={params.id} initialReports={scoreReports} />
        </div>
      </main>
    </div>
  );
}
