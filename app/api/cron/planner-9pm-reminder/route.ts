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
 * the Hobby-plan 2-cron cap), so it can catch each student's own local
 * 9:30 PM as it rolls around the world, not just one fixed moment in
 * Eastern Time.
 *
 * For each onboarded, non-admin student: figure out what time it currently
 * is in THEIR stored profiles.timezone (see TimezoneSync.tsx - falls back
 * to Eastern Time if a student's browser has never reported in yet), skip
 * unless it's currently between 9:30 PM and midnight local (a wide window,
 * because GitHub Actions ticks can be hours apart), then skip again if
 * they've already been reminded today. "Today" for the
 * dedup marker is deliberately the shared Eastern-calendar-date
 * (easternDateStringNow()), not each student's own local date.
 *
 * Only nags a student who has touched NONE of today's Assignments by then -
 * any progress at all (even 1 of several checked off) counts as "updated"
 * and skips the email, same as a fully completed day.
 */

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${expected}`) return true;
  const querySecret = req.nextUrl.searchParams.get("secret");
  return querySecret === expected;
}

/** Current local date ("YYYY-MM-DD") and minutes-since-midnight (0-1439) in
 *  an arbitrary IANA timezone string. Returns null for an invalid/unrecognized
 *  zone rather than throwing, so one bad profile row can't take down the run. */
function localDateAndMinutes(timeZone: string): { date: string; minutes: number } | null {
  try {
    const dateFmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const timeFmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    });
    const now = new Date();
    const date = dateFmt.format(now);
    const parts = timeFmt.formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return { date, minutes: h * 60 + m };
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
      subject: "You've got this - a quick planner update before bed",
      html: `
        <div style="font-family: -apple-system, Segoe UI, Arial, sans-serif; font-size: 15px; color: #1a1a1a; line-height: 1.6;">
          <p>Hi ${firstName},</p>
          <p>Every day you show up is a day closer to your goal - and we're proud of you for putting in the work.</p>
          <p>We noticed today's planner hasn't been updated yet. It only takes a minute: tick off what you
            finished today, even if it wasn't everything. Small, steady progress is what wins this exam,
            and keeping your planner current lets your mentor cheer you on and help you adjust.</p>
          <p><a href="${plannerUrl}">Update my planner &#8594;</a></p>
          <p>Rest well tonight - you're doing better than you think.</p>
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

    const local = localDateAndMinutes(student.timezone || EASTERN_TZ);
    if (!local) continue;
    // 9:30 PM - 11:59 PM local. GitHub Actions' "every 15 minutes" schedule
    // is only best-effort and often runs just every 1-3 hours, so a narrow
    // window made it miss whole time zones. This wider window catches the
    // next run after 9:30 PM; the per-day marker below stops repeats.
    if (local.minutes < 21 * 60 + 30) continue;
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
      // the student has made at least some progress. Still mark the dedup
      // date so this student isn't re-evaluated on every later tick.
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
