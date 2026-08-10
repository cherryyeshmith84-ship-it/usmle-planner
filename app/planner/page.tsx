import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { PlannerColumn, PlannerEntry, StudyResource } from "@/lib/plannerColumns";
import { resolvePlannerColumns } from "@/lib/plannerColumns";
import type { UWorldBlock } from "@/lib/uworldBlocks";
import type { MentorDailyNote } from "@/lib/mentorDailyNotes";
import type { PlanTask } from "@/lib/planTasks";
import { computeWeeklyProgress } from "@/lib/weeklyProgress";
import { computeTodayStatus } from "@/lib/plannerStatus";
import { computeStreaks } from "@/lib/streaks";
import { groupTasksByDate } from "@/lib/planTasks";
import {
  addDaysIso,
  buildCalendarRange,
  computeMonthStats,
  monthGridStart,
  weekNumberInPlan,
  weekStartMonday,
} from "@/lib/plannerCalendar";
import { getContentPublished } from "@/lib/platformSettings";
import { easternDateStringNow } from "@/lib/timezone";
import { computeAchievements } from "@/lib/achievements";
import AppShell from "@/components/AppShell";
import PlannerGridClient from "@/components/PlannerGridClient";
import PlannerCalendar from "@/components/PlannerCalendar";
import { WeekStrip, MonthStatsGrid, Heatmap, AchievementBadges } from "@/components/PlannerInsights";
import WeeklyProgress from "@/components/WeeklyProgress";
import PlannerStatusHeader from "@/components/PlannerStatusHeader";

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

  const [columnsRes, entriesRes, blocksRes, mentorNotesRes, planTasksRes, resourcesRes, plannerSettingsRes] = await Promise.all([
    // Global defaults plus this student's own customized columns, if their
    // mentor has set any up for them (see resolvePlannerColumns below and
    // MentorPlannerColumnsEditor, which is where those get created).
    supabase
      .from("planner_columns")
      .select("*")
      .or(`student_id.is.null,student_id.eq.${user.id}`)
      .order("sort_order", { ascending: true }),
    supabase.from("planner_entries").select("*").eq("user_id", user.id),
    supabase.from("uworld_blocks").select("*").eq("user_id", user.id),
    supabase.from("mentor_daily_notes").select("*").eq("student_id", user.id),
    supabase.from("mentor_plan_tasks").select("*").eq("student_id", user.id),
    supabase.from("study_resources").select("*").eq("active", true).order("sort_order", { ascending: true }),
    supabase.from("student_planner_settings").select("start_date").eq("student_id", user.id).maybeSingle(),
  ]);

  const columns = resolvePlannerColumns((columnsRes.data ?? []) as PlannerColumn[], user.id);
  const entries = (entriesRes.data ?? []) as PlannerEntry[];
  const blocks = (blocksRes.data ?? []) as UWorldBlock[];
  const mentorNotes = (mentorNotesRes.data ?? []) as MentorDailyNote[];
  const planTasks = (planTasksRes.data ?? []) as PlanTask[];
  const studyResources = (resourcesRes.data ?? []) as StudyResource[];
  const plannerStartDate = (plannerSettingsRes.data as { start_date: string } | null)?.start_date ?? null;
  // Eastern Time, not the server's UTC clock - otherwise "today" (and the
  // weekly progress/status header above the grid) can silently roll over to
  // tomorrow's date hours before it actually is tomorrow in ET.
  const today = easternDateStringNow();
  const weeklySummary = computeWeeklyProgress(entries, blocks, planTasks, today);
  const todayStatus = computeTodayStatus(entries, blocks, planTasks, today);

  // Weekly View / Monthly Statistics / Heatmap (Study Planner v2, phase 2) -
  // all derived from the same mentor_plan_tasks day-status logic as the
  // calendar above (see lib/plannerCalendar.ts).
  const tasksByDate = groupTasksByDate(planTasks);
  const weekStart = weekStartMonday(today);
  const weekDays = buildCalendarRange(tasksByDate, weekStart, addDaysIso(weekStart, 6), today);
  const currentWeekNumber = weekNumberInPlan(today, plannerStartDate);

  const monthGridBegin = monthGridStart(today);
  const currentMonthPrefix = today.slice(0, 7);
  const monthDays = buildCalendarRange(tasksByDate, monthGridBegin, addDaysIso(monthGridBegin, 41), today).filter(
    (d) => d.date.startsWith(currentMonthPrefix)
  );
  const monthStats = computeMonthStats(monthDays, entries);
  const streaks = computeStreaks([...entries.map((e) => e.log_date), ...blocks.map((b) => b.log_date)], today);
  const [monthYear, monthMonth] = today.split("-").map(Number);
  const monthLabel = new Date(Date.UTC(monthYear, monthMonth - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  // Last ~12 weeks (84 days), starting on a Monday, for the GitHub-style
  // heatmap - deliberately its own range from the month grid above since it
  // spans months.
  const heatmapStart = weekStartMonday(addDaysIso(today, -83));
  const heatmapDays = buildCalendarRange(tasksByDate, heatmapStart, today, today);

  // Achievement badges (Study Planner v2, phase 3) - "reward consistency,
  // not perfection." Streak badges use the longest streak ever reached (see
  // lib/achievements.ts); "Zero Missed Days" is scoped to just this week so
  // it resets weekly instead of being unattainable forever after one miss.
  const totalCompletedTasks = planTasks.filter((t) => t.completed).length;
  const weekMissedDays = weekDays.filter((d) => d.status === "missed").length;
  const weekHasAnyTasks = weekDays.some((d) => d.totalCount > 0);
  const achievements = computeAchievements({
    longestStreak: streaks.longest,
    totalCompletedTasks,
    weekHasAnyTasks,
    weekMissedDays,
  });

  return (
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 px-6 py-8 w-full">
        <div className="mb-6">
          <h1 className="text-xl font-bold mb-1">My Study Plan</h1>
          <p className="text-sm text-slate-400">
            Log your day-by-day progress here - First Aid pages, questions, hours, and notes. Click the
            ▸ next to a day to log UWorld blocks for it. Click "Show earlier week" / "Show more weeks" to
            move the range, or jump straight to a date.
          </p>
        </div>

        <PlannerStatusHeader status={todayStatus} />

        <PlannerCalendar initialTasks={planTasks} startDate={plannerStartDate} todayIso={today} />

        <WeekStrip weekNumber={currentWeekNumber} days={weekDays} />

        <MonthStatsGrid
          monthLabel={monthLabel}
          stats={monthStats}
          currentStreak={streaks.current}
          longestStreak={streaks.longest}
        />

        <Heatmap days={heatmapDays} />

        <AchievementBadges achievements={achievements} />

        <WeeklyProgress summary={weeklySummary} />

        <PlannerGridClient
          targetUserId={user.id}
          columns={columns}
          initialEntries={entries}
          initialBlocks={blocks}
          initialMentorNotes={mentorNotes}
          initialPlanTasks={planTasks}
          studyResources={studyResources}
          startDate={plannerStartDate}
          enforceEditWindow
        />
      </main>
    </AppShell>
  );
}
