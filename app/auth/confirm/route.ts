import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Browser-independent email links (password reset, signup confirmation,
 * magic link). The emailed link carries a one-time token_hash that is
 * verified here directly with verifyOtp - unlike the PKCE "code" flow in
 * /auth/callback, it does NOT need a cookie from the browser that
 * requested the email, so it works when the link is opened from Gmail's
 * in-app browser, another device, or another browser.
 *
 * Used by the Supabase email templates:
 *   /auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const rawNext = searchParams.get("next") || "/";
  // Only allow same-site relative paths.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (tokenHash && type) {
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  if (type === "recovery" || next === "/reset-password") {
    return NextResponse.redirect(`${origin}/forgot-password?expired=1`);
  }
  return NextResponse.redirect(`${origin}/login?error=link_expired`);
}
