import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { easternDateStringNow } from "@/lib/timezone";
import { computeTodayStatus } from "@/lib/plannerStatus";
import { resolvePlannerColumns } from "@/lib/plannerColumns";
import type { PlannerColumn, PlannerEntry } from "@/lib/plannerColumns";
import type { UWorldBlock } from "@/lib/uworldBlocks";
import type { PlanTask } from "@/lib/planTasks";

export const dynamic = "force-dynamic";

// Runs once a day at 9am ET (see vercel.json). Catches students who still
// hadn't finished yesterday's Assignments by the time the 9:30 PM ET
// evening reminder (planner-evening-reminder/route.ts) went out the night
// before, or who ignored it - one more nudge the next morning.
//
// Uses the exact same "Completed" (green) check the planner calendar
// itself uses - see computeTodayStatus in lib/plannerStatus.ts and its twin
// computeDayStatus in lib/plannerCalendar.ts: every Assignment for that day
// checked off, plus (wherever a mentor has that journal section turned on
// for this student) Mood/Today's Biggest Issue/Resources Used/Student
// Notes filled in, and any UWorld block that was started fully filled in.
//
// This used to run against a completely different, older system - a
// mentor-assigned schedule_templates/personal_templates row plus a
// daily_logs entry - from before Assignments (mentor_plan_tasks) and the
// calendar existed. That old system is no longer how a day's plan actually
// gets marked "green" anywhere else in the app (see the comment at the top
// of app/planner/page.tsx about the flat grid's retirement), so a student
// who fully completed yesterday's Assignments but had never touched
// daily_logs still got a "yesterday's plan is still unmarked" email. This
// brings the check in line with what the calendar (and the evening
// reminder) actually consider "done".
//
// Only students a mentor has assigned a planner to (a row in
// student_planner_settings, same as the evening reminder) are considered,
// and only if yesterday actually had Assignments - a rest day with nothing
// assigned is never "unmarked", it just has no plan.

function yesterdayEasternStr(): string {
  const today = easternDateStringNow();
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${expected}`) return true;
  // Also accept ?secret=... in the URL so it's easy to trigger a one-off
  // test run straight from a browser address bar.
  const querySecret = req.nextUrl.searchParams.get("secret");
  return querySecret === expected;
}

async function sendReminderEmail(to: string, fullName: string | null): Promise<boolean> {
  const firstName = (fullName || "").trim().split(/\s+/)[0] || "there";
  const from = process.env.REMINDER_FROM_EMAIL || "Master Grid <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: "Yesterday's study plan is still unmarked",
      html: `
        <div style="font-family: -apple-system, Segoe UI, Arial, sans-serif; font-size: 15px; color: #1a1a1a; line-height: 1.6;">
          <p>Hi ${firstName},</p>
          <p>
            Looks like yesterday's plan on Master Grid wasn't fully marked - not every Assignment
            was checked off, or something else needed for the day (like your mood, notes, or a
            UWorld block) is still missing.
          </p>
          <p>
            Take a minute today to open your planner and update it, even if that just
            means marking a task as done late. Keeping it current is what makes your
            progress tracking (and your coach's view of it) actually useful.
          </p>
          <p>
            Consistency matters more than any single day - a quick, honest update every
            day will serve you far better than a perfect log with gaps in it. Keep going.
          </p>
          <p>- Master Grid</p>
        </div>
      `,
    }),
  });

  return res.ok;
}

async function runReminders() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const yesterday = yesterdayEasternStr();

  const { data: settingsRows, error: settingsError } = await supabase
    .from("student_planner_settings")
    .select("student_id, start_date")
    .lte("start_date", yesterday);

  if (settingsError) {
    return { error: settingsError.message, checked: 0, remindersSent: 0, details: [] as any[] };
  }

  const { data: allColumns } = await supabase.from("planner_columns").select("*");
  const columns = (allColumns ?? []) as PlannerColumn[];

  const assigned = settingsRows ?? [];
  const details: { email: string; sent: boolean; reason: string }[] = [];

  for (const row of assigned as { student_id: string; start_date: string }[]) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", row.student_id)
      .maybeSingle();
    if (!profile?.email) continue;

    const { data: entryRow } = await supabase
      .from("planner_entries")
      .select("*")
      .eq("user_id", row.student_id)
      .eq("log_date", yesterday)
      .maybeSingle();
    const entries = entryRow ? [entryRow as PlannerEntry] : [];

    const { data: blockRows } = await supabase
      .from("uworld_blocks")
      .select("*")
      .eq("user_id", row.student_id)
      .eq("log_date", yesterday);
    const blocks = (blockRows ?? []) as UWorldBlock[];

    const { data: taskRows } = await supabase
      .from("mentor_plan_tasks")
      .select("*")
      .eq("student_id", row.student_id)
      .eq("task_date", yesterday);
    const planTasks = (taskRows ?? []) as PlanTask[];

    const journalColumns = resolvePlannerColumns(columns, row.student_id);
    const status = computeTodayStatus(entries, blocks, planTasks, yesterday, journalColumns);

    if (status.assignmentsTotal === 0) {
      continue; // rest day - nothing assigned, nothing to mark
    }
    if (status.studyCompleted) {
      continue; // already fully green - no reminder needed
    }

    const sent = await sendReminderEmail(profile.email, profile.full_name);
    details.push({ email: profile.email, sent, reason: sent ? "reminded" : "send failed" });
  }

  return {
    yesterday,
    checked: assigned.length,
    remindersSent: details.filter((d) => d.sent).length,
    details,
  };
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runReminders();
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  return GET(req);
}
