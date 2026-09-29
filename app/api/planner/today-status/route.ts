import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePlannerColumns } from "@/lib/plannerColumns";
import type { PlannerColumn, PlannerEntry } from "@/lib/plannerColumns";
import type { UWorldBlock } from "@/lib/uworldBlocks";
import type { PlanTask } from "@/lib/planTasks";
import { computeTodayStatus } from "@/lib/plannerStatus";

export const dynamic = "force-dynamic";

/**
 * Tells the CLIENT (Planner9pmPopup.tsx) whether the signed-in student's
 * planner still needs attention for a specific calendar date - the date is
 * passed in as a query param (`?date=YYYY-MM-DD`) computed from the
 * caller's OWN local clock, since that's the whole point of this endpoint:
 * "is TODAY (in my timezone, right now) still untouched", not the
 * server's UTC day or any fixed Eastern-Time day. Falls back to today's
 * UTC date if the param is missing or malformed, which only matters for a
 * caller that skipped sending it.
 *
 * Reuses computeTodayStatus - the exact same status calculation the
 * planner calendar and the 9pm email reminder
 * (app/api/cron/planner-9pm-reminder/route.ts) both already use, so the
 * popup, the calendar, and the email can never disagree about the
 * underlying numbers. The "needs a reminder" bar is deliberately lower
 * than "Completed" though: it only flags a day where the student hasn't
 * checked off a single Assignment yet (assignmentsCompleted === 0), same
 * threshold the email cron uses - a student partway through today's
 * Assignments has already "updated" the planner and shouldn't get nagged
 * again just for not being 100% done.
 */
function isValidDateParam(v: string | null): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const dateParam = req.nextUrl.searchParams.get("date");
  const date = isValidDateParam(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);

  const [columnsRes, entryRes, blocksRes, tasksRes] = await Promise.all([
    supabase.from("planner_columns").select("*").or(`student_id.is.null,student_id.eq.${user.id}`),
    supabase.from("planner_entries").select("*").eq("user_id", user.id).eq("log_date", date).maybeSingle(),
    supabase.from("uworld_blocks").select("*").eq("user_id", user.id).eq("log_date", date),
    supabase.from("mentor_plan_tasks").select("*").eq("student_id", user.id).eq("task_date", date),
  ]);

  const columns = resolvePlannerColumns((columnsRes.data ?? []) as PlannerColumn[], user.id).filter(
    (c) => c.active
  );
  const entries = entryRes.data ? [entryRes.data as PlannerEntry] : [];
  const blocks = (blocksRes.data ?? []) as UWorldBlock[];
  const tasks = (tasksRes.data ?? []) as PlanTask[];

  const status = computeTodayStatus(entries, blocks, tasks, date, columns);
  const needsReminder = status.assignmentsTotal > 0 && status.assignmentsCompleted === 0;

  return NextResponse.json({ needsReminder, date });
}
