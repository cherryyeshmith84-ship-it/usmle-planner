import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { easternDateStringNow } from "@/lib/timezone";

export const dynamic = "force-dynamic";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://master-grid.vercel.app";

// Nightly reminder (~9:30 PM ET, see the GitHub Actions workflow that
// triggers this - NOT vercel.json). Vercel's own Cron Jobs are capped at 2
// per account on the Hobby plan, and both slots are already used by
// plan-reminders and mentor-slot-reminders, so this and the morning
// reminder are triggered by a scheduled GitHub Actions workflow hitting
// this route over HTTP instead - same idea as a Vercel cron, just
// triggered from outside Vercel so it doesn't count against that limit.
//
// Only students a mentor has actually assigned a planner to (a row in
// student_planner_settings) get reminded, and only if they haven't
// logged anything for today yet - so a student who already updated their
// planner or logged a UWorld block today doesn't get nagged.

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${expected}`) return true;
  const querySecret = req.nextUrl.searchParams.get("secret");
  return querySecret === expected;
}

function hasContent(fieldValues: Record<string, unknown> | null | undefined): boolean {
  if (!fieldValues) return false;
  return Object.values(fieldValues).some((v) => v !== null && v !== undefined && v !== "");
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
      subject: "Update today's planner before you close out",
      html: `
        <div style="font-family: -apple-system, Segoe UI, Arial, sans-serif; font-size: 15px; color: #1a1a1a; line-height: 1.6;">
          <p>Hi ${firstName},</p>
          <p>Looks like today's row on your Master Grid planner is still empty. Take a minute
            before you wrap up to log what you got through today - even a quick note helps.</p>
          <p><a href="${plannerUrl}">Open your planner →</a></p>
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

    const { count: blockCount } = await supabase
      .from("uworld_blocks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", row.student_id)
      .eq("log_date", today);

    if (hasContent(entry?.field_values as Record<string, unknown> | undefined) || (blockCount ?? 0) > 0) {
      continue; // already logged something today - no need to nag
    }

    const firstName = (profile.full_name || "").trim().split(/\s+/)[0] || "there";
    const sent = await sendReminderEmail(profile.email, firstName);
    details.push({ email: profile.email, sent, reason: sent ? "reminded" : "send failed" });
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
