import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/adminGuard";
import type { CoachMessage, DailyLog, Profile, ScheduleTemplate } from "@/lib/types";
import AdminNav from "@/components/AdminNav";
import AdminStudentDetail from "@/components/AdminStudentDetail";

export const dynamic = "force-dynamic";

export default async function StudentDetailPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireAdmin();

  const { data: studentData } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!studentData) notFound();

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

  const { data: messagesData } = await supabase
    .from("messages")
    .select("*")
    .eq("student_id", params.id)
    .order("created_at", { ascending: true });

  return (
    <div className="min-h-screen">
      <AdminNav />
      <main className="max-w-4xl mx-auto px-6 py-8">
        <AdminStudentDetail
          student={studentData as Profile}
          recentLogs={(logsData ?? []) as DailyLog[]}
          templates={(templatesData ?? []) as ScheduleTemplate[]}
          initialMessages={(messagesData ?? []) as CoachMessage[]}
        />
      </main>
    </div>
  );
}
