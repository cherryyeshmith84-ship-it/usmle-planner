import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { isExistingStudentOf } from "@/lib/mentors";

export const dynamic = "force-dynamic";

/**
 * Fired by MentorAvailabilityClient.tsx right after a mentor_slots insert
 * succeeds. Who gets notified depends on the slot's audience - the exact
 * same rule slotVisibleToStudent()/lib/mentors.ts already uses to decide
 * who can even SEE a slot on a mentor's profile page:
 *   - "existing": only students who've linked this mentor's email under
 *     their own Settings (profiles.mentor_email).
 *   - "new": only students who haven't linked ANY mentor yet - the actual
 *     pool of prospective students.
 *   - null/omitted (open to everyone): both groups.
 * Other mentors and admins are never notified about a mentor's slot.
 */
export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { mentorId?: string; audience?: "existing" | "new" | null; dateLabel?: string; timeLabel?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { mentorId, audience, dateLabel, timeLabel } = body;
  if (!mentorId) {
    return NextResponse.json({ error: "Missing mentorId." }, { status: 400 });
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

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const isMentorCaller = (user.email || "").trim().toLowerCase() === mentor.email.trim().toLowerCase();
  const isAdminCaller = !!(callerProfile as { is_admin?: boolean } | null)?.is_admin;
  if (!isMentorCaller && !isAdminCaller) {
    return NextResponse.json({ error: "Not this mentor." }, { status: 403 });
  }

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return NextResponse.json({ notified: 0, reason: "Service role not configured." });
  }
  const serviceClient = createServiceClient(serviceUrl, serviceKey);

  // Every other active mentor's email, so they're never counted as a
  // notification recipient for a colleague's new slot.
  const { data: mentorRows } = await serviceClient.from("mentors").select("email").eq("active", true);
  const mentorEmails = new Set((mentorRows ?? []).map((m: any) => (m.email || "").trim().toLowerCase()));

  const { data: profileRows } = await serviceClient
    .from("profiles")
    .select("id, email, mentor_email, is_admin, onboarding_completed");
  const candidates = (profileRows ?? []) as {
    id: string;
    email: string | null;
    mentor_email: string | null;
    is_admin: boolean | null;
    onboarding_completed: boolean | null;
  }[];

  const recipients = candidates.filter((p) => {
    if (p.id === user.id) return false;
    if (p.is_admin) return false;
    if (!p.onboarding_completed) return false;
    if (p.email && mentorEmails.has(p.email.trim().toLowerCase())) return false;
    if (audience === "existing") return isExistingStudentOf(p.mentor_email, mentor.email);
    if (audience === "new") return !p.mentor_email;
    return true; // audience null/"" - open to everyone
  });

  if (recipients.length === 0) {
    return NextResponse.json({ notified: 0 });
  }

  const when = [dateLabel, timeLabel].filter(Boolean).join(", ");
  const audienceNote =
    audience === "existing" ? " (for existing students)" : audience === "new" ? " (for new students)" : "";

  const rows = recipients.map((p) => ({
    user_id: p.id,
    type: "availability",
    title: `${mentor.name} added new availability`,
    body: (when + audienceNote).trim() || null,
    link: `/mentorship/mentor/${mentorId}`,
  }));

  const { error: insertError } = await serviceClient.from("notifications").insert(rows);
  if (insertError) {
    return NextResponse.json({ notified: 0, reason: insertError.message });
  }
  return NextResponse.json({ notified: rows.length });
}
