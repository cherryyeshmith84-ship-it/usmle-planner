import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/onboarding", "/history", "/settings", "/admin"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  // getSession() reads/verifies the JWT locally from the cookie (only
  // hitting the network if the token actually needs refreshing), instead
  // of getUser()'s behavior of always making a live round trip to
  // Supabase's Auth server. Middleware runs on every single navigation
  // across the whole app, so that round trip was adding real, universal
  // latency everywhere. This is just the routing gate (should this
  // request even reach the page) - every page component still calls
  // getUser() itself afterward for the real, fully-verified check before
  // reading or writing any data, so nothing here becomes less secure.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => path.startsWith(p));

  if (isProtected && !session) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", path);
    const redirectResponse = NextResponse.redirect(redirectUrl);
    redirectResponse.headers.set("Cache-Control", "no-store");
    return redirectResponse;
  }

  // These pages show data for whichever account is currently logged in.
  // Without this, the browser (and its back/forward cache) can show a
  // snapshot from a previously logged-in account when switching accounts
  // in the same tab, making it look like two accounts' data got mixed up.
  if (isProtected) {
    response.headers.set("Cache-Control", "no-store");
  }

  return response;
}
