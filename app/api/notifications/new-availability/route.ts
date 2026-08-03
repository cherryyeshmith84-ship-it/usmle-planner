import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * Fired by MentorChatPanel.tsx right after a mentor_messages insert
 * succeeds - in BOTH directions, since it's the same component and the
 * same send() function whether a student or a mentor is sending. Who the
 * recipient actually is comes entirely from the caller's own session (via
 * the SSR client below), never from the request body - a client claiming
 * "I'm the mentor" or "I'm the student" in the payload can't be trusted,
 * since that would let anyone insert a notification for anyone else.
 *
 * Inserting the notification row itself needs the service-role client
 * (see lib below) because the recipient is a DIFFERENT user than whoever's
 * making this request - notifications' RLS only allows a user to read/mark
 * their own rows (see add_notifications_table migration), same as every
 * other cross-user write in this app (booking emails, etc.).
 */
export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { mentorId?: string; studentId?: string; preview?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { mentorId, studentId, preview } = body;
  if (!mentorId || !studentId) {
    return NextResponse.json({ error: "Missing mentorId/studentId." }, { status: 400 });
  }

  const { data: mentorData } = await supabase
    .from("mentors")
    .select("id, name, email")
    .eq("id", mentorId)
    .maybeSingle();
  if (!mentorData) {
    return NextResponse.json({ error: "Mentor not found." }, { status: 404 });
  }
  const mentor = mentorData as { id: string; name: string; email: string };

  const isMentorCaller = (user.email || "").trim().toLowerCase() === mentor.email.trim().toLowerCase();
  const isStudentCaller = user.id === studentId;
  if (!isMentorCaller && !isStudentCaller) {
    return NextResponse.json({ error: "Not a participant in this thread." }, { status: 403 });
  }

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return NextResponse.json({ notified: false, reason: "Service role not configured." });
  }
  const serviceClient = createServiceClient(serviceUrl, serviceKey);

  let recipientId: string | null = null;
  let senderName = "Someone";

  if (isStudentCaller) {
    // Recipient is the mentor's own login account. Mentors don't have a
    // direct user_id column on the mentors table - every other place in
    // this app that needs "is the logged-in user this mentor" resolves it
    // by matching auth email to mentors.email (see findMentorByEmail in
    // lib/mentors.ts), so this does the reverse of that same match.
    const { data: mentorProfile } = await serviceClient
      .from("profiles")
      .select("id")
      .ilike("email", mentor.email)
      .maybeSingle();
    recipientId = (mentorProfile as { id: string } | null)?.id ?? null;

    const { data: studentProfile } = await serviceClient
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    senderName = (studentProfile as { full_name: string | null } | null)?.full_name || "A student";
  } else {
    recipientId = studentId;
    senderName = mentor.name;
  }

  if (!recipientId || recipientId === user.id) {
    return NextResponse.json({ notified: false, reason: "No valid recipient." });
  }

  const link = isStudentCaller ? `/mentorship/availability?student=${studentId}` : `/mentorship/mentor/${mentorId}`;
  const trimmedPreview = (preview || "").trim().slice(0, 140);

  const { error: insertError } = await serviceClient.from("notifications").insert({
    user_id: recipientId,
    type: "message",
    title: `New message from ${senderName}`,
    body: trimmedPreview || null,
    link,
  });

  if (insertError) {
    return NextResponse.json({ notified: false, reason: insertError.message });
  }
  return NextResponse.json({ notified: true });
}
