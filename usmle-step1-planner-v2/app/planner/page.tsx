import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DailyLog, Profile, ScheduleTemplate } from "@/lib/types";
import { buildRoadmap, getTemplateDays } from "@/lib/templateDays";
import NavBar from "@/components/NavBar";
import PlannerRoadmap from "@/components/PlannerRoadmap";

export const dynamic = "force-dynamic";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default async function PlannerPage() {
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
  if (!profile?.onboarding_completed) redirect("/onboarding");

  const today = todayStr();

  let assignedTemplate: ScheduleTemplate | null = null;
  if (profile?.assigned_template_id) {
    const { data: templateData } = await supabase
      .from("schedule_templates")
      .select("*")
      .eq("id", profile.assigned_template_id)
      .single();
    assignedTemplate = (templateData as ScheduleTemplate) ?? null;
  }

  const days = getTemplateDays(assignedTemplate);
  const startDate = profile?.assigned_template_start_date || today;

  let roadmap: ReturnType<typeof buildRoadmap> = [];
  if (days.length > 0) {
    const { data: logsData } = await supabase
      .from("daily_logs")
      .select("*")
      .eq("user_id", user.id)
      .gte("log_date", startDate);
    roadmap = buildRoadmap(days, startDate, (logsData ?? []) as DailyLog[]);
  }

  return (
    <div className="min-h-screen flex">
      <NavBar isAdmin={profile?.is_admin} />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-1">Your planner</h1>
        <p className="text-sm text-slate-400 mb-6">
          The full day-by-day plan your coach has given you so far - Day 1
          through Day {days.length || 0}.
        </p>

        {!assignedTemplate && (
          <p className="text-sm text-slate-400">
            No plan assigned yet - your coach is reviewing your intake and will
            assign one soon.
          </p>
        )}

        <PlannerRoadmap entries={roadmap} today={today} />
      </main>
    </div>
  );
}
