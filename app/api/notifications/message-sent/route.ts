import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import webpush from "web-push";

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
 * Beyond the in-app notification row, this now also emails the recipient
 * (same Resend setup as notify-booking) and pushes a browser notification
 * to every device they've enabled via EnablePushNotifications.tsx - so a
 * mentor gets pinged on their phone without needing the site open.
 */
async function sendEmail(to: string, subject: string, html: string, apiKey: string, from: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  return res.ok;
}

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
  let recipientEmail: string | null = null;
  let senderName = "Someone";

  if (isStudentCaller) {
    const { data: mentorProfile } = await serviceClient
      .from("profiles")
      .select("id, email")
      .ilike("email", mentor.email)
      .maybeSingle();
    const mp = mentorProfile as { id: string; email: string | null } | null;
    recipientId = mp?.id ?? null;
    recipientEmail = mp?.email ?? mentor.email;

    const { data: studentProfile } = await serviceClient
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    senderName = (studentProfile as { full_name: string | null } | null)?.full_name || "A student";
  } else {
    recipientId = studentId;
    senderName = mentor.name;

    const { data: studentProfile } = await serviceClient
      .from("profiles")
      .select("email")
      .eq("id", studentId)
      .maybeSingle();
    recipientEmail = (studentProfile as { email: string | null } | null)?.email ?? null;
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

  let emailSent = false;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REMINDER_FROM_EMAIL || "Master Grid <onboarding@resend.dev>";
  if (apiKey && recipientEmail) {
    const firstName = senderName.trim().split(/\s+/)[0] || "there";
    try {
      emailSent = await sendEmail(
        recipientEmail,
        `New message from ${senderName}`,
        `<div style="font-family: -apple-system, Segoe UI, Arial, sans-serif; font-size: 15px; color: #1a1a1a; line-height: 1.6;"><p>Hi,</p><p><strong>${senderName}</strong> just sent you a message on Master Grid:</p><p style="padding: 12px 16px; background: #f4f4f5; border-radius: 8px; font-style: italic;">${trimmedPreview || "(open Master Grid to read it)"}</p><p>Reply any time from the Mentorship page on Master Grid.</p><p>- Master Grid</p></div>`,
        apiKey,
        from
      );
    } catch {
      emailSent = false;
    }
  }

  let pushSent = 0;
  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || "mailto:mastergridsupport@gmail.com";
  if (vapidPublic && vapidPrivate) {
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    const { data: subs } = await serviceClient
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", recipientId);
    const subscriptions = (subs || []) as { id: string; endpoint: string; p256dh: string; auth: string }[];
    const payload = JSON.stringify({
      title: `New message from ${senderName}`,
      body: trimmedPreview || "Open Master Grid to read it.",
      link,
    });
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        pushSent++;
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await serviceClient.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }
  }

  return NextResponse.json({ notified: true, emailSent, pushSent });
}
