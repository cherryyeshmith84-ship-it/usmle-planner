import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTemplateDays, dayNumberFor, tasksForDay } from "@/lib/templateDays";
import type { Profile, DailyLog, ScheduleTemplate, PersonalTemplate } from "@/lib/types";

export const dynamic = "force-dynamic";

// Runs once a day (see vercel.json). For every student, checks YESTERDAY's
// daily_logs row: if they had tasks assigned that day and never marked
// anything (no task status change, no hours/notes, not marked_complete),
// sends them a reminder email via Resend. Students who had no plan that
// day (rest day, or no template assigned yet) are skipped, not reminded.

function yesterdayStr(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
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

function hasProgress(log: DailyLog | null): boolean {
  if (!log) return false;
  return (
    (log.tasks ?? []).some((t) => t.status !== "pending") ||
    !!log.hours_studied ||
    !!log.notes ||
    !!log.ai_feedback ||
    !!log.marked_complete
  );
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
            Looks like yesterday's plan on Master Grid wasn't marked yet - no tasks were
            checked off or skipped, and no notes or hours were logged.
          </p>
          <p>
            Take a minute today to open your dashboard and update it, even if that just
            means marking a task as skipped. Keeping it current is what makes your
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

  const yesterday = yesterdayStr();

  const { data: profilesData, error: profilesError } = await supabase
    .from("profiles")
    .select("*")
    .eq("is_admin", false)
    .eq("onboarding_completed", true);

  if (profilesError) {
    return { error: profilesError.message, checked: 0, remindersSent: 0, details: [] as any[] };
  }

  const students = (profilesData ?? []) as Profile[];
  const details: { email: string; sent: boolean; reason: string }[] = [];

  for (const student of students) {
    if (!student.email) {
      continue;
    }

    const activeSource = student.active_plan_source || "coach";
    let activeTemplate: ScheduleTemplate | PersonalTemplate | null = null;
    let activeStartDate: string | null = null;

    if (activeSource === "own") {
      const { data } = await supabase
        .from("personal_templates")
        .select("*")
        .eq("user_id", student.id)
        .maybeSingle();
      activeTemplate = (data as PersonalTemplate) ?? null;
      activeStartDate = activeTemplate?.start_date ?? null;
    } else if (student.assigned_template_id) {
      const { data } = await supabase
        .from("schedule_templates")
        .select("*")
        .eq("id", student.assigned_template_id)
        .single();
      activeTemplate = (data as ScheduleTemplate) ?? null;
      activeStartDate = student.assigned_template_start_date ?? null;
    }

    if (!activeTemplate || !activeStartDate) {
      continue; // no plan assigned yet - nothing to have marked
    }
    if (yesterday < activeStartDate) {
      continue; // plan hadn't started yet as of yesterday
    }

    const days = getTemplateDays(activeTemplate);
    if (days.length === 0) continue;

    const dayNumber = dayNumberFor(activeStartDate, yesterday);
    const tasksYesterday = tasksForDay(days, dayNumber);
    if (tasksYesterday.length === 0) {
      continue; // rest day - nothing assigned, nothing to mark
    }

    const { data: logData } = await supabase
      .from("daily_logs")
      .select("*")
      .eq("user_id", student.id)
      .eq("log_date", yesterday)
      .maybeSingle();

    if (hasProgress(logData as DailyLog | null)) {
      continue; // already marked - no reminder needed
    }

    const sent = await sendReminderEmail(student.email, student.full_name);
    details.push({ email: student.email, sent, reason: sent ? "reminded" : "send failed" });
  }

  return {
    checked: students.length,
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
