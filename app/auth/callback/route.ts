import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Signup confirmation links land here with no "next" and should go to
  // onboarding as before. Password-reset links pass next=/reset-password
  // so the user lands on the "set a new password" screen instead.
  const next = searchParams.get("next") || "/onboarding";

  // A reset-password link's code is one-time-use and expires after a
  // while. If it's missing, already used, or expired, exchangeCodeForSession
  // fails and no session gets created - previously we redirected to
  // /reset-password anyway, which then failed with a raw "Auth session
  // missing!" error the moment the student tried to save a new password.
  // Now we catch that here and send them back to request a fresh link
  // instead, with a clear reason instead of a confusing error later.
  let exchangeFailed = !code;
  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) exchangeFailed = true;
  }

  if (exchangeFailed && next === "/reset-password") {
    return NextResponse.redirect(`${origin}/forgot-password?expired=1`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
