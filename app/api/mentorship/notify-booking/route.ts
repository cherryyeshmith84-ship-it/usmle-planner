import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { formatSlotDate, formatSlotTime } from "@/lib/mentors";
import { easternDateStringNow, nyWallTimeToUtcIso } from "@/lib/timezone";

export const dynamic = "force-dynamic";

// Runs once a day, scheduled for ~midnight Eastern (see vercel.json).
// Vercel Hobby cron jobs can only fire once per day and Vercel doesn't
// adjust cron schedules for Daylight Saving - "midnight ET" drifts by up to
// an hour for a few weeks twice a year around the March/November DST
// changeovers. Finds every booked mentor_slots row whose start_time falls
// on "today" in Eastern Time and emails the student a same-day reminder.
// reminder_sent_at makes this idempotent, so re-running it (e.g. a manual
// test hit) never double-emails anyone.

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${expected}`) return true;
  const querySecret = req.nextUrl.searchParams.get("secret");
  return querySecret === expected;
}

async function sendReminderEmail(
  to: string,
  studentFirstName: string,
  mentorName: string,
  dateLabel: string,
  timeLabel: string
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const from = process.env.REMINDER_FROM_EMAIL || "Master Grid <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: `Reminder: your mentorship session with ${mentorName} is today`,
      html: `
        <div style="font-family: -apple-system, Segoe UI, Arial, sans-serif; font-size: 15px; color: #1a1a1a; line-height: 1.6;">
          <p>Hi ${studentFirstName},</p>
          <p>Just a reminder - your mentorship session with <strong>${mentorName}</strong> is today:</p>
          <p style="font-size: 16px; margin: 16px 0;">
            📅 <strong>${dateLabel}</strong><br />
            🕐 <strong>${timeLabel}</strong>
          </p>
          <p>All times on Master Grid are Eastern Time (ET) - double check that against your own
            timezone if you're not on the US East Coast.</p>
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

  const todayEastern = easternDateStringNow();
  const [y, m, d] = todayEastern.split("-").map(Number);
  const tomorrowEastern = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  const startOfDayUtc = nyWallTimeToUtcIso(todayEastern, "00:00");
  const endOfDayUtc = nyWallTimeToUtcIso(tomorrowEastern, "00:00");

  const { data, error } = await supabase
    .from("mentor_slots")
    .select("*, mentors(name), booked_by_profile:booked_by(full_name, email)")
    .eq("is_booked", true)
    .is("reminder_sent_at", null)
    .gte("start_time", startOfDayUtc)
    .lt("start_time", endOfDayUtc);

  if (error) {
    return { error: error.message, checked: 0, remindersSent: 0, details: [] as any[] };
  }

  const slots = data ?? [];
  const details: { email: string; sent: boolean }[] = [];

  for (const slot of slots as any[]) {
    const studentEmail: string | undefined = slot.booked_by_profile?.email;
    if (!studentEmail) continue;

    const studentFirstName = (slot.booked_by_profile?.full_name || "").trim().split(/\s+/)[0] || "there";
    const mentorName = slot.mentors?.name || "your mentor";
    const dateLabel = formatSlotDate(slot.start_time);
    const timeLabel = `${formatSlotTime(slot.start_time)} - ${formatSlotTime(slot.end_time)}`;

    const sent = await sendReminderEmail(studentEmail, studentFirstName, mentorName, dateLabel, timeLabel);
    if (sent) {
      await supabase
        .from("mentor_slots")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", slot.id);
    }
    details.push({ email: studentEmail, sent });
  }

  return {
    todayEastern,
    checked: slots.length,
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
