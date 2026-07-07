import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CoachMessage, DailyLog, Profile, ScheduleTemplate } from "@/lib/types";
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

  if (!profile?.prep_stage) {
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

  const { data: messagesData } = await supabase
    .from("messages")
    .select("*")
    .eq("student_id", user.id)
    .order("created_at", { ascending: true });

  return (
    <DashboardClient
      userId={user.id}
      profile={profile}
      todayLog={todayLog}
      recentLogs={logs}
      today={today}
      streak={streak}
      daysUntilExam={daysUntilExam}
      assignedTemplate={assignedTemplate}
      initialMessages={(messagesData ?? []) as CoachMessage[]}
    />
  );
}
