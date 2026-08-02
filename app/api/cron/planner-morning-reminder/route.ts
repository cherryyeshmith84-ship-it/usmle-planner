import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { easternDateStringNow } from "@/lib/timezone";

export const dynamic = "force-dynamic";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://master-grid.vercel.app";

// Morning reminder (~8:30 AM ET, see the GitHub Actions workflow that
// triggers this - NOT vercel.json, same reasoning as
// planner-evening-reminder/route.ts about the Vercel Hobby 2-cron limit).
//
// Sent every morning to every student a mentor has assigned a planner to
// (a row in student_planner_settings with start_date <= today), listing
// whatever the mentor scheduled for today so the student can open the app
// and see it at a glance - unlike the evening reminder, this one is purely
// informational and always sends, it doesn't check whether they've already
// looked.

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${expected}`) return true;
  const querySecret = req.nextUrl.searchParams.get("secret");
  return querySecret === expected;
}

function taskListHtml(tasks: { title: string; detail: string | null }[]): string {
  if (tasks.length === 0) {
    return `<p>Your mentor hasn't added any specific tasks for today yet - open your planner to see the rest of your schedule.</p>`;
  }
  const items = tasks
    .map((t) => `<li><strong>${t.title}</strong>${t.detail ? ` - ${t.detail}` : ""}</li>`)
    .join("");
  return `<ul style="margin: 12px 0; padding-left: 20px;">${items}</ul>`;
}

async function sendMorningEmail(
  to: string,
  firstName: string,
  plannedSystem: string | null,
  tasks: { title: string; detail: string | null }[]
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const from = process.env.REMINDER_FROM_EMAIL || "Master Grid <onboarding@resend.dev>";
  const dashboardUrl = `${SITE_URL}/dashboard`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      subject: "Here's what's scheduled for you today",
      html: `
        <div style="font-family: -apple-system, Segoe UI, Arial, sans-serif; font-size: 15px; color: #1a1a1a; line-height: 1.6;">
          <p>Good morning, ${firstName} 👋</p>
          ${plannedSystem ? `<p>Today's system: <strong>${plannedSystem}</strong></p>` : ""}
          ${taskListHtml(tasks)}
          <p><a href="${dashboardUrl}">Open Master Grid →</a></p>
          <p>- Master Grid</p>
        </div>
      `,
    }),
  });
  return res.ok;
}

async function runReminders() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const today = easternDateStringNow();

  const { data: settingsRows, error: settingsError } = await supabase
    .from("student_planner_settings")
    .select("student_id, start_date")
    .lte("start_date", today);

  if (settingsError) {
    return { error: settingsError.message, checked: 0, remindersSent: 0, details: [] as any[] };
  }

  const assigned = settingsRows ?? [];
  const details: { email: string; sent: boolean; reason: string }[] = [];

  for (const row of assigned as { student_id: string; start_date: string }[]) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", row.student_id)
      .maybeSingle();
    if (!profile?.email) continue;

    const { data: entry } = await supabase
      .from("planner_entries")
      .select("field_values")
      .eq("user_id", row.student_id)
      .eq("log_date", today)
      .maybeSingle();
    const plannedSystemRaw = (entry?.field_values as Record<string, unknown> | undefined)?.["planned_system"];
    const plannedSystem = typeof plannedSystemRaw === "string" && plannedSystemRaw.trim() ? plannedSystemRaw : null;

    const { data: taskRows } = await supabase
      .from("mentor_plan_tasks")
      .select("title, detail, sort_order")
      .eq("student_id", row.student_id)
      .eq("task_date", today)
      .order("sort_order", { ascending: true });
    const tasks = (taskRows ?? []).map((t: any) => ({ title: t.title as string, detail: (t.detail as string) || null }));

    const firstName = (profile.full_name || "").trim().split(/\s+/)[0] || "there";
    const sent = await sendMorningEmail(profile.email, firstName, plannedSystem, tasks);
    details.push({ email: profile.email, sent, reason: sent ? "sent" : "send failed" });
  }

  return { today, checked: assigned.length, remindersSent: details.filter((d) => d.sent).length, details };
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
