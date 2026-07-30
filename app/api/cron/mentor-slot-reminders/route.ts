import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { formatSlotDate, formatSlotTime } from "@/lib/mentors";
import { easternDateStringNow, nyWallTimeToUtcIso } from "@/lib/timezone";

export const dynamic = "force-dynamic";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://master-grid.vercel.app";

// Runs once a day, scheduled for ~midnight Eastern (see vercel.json).
// Vercel Hobby cron jobs can only fire once per day (and only 2 cron jobs
// total on the account) and Vercel doesn't adjust cron schedules for
// Daylight Saving - "midnight ET" drifts by up to an hour for a few weeks
// twice a year around the March/November DST changeovers. Rather than add a
// second/third cron job for each new notification type (which Hobby
// wouldn't allow anyway), this single daily run does three passes:
//   1. Same-day reminder - unchanged from before (reminder_sent_at).
//   2. 24h-ahead reminder - sessions happening "tomorrow" ET (reminder_24h_sent_at).
//   3. Session-completed notice - sessions that ended "yesterday" ET, prompting
//      the student to leave feedback and the mentor to add notes (completion_notified_at).
// Each pass has its own *_sent_at / *_notified_at column, so re-running this
// (e.g. a manual test hit) never double-emails anyone for any of the three.

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

async function send24hReminderEmail(
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
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      subject: `Reminder: your mentorship session with ${mentorName} is tomorrow`,
      html: `
        <div style="font-family: -apple-system, Segoe UI, Arial, sans-serif; font-size: 15px; color: #1a1a1a; line-height: 1.6;">
          <p>Hi ${studentFirstName},</p>
          <p>Heads up - your mentorship session with <strong>${mentorName}</strong> is tomorrow:</p>
          <p style="font-size: 16px; margin: 16px 0;">
            📅 <strong>${dateLabel}</strong><br />
            🕐 <strong>${timeLabel}</strong>
          </p>
          <p>All times on Master Grid are Eastern Time (ET) - double check that against your own
            timezone if you're not on the US East Coast. You'll get another reminder the day of.</p>
          <p>- Master Grid</p>
        </div>
      `,
    }),
  });
  return res.ok;
}

async function sendCompletionEmail(to: string, subject: string, bodyHtml: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const from = process.env.REMINDER_FROM_EMAIL || "Master Grid <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      subject,
      html: `<div style="font-family: -apple-system, Segoe UI, Arial, sans-serif; font-size: 15px; color: #1a1a1a; line-height: 1.6;">${bodyHtml}</div>`,
    }),
  });
  return res.ok;
}

/** Eastern-time date string N days after the given "YYYY-MM-DD" string. */
function easternDateStringOffset(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

async function runSameDayReminders(supabase: ReturnType<typeof createClient>, todayEastern: string) {
  const tomorrowEastern = easternDateStringOffset(todayEastern, 1);
  const startOfDayUtc = nyWallTimeToUtcIso(todayEastern, "00:00");
  const endOfDayUtc = nyWallTimeToUtcIso(tomorrowEastern, "00:00");

  const { data, error } = await supabase
    .from("mentor_slots")
    .select("*, mentors(name), booked_by_profile:booked_by(full_name, email)")
    .eq("is_booked", true)
    .is("reminder_sent_at", null)
    // Skip cancelled sessions - without this, a student who cancelled a
    // same-day session would still get a "your session is today" reminder
    // for something that no longer exists.
    .is("cancelled_at", null)
    .gte("start_time", startOfDayUtc)
    .lt("start_time", endOfDayUtc);

  if (error) return { error: error.message, checked: 0, sent: 0 };

  const slots = data ?? [];
  let sentCount = 0;
  for (const slot of slots as any[]) {
    const studentEmail: string | undefined = slot.booked_by_profile?.email;
    if (!studentEmail) continue;
    const studentFirstName = (slot.booked_by_profile?.full_name || "").trim().split(/\s+/)[0] || "there";
    const mentorName = slot.mentors?.name || "your mentor";
    const dateLabel = formatSlotDate(slot.start_time);
    const timeLabel = `${formatSlotTime(slot.start_time)} - ${formatSlotTime(slot.end_time)}`;
    const sent = await sendReminderEmail(studentEmail, studentFirstName, mentorName, dateLabel, timeLabel);
    if (sent) {
      await supabase.from("mentor_slots").update({ reminder_sent_at: new Date().toISOString() }).eq("id", slot.id);
      sentCount++;
    }
  }
  return { checked: slots.length, sent: sentCount };
}

async function run24hReminders(supabase: ReturnType<typeof createClient>, todayEastern: string) {
  const tomorrowEastern = easternDateStringOffset(todayEastern, 1);
  const dayAfterEastern = easternDateStringOffset(todayEastern, 2);
  const startUtc = nyWallTimeToUtcIso(tomorrowEastern, "00:00");
  const endUtc = nyWallTimeToUtcIso(dayAfterEastern, "00:00");

  const { data, error } = await supabase
    .from("mentor_slots")
    .select("*, mentors(name), booked_by_profile:booked_by(full_name, email)")
    .eq("is_booked", true)
    .is("reminder_24h_sent_at", null)
    .is("cancelled_at", null)
    .gte("start_time", startUtc)
    .lt("start_time", endUtc);

  if (error) return { error: error.message, checked: 0, sent: 0 };

  const slots = data ?? [];
  let sentCount = 0;
  for (const slot of slots as any[]) {
    const studentEmail: string | undefined = slot.booked_by_profile?.email;
    if (!studentEmail) continue;
    const studentFirstName = (slot.booked_by_profile?.full_name || "").trim().split(/\s+/)[0] || "there";
    const mentorName = slot.mentors?.name || "your mentor";
    const dateLabel = formatSlotDate(slot.start_time);
    const timeLabel = `${formatSlotTime(slot.start_time)} - ${formatSlotTime(slot.end_time)}`;
    const sent = await send24hReminderEmail(studentEmail, studentFirstName, mentorName, dateLabel, timeLabel);
    if (sent) {
      await supabase.from("mentor_slots").update({ reminder_24h_sent_at: new Date().toISOString() }).eq("id", slot.id);
      sentCount++;
    }
  }
  return { checked: slots.length, sent: sentCount };
}

/** Sessions that ended "yesterday" ET - prompts the student to leave
 *  feedback and the mentor to add session notes, both linking back to the
 *  sessions page where those forms live. */
async function runCompletionNotices(supabase: ReturnType<typeof createClient>, todayEastern: string) {
  const yesterdayEastern = easternDateStringOffset(todayEastern, -1);
  const startUtc = nyWallTimeToUtcIso(yesterdayEastern, "00:00");
  const endUtc = nyWallTimeToUtcIso(todayEastern, "00:00");

  const { data, error } = await supabase
    .from("mentor_slots")
    .select("*, mentors(name, email), booked_by_profile:booked_by(full_name, email)")
    .eq("is_booked", true)
    .is("completion_notified_at", null)
    .is("cancelled_at", null)
    .gte("end_time", startUtc)
    .lt("end_time", endUtc);

  if (error) return { error: error.message, checked: 0, sent: 0 };

  const slots = data ?? [];
  let sentCount = 0;
  for (const slot of slots as any[]) {
    const studentEmail: string | undefined = slot.booked_by_profile?.email;
    const mentorEmail: string | undefined = slot.mentors?.email;
    const studentFirstName = (slot.booked_by_profile?.full_name || "").trim().split(/\s+/)[0] || "there";
    const mentorFirstName = (slot.mentors?.name || "").trim().split(/\s+/)[0] || "there";
    const mentorName = slot.mentors?.name || "your mentor";
    const sessionsUrl = `${SITE_URL}/mentorship/sessions`;

    let anySent = false;
    if (studentEmail) {
      const ok = await sendCompletionEmail(
        studentEmail,
        `How was your session with ${mentorName}?`,
        `
          <p>Hi ${studentFirstName},</p>
          <p>Your mentorship session with <strong>${mentorName}</strong> has wrapped up. Got a minute to
            rate it and leave a quick note? It helps other students pick the right mentor.</p>
          <p><a href="${sessionsUrl}">Leave feedback →</a></p>
          <p>- Master Grid</p>
        `
      );
      if (ok) anySent = true;
    }
    if (mentorEmail) {
      const ok = await sendCompletionEmail(
        mentorEmail,
        `Add notes for your last session`,
        `
          <p>Hi ${mentorFirstName},</p>
          <p>Your session with a student has wrapped up. Adding a quick note on what you discussed and
            what to focus on next time helps them (and you) pick up right where you left off.</p>
          <p><a href="${sessionsUrl}">Add session notes →</a></p>
          <p>- Master Grid</p>
        `
      );
      if (ok) anySent = true;
    }
    if (anySent) {
      await supabase
        .from("mentor_slots")
        .update({ completion_notified_at: new Date().toISOString() })
        .eq("id", slot.id);
      sentCount++;
    }
  }
  return { checked: slots.length, sent: sentCount };
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const todayEastern = easternDateStringNow();

  const [sameDay, in24h, completed] = await Promise.all([
    runSameDayReminders(supabase, todayEastern),
    run24hReminders(supabase, todayEastern),
    runCompletionNotices(supabase, todayEastern),
  ]);

  return NextResponse.json({ todayEastern, sameDay, in24h, completed });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
