import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Only the actual gated pages need this check (must match
  // PROTECTED_PREFIXES in lib/supabase/middleware.ts). The old catch-all
  // pattern ran this on EVERY request site-wide - every public page, every
  // /api/* call, every client-side fetch - each one making its own round
  // trip to Supabase just to find out "not protected, do nothing." That's
  // almost certainly why the "Routing Middleware has timed out" 504s kept
  // happening: Vercel's Edge Middleware has a hard, non-configurable time
  // limit (unlike serverless functions, vercel.json's maxDuration doesn't
  // apply here), and each one of those extra unnecessary Supabase round
  // trips was one more chance to catch a network blip and hit it. Scoping
  // the matcher down to only the pages that actually need the check removes
  // that risk everywhere else, and login/signup/api/etc. now load faster
  // too since they skip this Supabase call entirely.
  matcher: ["/dashboard/:path*", "/onboarding/:path*", "/history/:path*", "/settings/:path*", "/admin/:path*"],
};
