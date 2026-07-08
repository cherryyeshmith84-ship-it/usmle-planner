import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/adminGuard";
import type { BlockScore, CoachMessage, DailyLog, Profile, ScheduleTemplate } from "@/lib/types";
import { buildRoadmap, computePlanProgress, getTemplateDays, type PlanProgress } from "@/lib/templateDays";
import AdminNav from "@/components/AdminNav";
import AdminStudentDetail from "@/components/AdminStudentDetail";

export const dynamic = "force-dynamic";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default async function StudentDetailPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireAdmin();

  const { data: studentData } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!studentData) notFound();
  const student = studentData as Profile;

  const { data: logsData } = await supabase
    .from("daily_logs")
    .select("*")
    .eq("user_id", params.id)
    .order("log_date", { ascending: false })
    .limit(14);

  const { data: templatesData } = await supabase
    .from("schedule_templates")
    .select("*")
    .order("stage", { ascending: true })
    .order("name", { ascending: true });
  const templates = (templatesData ?? []) as ScheduleTemplate[];

  const { data: messagesData } = await supabase
    .from("messages")
    .select("*")
    .eq("student_id", params.id)
    .order("created_at", { ascending: true });

  const { data: scoreRows } = await supabase
    .from("daily_logs")
    .select("block_scores")
    .eq("user_id", params.id);
  const allBlockScores: BlockScore[] = (scoreRows ?? []).flatMap(
    (r: any) => (r.block_scores ?? []) as BlockScore[]
  );

  // Full day-by-day roadmap for whatever this student is currently assigned,
  // so the coach can see the whole plan (not just the last 14 days) in one place.
  const today = todayStr();
  const assignedTemplate = templates.find((t) => t.id === student.assigned_template_id) ?? null;
  const days = getTemplateDays(assignedTemplate);
  const startDate = student.assigned_template_start_date || today;
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
        />
      </main>
    </div>
  );
}
