import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const explicitNext = searchParams.get("next");
  let next = explicitNext || "/onboarding";

  let exchangeFailed = !code;
  const supabase = createClient();
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) exchangeFailed = true;
  }

  if (exchangeFailed && next === "/reset-password") {
    return NextResponse.redirect(`${origin}/forgot-password?expired=1`);
  }

  if (!exchangeFailed && !explicitNext) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
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
