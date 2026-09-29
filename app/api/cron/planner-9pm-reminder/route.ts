import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { easternDateStringNow, EASTERN_TZ } from "@/lib/timezone";
import { computeTodayStatus } from "@/lib/plannerStatus";
import { resolvePlannerColumns } from "@/lib/plannerColumns";
import type { PlannerColumn, PlannerEntry } from "@/lib/plannerColumns";
import type { UWorldBlock } from "@/lib/uworldBlocks";
import type { PlanTask } from "@/lib/planTasks";

export const dynamic = "force-dynamic";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://master-grid.vercel.app";

/**
 * The timezone-aware half of the "update your planner" reminder - the
 * website-popup half is Planner9pmPopup.tsx + /api/planner/today-status.
 * Triggered every 15 minutes by the GitHub Actions workflow (not Vercel's
 * own Cron Jobs - see planner-evening-reminder/route.ts's doc comment on
 * the Hobby-plan 2-cron cap), so it can catch each student's own local 9pm
 * as it rolls around the world, not just one fixed moment in Eastern Time.
 *
 * For each onboarded, non-admin student: figure out what hour it currently
 * is in THEIR stored profiles.timezone (see TimezoneSync.tsx - falls back
 * to Eastern Time if a student's browser has never reported in yet), skip
 * unless it's currently their 9 o'clock hour (21:00-21:59 local), then skip
 * again if they've already been reminded today. "Today" for the dedup
 * marker is deliberately the shared Eastern-calendar-date
 * (easternDateStringNow()), not each student's own local date - simpler
 * than tracking a separate "last reminded" date per timezone, and the only
 * practical effect is a student whose local day rolls over near the
 * Eastern-Time midnight could in rare cases go two calendar days without a
 * reminder around that boundary, which is an acceptable trade for not
 * needing per-timezone dedup bookkeeping.
 *
 * Supersedes the old fixed-9:30pm-ET evening reminder
 * (planner-evening-reminder/route.ts - no longer triggered by the GitHub
 * Actions workflow, see planner-reminders.yml) and broadens its audience:
 * that one only reminded students a mentor had assigned a planner to (a
 * student_planner_settings row); this one reminds every onboarded student
 * with any Assignments due today, whether their plan came from a mentor or
 * their own Personal Plan.
 *
 * Only nags a student who has touched NONE of today's Assignments by 9pm -
 * any progress at all (even 1 of several checked off) counts as "updated"
 * and skips the email, same as a fully completed day. This is deliberately
 * more lenient than the in-app "Completed" badge (which still requires
 * every Assignment plus the journal fields), so a student who's partway
 * through their day isn't nagged for not having finished everything.
 */

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${expected}`) return true;
  const querySecret = req.nextUrl.searchParams.get("secret");
  return querySecret === expected;
}

/** Current local date ("YYYY-MM-DD") and hour (0-23) in an arbitrary IANA
 *  timezone string. Returns null for an invalid/unrecognized zone (e.g. a
 *  corrupted value) rather than throwing, so one bad profile row can't take
 *  down the whole run. */
function localDateAndHour(timeZone: string): { date: string; hour: number } | null {
  try {
    const dateFmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const hourFmt = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false });
    const date = dateFmt.format(new Date());
    const hourRaw = Number(hourFmt.format(new Date()));
    return { date, hour: hourRaw === 24 ? 0 : hourRaw };
  } catch {
    return null;
  }
}

async function sendReminderEmail(to: string, firstName: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const from = process.env.REMINDER_FROM_EMAIL || "Master Grid <onboarding@resend.dev>";
  const plannerUrl = `${SITE_URL}/planner`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      subject: "It's 9 PM - update today's planner",
      html: `
        <div style="font-family: -apple-system, Segoe UI, Arial, sans-serif; font-size: 15px; color: #1a1a1a; line-height: 1.6;">
          <p>Hi ${firstName},</p>
          <p>It's 9 PM your time, and today's row on your Master Grid planner hasn't been touched yet.
            Take a minute to check off your Assignments and fill in anything else that's needed
            before the day closes out.</p>
          <p><a href="${plannerUrl}">Open your planner &#8594;</a></p>
          <p>- Master Grid</p>
        </div>
      `,
    }),
  });
  return res.ok;
}

async function runReminders() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const easternToday = easternDateStringNow();

  const { data: studentsData, error: studentsError } = await supabase
    .from("profiles")
    .select("id, email, full_name, timezone, last_9pm_reminder_date")
    .eq("onboarding_completed", true)
    .eq("is_admin", false);

  if (studentsError) {
    return { error: studentsError.message, checked: 0, remindersSent: 0, details: [] as any[] };
  }

  const { data: allColumns } = await supabase.from("planner_columns").select("*");
  const columns = (allColumns ?? []) as PlannerColumn[];

  const students = (studentsData ?? []) as {
    id: string;
    email: string | null;
    full_name: string | null;
    timezone: string | null;
    last_9pm_reminder_date: string | null;
  }[];

  const details: { email: string; sent: boolean; reason: string }[] = [];
  let checked = 0;

  for (const student of students) {
    if (!student.email) continue;

    const local = localDateAndHour(student.timezone || EASTERN_TZ);
    if (!local) continue;
    if (local.hour !== 21) continue; // not this student's 9pm hour right now
    checked++;

    if (student.last_9pm_reminder_date === easternToday) continue; // already evaluated today

    const { data: entryRow } = await supabase
      .from("planner_entries")
      .select("*")
      .eq("user_id", student.id)
      .eq("log_date", local.date)
      .maybeSingle();
    const entries = entryRow ? [entryRow as PlannerEntry] : [];

    const { data: blockRows } = await supabase
      .from("uworld_blocks")
      .select("*")
      .eq("user_id", student.id)
      .eq("log_date", local.date);
    const blocks = (blockRows ?? []) as UWorldBlock[];

    const { data: taskRows } = await supabase
      .from("mentor_plan_tasks")
      .select("*")
      .eq("student_id", student.id)
      .eq("task_date", local.date);
    const planTasks = (taskRows ?? []) as PlanTask[];

    const journalColumns = resolvePlannerColumns(columns, student.id);
    const status = computeTodayStatus(entries, blocks, planTasks, local.date, journalColumns);

    if (status.assignmentsTotal === 0 || status.assignmentsCompleted > 0) {
      // Nothing to nag about - either no Assignments were due today, or
      // the student has made at least some progress (a partial update is
      // enough to skip the reminder, not just a fully "Completed" day).
      // Still mark the dedup date so this student isn't re-evaluated again
      // on the next 15-minute tick within the same local 9pm hour.
      await supabase.from("profiles").update({ last_9pm_reminder_date: easternToday }).eq("id", student.id);
      continue;
    }

    const firstName = (student.full_name || "").trim().split(/\s+/)[0] || "there";
    const sent = await sendReminderEmail(student.email, firstName);
    await supabase.from("profiles").update({ last_9pm_reminder_date: easternToday }).eq("id", student.id);
    details.push({ email: student.email, sent, reason: sent ? "reminded" : "send failed" });
  }

  return { easternToday, checked, remindersSent: details.filter((d) => d.sent).length, details };
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
