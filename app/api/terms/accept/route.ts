import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TERMS_VERSION, TERMS_ACCEPT_STATEMENT } from "@/lib/terms";

export const dynamic = "force-dynamic";

// Records that the signed-in student ticked "I have read and accept" for the
// current TERMS_VERSION. One row per (user, version) - repeat calls are
// ignored, so the original acceptance timestamp is never overwritten.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  const fwd = request.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0].trim() : request.headers.get("x-real-ip");
  const userAgent = request.headers.get("user-agent");

  const { error } = await supabase.from("terms_acceptances").upsert(
    {
      user_id: user.id,
      full_name: profile?.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? null,
      email: user.email ?? profile?.email ?? null,
      terms_version: TERMS_VERSION,
      ip_address: ip,
      user_agent: userAgent,
      statement: TERMS_ACCEPT_STATEMENT,
    },
    { onConflict: "user_id,terms_version", ignoreDuplicates: true }
  );

  if (error) return NextResponse.json({ error: "Could not save your acceptance. Please try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
