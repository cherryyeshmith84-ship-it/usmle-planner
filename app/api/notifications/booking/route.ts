import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * Fired by MentorProfileClient.tsx's book() right after a successful
 * mentor_slots booking - the in-app-notification counterpart to
 * /api/mentorship/notify-booking (which only ever handled email, and even
 * that only reaches cherryyeshmith84@gmail.com right now since the Resend
 * account is still on the sandbox onboarding@resend.dev domain). Notifies
 * BOTH sides: the mentor that a slot was taken, and the student with a
 * confirmation they can still find under the bell icon after the inline
 * "Booked!" message on the page disappears.
 *
 * Same trust model as every other route here: only the caller's own session
 * decides who the student is, the mentor is resolved from the slot itself
 * (not trusted from the request body), and the actual cross-user insert
 * goes through the service-role client since notifications' RLS only lets a
 * user read/mark their own rows.
 */
export async function POST(req: NextRequest) {
  const supabase = createServerClient();
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

  // Only notify for a slot that's really booked, by the person calling this
  // - same guard the email route (notify-booking) already uses.
  const { data: slot } = await supabase
    .from("mentor_slots")
    .select("*, mentors(id, name, email)")
    .eq("id", slotId)
    .maybeSingle();

  if (!slot || !slot.is_booked || slot.booked_by !== user.id) {
    return NextResponse.json({ error: "Slot not found or not booked by you." }, { status: 404 });
  }

  const mentor = (slot as any).mentors as { id: string; name: string; email: string } | null;
  if (!mentor) {
    return NextResponse.json({ notified: false, reason: "Mentor not found." });
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const studentName = (profileData as { full_name: string | null } | null)?.full_name || user.email || "A student";

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return NextResponse.json({ notified: false, reason: "Service role not configured." });
  }
  const serviceClient = createServiceClient(serviceUrl, serviceKey);

  // Mentor's own login account - mentors don't have a direct user_id
  // column, so this is the same email-match lookup every other route here
  // uses (see message-sent/new-availability/relationship-update).
  const { data: mentorProfile } = await serviceClient
    .from("profiles")
    .select("id")
    .ilike("email", mentor.email)
    .maybeSingle();
  const mentorUserId = (mentorProfile as { id: string } | null)?.id ?? null;

  const rows: { user_id: string; type: string; title: string; body: string | null; link: string }[] = [];

  if (mentorUserId && mentorUserId !== user.id) {
    rows.push({
      user_id: mentorUserId,
      type: "booking",
      title: `New booking from ${studentName}`,
      body: `${dateLabel}, ${timeLabel}`,
      link: `/mentorship/availability?student=${user.id}`,
    });
  }

  // Student's own confirmation too - not just the mentor's - since the
  // inline "Booked!" banner on the profile page is gone the moment they
  // navigate away, and the user asked for both sides to be notified.
  rows.push({
    user_id: user.id,
    type: "booking",
    title: `You're booked with ${mentor.name}`,
    body: `${dateLabel}, ${timeLabel}`,
    link: `/mentorship/mentor/${mentor.id}`,
  });

  const { error: insertError } = await serviceClient.from("notifications").insert(rows);
  if (insertError) {
    return NextResponse.json({ notified: false, reason: insertError.message });
  }
  return NextResponse.json({ notified: true });
}
