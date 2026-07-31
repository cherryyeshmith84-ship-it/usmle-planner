import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { PlannerColumn, PlannerEntry } from "@/lib/plannerColumns";
import type { UWorldBlock } from "@/lib/uworldBlocks";
import type { MentorDailyNote } from "@/lib/mentorDailyNotes";
import type { PlanTask } from "@/lib/planTasks";
import { computeWeeklyProgress } from "@/lib/weeklyProgress";
import { getContentPublished } from "@/lib/platformSettings";
import AppShell from "@/components/AppShell";
import PlannerGridClient from "@/components/PlannerGridClient";
import WeeklyProgress from "@/components/WeeklyProgress";

export const dynamic = "force-dynamic";

/**
 * Planner page - day-by-day tracking grid (Planned System, First Aid
 * Pages, Questions Planned/Completed/Reviewed, Hours Studied, Study
 * Status - see planner_columns) is the "Daily Study Planner" (Study
 * Planner v1 item 1). Each row also expands into a day workspace panel,
 * starting with the UWorld Block Tracker (item 2) - more sections (Student/
 * Mentor Notes, Assignments, Reflection, etc.) land there as later items in
 * that spec are built, so a day becomes more than a flat spreadsheet row.
 * Columns are admin-configurable from /admin/planner-config. This replaced
 * the older template-driven task checklist; that still exists for the AI
 * coach (app/planner/mine and schedule_templates), which this page doesn't
 * touch.
 */
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

  const contentPublished = profile?.is_admin ? true : await getContentPublished(supabase);

  const [columnsRes, entriesRes, blocksRes, mentorNotesRes, planTasksRes] = await Promise.all([
    supabase.from("planner_columns").select("*").order("sort_order", { ascending: true }),
    supabase.from("planner_entries").select("*").eq("user_id", user.id),
    supabase.from("uworld_blocks").select("*").eq("user_id", user.id),
    supabase.from("mentor_daily_notes").select("*").eq("student_id", user.id),
    supabase.from("mentor_plan_tasks").select("*").eq("student_id", user.id),
  ]);

  const columns = (columnsRes.data ?? []) as PlannerColumn[];
  const entries = (entriesRes.data ?? []) as PlannerEntry[];
  const blocks = (blocksRes.data ?? []) as UWorldBlock[];
  const mentorNotes = (mentorNotesRes.data ?? []) as MentorDailyNote[];
  const planTasks = (planTasksRes.data ?? []) as PlanTask[];
  const weeklySummary = computeWeeklyProgress(entries, blocks, planTasks, new Date().toISOString().slice(0, 10));

  return (
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 max-w-6xl mx-auto px-6 py-8 w-full">
        <div className="mb-6">
          <h1 className="text-xl font-bold mb-1">My Study Plan</h1>
          <p className="text-sm text-slate-400">
            Log your day-by-day progress here - First Aid pages, questions, hours, and notes. Click the
            ▸ next to a day to log UWorld blocks for it. Click "Show earlier week" / "Show more weeks" to
            move the range, or jump straight to a date.
          </p>
        </div>

        <WeeklyProgress summary={weeklySummary} />

        <PlannerGridClient
          targetUserId={user.id}
          columns={columns}
          initialEntries={entries}
          initialBlocks={blocks}
          initialMentorNotes={mentorNotes}
          initialPlanTasks={planTasks}
        />
      </main>
    </AppShell>
  );
}
