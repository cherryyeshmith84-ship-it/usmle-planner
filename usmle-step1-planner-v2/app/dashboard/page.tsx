import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { BlockScore, CoachMessage, DailyLog, Profile, ScheduleTemplate, TemplateTask } from "@/lib/types";
import { computePlanProgress, dayNumberFor, getTemplateDays, tasksForDay, type PlanProgress } from "@/lib/templateDays";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function computeStreak(logs: DailyLog[]): number {
  const doneDates = new Set(
    logs.filter((l) => l.marked_complete).map((l) => l.log_date)
  );
  let streak = 0;
  const cursor = new Date();
  if (!doneDates.has(cursor.toISOString().slice(0, 10))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  for (;;) {
    const d = cursor.toISOString().slice(0, 10);
    if (doneDates.has(d)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

export default async function DashboardPage() {
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

  if (!profile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const { data: logsData } = await supabase
    .from("daily_logs")
    .select("*")
    .eq("user_id", user.id)
    .order("log_date", { ascending: false })
    .limit(30);

  const logs = (logsData ?? []) as DailyLog[];
  const today = todayStr();
  const todayLog = logs.find((l) => l.log_date === today) ?? null;
  const streak = computeStreak(logs);

  let daysUntilExam: number | null = null;
  if (profile.exam_date) {
    const diff =
      (new Date(profile.exam_date).getTime() - new Date(today).getTime()) /
      (1000 * 60 * 60 * 24);
    daysUntilExam = Math.ceil(diff);
  }

  let assignedTemplate: ScheduleTemplate | null = null;
  if (profile.assigned_template_id) {
    const { data: templateData } = await supabase
      .from("schedule_templates")
      .select("*")
      .eq("id", profile.assigned_template_id)
      .single();
    assignedTemplate = (templateData as ScheduleTemplate) ?? null;
  }

  let templateDayTasks: TemplateTask[] | null = null;
  let dayInfo: { dayNumber: number; totalDays: number } | null = null;
  let planProgress: PlanProgress | null = null;
  if (assignedTemplate) {
    const days = getTemplateDays(assignedTemplate);
    if (days.length > 0) {
      const startDate = profile.assigned_template_start_date || today;
      const dayNumber = dayNumberFor(startDate, today);
      templateDayTasks = tasksForDay(days, dayNumber);
      dayInfo = { dayNumber, totalDays: days.length };

      const { data: logsSinceStartData } = await supabase
        .from("daily_logs")
        .select("tasks")
        .eq("user_id", user.id)
        .gte("log_date", startDate);
      planProgress = computePlanProgress(days, (logsSinceStartData ?? []) as { tasks: any[] }[]);
    }
  }

  const { data: messagesData } = await supabase
    .from("messages")
    .select("*")
    .eq("student_id", user.id)
    .order("created_at", { ascending: true });

  // Lightweight, unlimited fetch of just block scores across all history,
  // so running averages reflect the student's whole prep, not just recent days.
  const { data: scoreRows } = await supabase
    .from("daily_logs")
    .select("block_scores")
    .eq("user_id", user.id);
  const allBlockScores: BlockScore[] = (scoreRows ?? []).flatMap(
    (r: any) => (r.block_scores ?? []) as BlockScore[]
  );

  return (
    <DashboardClient
      userId={user.id}
      profile={profile}
      todayLog={todayLog}
      recentLogs={logs}
      today={today}
      streak={streak}
      daysUntilExam={daysUntilExam}
      templateDayTasks={templateDayTasks}
      dayInfo={dayInfo}
      planProgress={planProgress}
      allBlockScores={allBlockScores}
      initialMessages={(messagesData ?? []) as CoachMessage[]}
    />
  );
}
