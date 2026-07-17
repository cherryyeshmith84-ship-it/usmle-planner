import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DailyLog, PersonalTemplate, Profile, ScheduleTemplate } from "@/lib/types";
import { buildRoadmap, computePlanProgress, getTemplateDays, type PlanProgress } from "@/lib/templateDays";
import AppShell from "@/components/AppShell";
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
  const rawSource = profile?.active_plan_source || "coach";

  const [assignedTemplateRes, personalRes] = await Promise.all([
    profile?.assigned_template_id
      ? supabase.from("schedule_templates").select("*").eq("id", profile.assigned_template_id).single()
      : Promise.resolve({ data: null } as any),
    supabase.from("personal_templates").select("*").eq("user_id", user.id).maybeSingle(),
  ]);
  const assignedTemplate = (assignedTemplateRes.data as ScheduleTemplate) ?? null;
  const personalTemplate = (personalRes.data as PersonalTemplate) ?? null;

  // A student can only actually be "on" their own plan if one exists - if
  // active_plan_source says "own" but they never built one (or it got
  // deleted), fall back to the coach plan instead of showing an empty page.
  const usingOwn = rawSource === "own" && !!personalTemplate;
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
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name}>
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8 w-full">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="text-xl font-bold mb-1">My Study Plan</h1>
            <p className="text-sm text-slate-400">
              {usingOwn
                ? `Your own plan - Day 1 through Day ${days.length || 0}.`
                : `Day-by-day, from your coach - Day 1 through Day ${days.length || 0}.`}
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
          activeSource={usingOwn ? "own" : "coach"}
          hasCoachPlan={!!assignedTemplate}
          hasOwnPlan={!!personalTemplate}
        />
      </main>
    </AppShell>
  );
}
