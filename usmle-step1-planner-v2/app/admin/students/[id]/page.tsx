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
import AdminNav from "@/components/AdminNav";
import AdminStudentDetail from "@/components/AdminStudentDetail";

export const dynamic = "force-dynamic";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default async function StudentDetailPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireAdmin();

  // None of these six queries depend on each other's results - only on the
  // student id from the URL - so run them all at once instead of one by one.
  const [studentRes, logsRes, templatesRes, messagesRes, scoreRes, personalRes] = await Promise.all([
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
      </main>
    </div>
  );
}
