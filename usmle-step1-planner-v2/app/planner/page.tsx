import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DailyLog, PersonalTemplate, Profile, ScheduleTemplate } from "@/lib/types";
import { buildRoadmap, computePlanProgress, getTemplateDays, type PlanProgress } from "@/lib/templateDays";
import NavBar from "@/components/NavBar";
import PlannerClient from "@/components/PlannerClient";
import ProgressCircle from "@/components/ProgressCircle";

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
  const activeSource = profile?.active_plan_source || "coach";

  let assignedTemplate: ScheduleTemplate | null = null;
  if (profile?.assigned_template_id) {
    const { data: templateData } = await supabase
      .from("schedule_templates")
      .select("*")
      .eq("id", profile.assigned_template_id)
      .single();
    assignedTemplate = (templateData as ScheduleTemplate) ?? null;
  }

  const { data: personalData } = await supabase
    .from("personal_templates")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  const personalTemplate = (personalData as PersonalTemplate) ?? null;

  const usingOwn = activeSource === "own";
  const activeTemplate = usingOwn ? personalTemplate : assignedTemplate;
  const days = getTemplateDays(activeTemplate);
  const startDate =
    (usingOwn ? personalTemplate?.start_date : profile?.assigned_template_start_date) || today;

  let roadmap: ReturnType<typeof buildRoadmap> = [];
  let planProgress: PlanProgress | null = null;
  if (days.length > 0) {
    const { data: logsData } = await supabase
      .from("daily_logs")
      .select("*")
      .eq("user_id", user.id)
      .gte("log_date", startDate);
    const logs = (logsData ?? []) as DailyLog[];
    roadmap = buildRoadmap(days, startDate, logs);
    planProgress = computePlanProgress(days, logs);
  }

  return (
    <div className="min-h-screen flex">
      <NavBar isAdmin={profile?.is_admin} />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="text-xl font-bold mb-1">Your planner</h1>
            <p className="text-sm text-slate-400">
              {usingOwn
                ? `Your own plan - Day 1 through Day ${days.length || 0}.`
                : `The full day-by-day plan your coach has given you so far - Day 1 through Day ${
                    days.length || 0
                  }.`}
            </p>
          </div>
          {planProgress && (
            <ProgressCircle
              pct={planProgress.pct}
              complete={planProgress.complete}
              label={`${planProgress.doneCount}/${planProgress.totalCount} tasks`}
            />
          )}
        </div>

        <PlannerClient
          userId={user.id}
          entries={roadmap}
          today={today}
          activeSource={activeSource}
          hasCoachPlan={!!assignedTemplate}
          hasOwnPlan={!!personalTemplate}
        />
      </main>
    </div>
  );
}
