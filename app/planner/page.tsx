import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { PlannerColumn, PlannerEntry, StudyResource } from "@/lib/plannerColumns";
import { resolvePlannerColumns, mainPlannerColumns } from "@/lib/plannerColumns";
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
import PlannerCalendar from "@/components/PlannerCalendar";
import { WeekStrip, MonthStatsGrid, Heatmap, AchievementBadges } from "@/components/PlannerInsights";
import WeeklyProgress from "@/components/WeeklyProgress";
import PlannerStatusHeader from "@/components/PlannerStatusHeader";

export const dynamic = "force-dynamic";

/**
 * Planner page - the calendar (PlannerCalendar.tsx) is the ONE place a
 * day's plan lives: click a day, see Assignments plus UWorld blocks, Mood,
 * Notes, Reflection, and everything else for it (DailyPlannerPanel.tsx).
 * This used to be a separate flat grid (Planned System / First Aid Pages /
 * etc. as freeform columns per day) sitting below the calendar - retired in
 * favor of one unified place, since having two separate planning tools was
 * the actual cause of a real bug (a mentor who only used the grid never saw
 * their plan reflected on the calendar). Any data that was in the old grid
 * was migrated into Assignments tasks (see the one-time migration marked
 * `detail = 'migrated-from-grid'` in mentor_plan_tasks), so nothing already
 * entered was lost. Columns are still admin-configurable from
 * /admin/planner-config, but now only govern which journal sections (Mood,
 * Study Issues, Resources Used, Tomorrow's Goal, Reflection, Student Notes)
 * are turned on for a student - not a data-entry grid layout anymore.
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

  const columns = resolvePlannerColumns((columnsRes.data ?? []) as PlannerColumn[], user.id).filter((c) => c.active);
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
  // derived from BOTH mentor_plan_tasks ("Assignments") and the flat grid
  // (planner_entries), so a mentor who only ever fills in the grid's
  // Planned System/First Aid Pages/etc. still gets a colored, non-blank
  // calendar - see the merged computeDayStatus in lib/plannerCalendar.ts.
  const tasksByDate = groupTasksByDate(planTasks);
  const entryByDate: Record<string, PlannerEntry> = {};
  for (const e of entries) entryByDate[e.log_date] = e;
  const activeMainColumns = mainPlannerColumns(columns);
  const weekStart = weekStartMonday(today);
  const weekDays = buildCalendarRange(
    tasksByDate,
    weekStart,
    addDaysIso(weekStart, 6),
    today,
    entryByDate,
    activeMainColumns
  );
  const currentWeekNumber = weekNumberInPlan(today, plannerStartDate);

  const monthGridBegin = monthGridStart(today);
  const currentMonthPrefix = today.slice(0, 7);
  const monthDays = buildCalendarRange(
    tasksByDate,
    monthGridBegin,
    addDaysIso(monthGridBegin, 41),
    today,
    entryByDate,
    activeMainColumns
  ).filter((d) => d.date.startsWith(currentMonthPrefix));
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
  const heatmapDays = buildCalendarRange(tasksByDate, heatmapStart, today, today, entryByDate, activeMainColumns);

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
            Click any day on the calendar below to see what's planned - check off Assignments, log UWorld
            blocks, and (if enabled) jot your mood, notes, and reflection for that day.
          </p>
        </div>

        <PlannerStatusHeader status={todayStatus} />

        <PlannerCalendar
          targetUserId={user.id}
          initialTasks={planTasks}
          initialEntries={entries}
          initialBlocks={blocks}
          initialMentorNotes={mentorNotes}
          studyResources={studyResources}
          mainColumns={activeMainColumns}
          columns={columns}
          canEdit
          mentorId={null}
          enforceEditWindow
          startDate={plannerStartDate}
          todayIso={today}
        />

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
      </main>
    </AppShell>
  );
}
