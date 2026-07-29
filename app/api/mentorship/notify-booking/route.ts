import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Fired by MentorBrowseClient.tsx right after a student successfully books
 * a mentor_slots row. Sends the mentor an email so they don't have to keep
 * checking /mentorship to notice a new booking. Reuses the same Resend
 * setup (RESEND_API_KEY / REMINDER_FROM_EMAIL) already configured for the
 * daily plan-reminder cron in app/api/cron/plan-reminders/route.ts.
 *
 * The client sends dateLabel/timeLabel already formatted (via
 * formatSlotDate/formatSlotTime in lib/mentors.ts) instead of us
 * reformatting the raw timestamps here - this route runs on the server
 * (UTC), and reformatting there could show the mentor a different time
 * than what the student actually saw and booked in their own browser.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { slotId?: string; dateLabel?: string; timeLabel?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { slotId, dateLabel, timeLabel } = body;
  if (!slotId || !dateLabel || !timeLabel) {
    return NextResponse.json({ error: "Missing slotId/dateLabel/timeLabel." }, { status: 400 });
  }

  // Load the slot + its mentor. Only send if this really is a booked slot
  // and the caller is the student who booked it - stops anyone from
  // spamming a mentor's inbox by hitting this route with a random slotId.
  const { data: slot } = await supabase
    .from("mentor_slots")
    .select("*, mentors(name, email)")
    .eq("id", slotId)
    .maybeSingle();

  if (!slot || !slot.is_booked || slot.booked_by !== user.id) {
    return NextResponse.json({ error: "Slot not found or not booked by you." }, { status: 404 });
  }

  const mentor = (slot as any).mentors as { name: string; email: string } | null;
  if (!mentor?.email) {
    return NextResponse.json({ error: "This mentor has no email on file." }, { status: 400 });
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const studentName = profileData?.full_name || user.email || "A student";
  const studentNote: string | null = (slot as any).student_note || null;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Booking itself already succeeded - not having email configured yet
    // shouldn't be treated as a failure for the student, just skip silently.
    return NextResponse.json({ sent: false, reason: "RESEND_API_KEY not configured." });
  }

  const from = process.env.REMINDER_FROM_EMAIL || "Master Grid <onboarding@resend.dev>";
  const mentorFirstName = (mentor.name || "").trim().split(/\s+/)[0] || "there";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: mentor.email,
        subject: `New mentorship booking - ${dateLabel}`,
        html: `
          <div style="font-family: -apple-system, Segoe UI, Arial, sans-serif; font-size: 15px; color: #1a1a1a; line-height: 1.6;">
            <p>Hi ${mentorFirstName},</p>
            <p><strong>${studentName}</strong> just booked one of your open mentorship slots:</p>
            <p style="font-size: 16px; margin: 16px 0;">
              📅 <strong>${dateLabel}</strong><br />
              🕐 <strong>${timeLabel}</strong>
            </p>
            ${
              studentNote
                ? `<p>They left this note about what they'd like to discuss:</p>
                   <p style="padding: 12px 16px; background: #f4f4f5; border-radius: 8px; font-style: italic;">
                     "${studentNote}"
                   </p>`
                : ""
            }
            <p>You can review or manage your availability any time from the Mentorship page on Master Grid.</p>
            <p>- Master Grid</p>
          </div>
        `,
      }),
    });
    return NextResponse.json({ sent: res.ok });
  } catch (e: any) {
    return NextResponse.json({ sent: false, reason: e.message || "Unexpected error." });
  }
}
