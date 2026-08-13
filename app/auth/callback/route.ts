import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const explicitNext = searchParams.get("next");
  let next = explicitNext || "/onboarding";
  const portal = searchParams.get("portal");

  let exchangeFailed = !code;
  const supabase = createClient();
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) exchangeFailed = true;
  }

  if (exchangeFailed && next === "/reset-password") {
    return NextResponse.redirect(`${origin}/forgot-password?expired=1`);
  }

  if (!exchangeFailed) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.email && portal) {
      const { data: mentorRow } = await supabase
        .from("mentors")
        .select("id")
        .ilike("email", user.email)
        .eq("active", true)
        .maybeSingle();
      const isMentor = !!mentorRow;

      if (portal === "student" && isMentor) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=mentor_account`);
      }
      if (portal === "mentor" && !isMentor) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/mentor/login?error=not_mentor`);
      }
    }

    if (user && !explicitNext) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.onboarding_completed) next = "/dashboard";
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
