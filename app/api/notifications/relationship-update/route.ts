import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: {
    mentorId?: string;
    studentId?: string;
    type?: string;
    title?: string;
    detail?: string;
    link?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { mentorId, studentId, type, title, detail, link } = body;
  if (!mentorId || !studentId || !type || !title) {
    return NextResponse.json({ error: "Missing mentorId/studentId/type/title." }, { status: 400 });
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
    return NextResponse.json({ error: "Not a participant in this relationship." }, { status: 403 });
  }

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return NextResponse.json({ notified: false, reason: "Service role not configured." });
  }
  const serviceClient = createServiceClient(serviceUrl, serviceKey);

  let recipientId: string | null = null;

  if (isStudentCaller) {
    const { data: mentorProfile } = await serviceClient
      .from("profiles")
      .select("id")
      .ilike("email", mentor.email)
      .maybeSingle();
    recipientId = (mentorProfile as { id: string } | null)?.id ?? null;
  } else {
    recipientId = studentId;
  }

  if (!recipientId || recipientId === user.id) {
    return NextResponse.json({ notified: false, reason: "No valid recipient." });
  }

  const { error: insertError } = await serviceClient.from("notifications").insert({
    user_id: recipientId,
    type,
    title,
    body: (detail || "").trim().slice(0, 140) || null,
    link: link || null,
  });

  if (insertError) {
    return NextResponse.json({ notified: false, reason: insertError.message });
  }
  return NextResponse.json({ notified: true });
}
