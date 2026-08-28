import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

async function sendEmail(to: string, subject: string, html: string, text: string, apiKey: string, from: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html, text }),
  });
  return res.ok;
}

// Fired once, right when a brand-new STUDENT account finishes signing up
// (either clicking their email confirmation link, or completing Google
// OAuth for the first time) - both flows only ever get a session here, so
// this is the one place that reliably fires exactly once per real signup
// rather than on every subsequent login. Notifies every admin, both as an
// in-app notification (bell icon) and an email - same Resend setup already
// used for booking confirmations in app/api/mentorship/notify-booking, so
// it works today without any new configuration.
async function notifyAdminsOfNewStudent(newUserId: string, newUserEmail: string, fullName: string | null) {
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) return;
  const serviceClient = createServiceClient(serviceUrl, serviceKey);

  const { data: admins } = await serviceClient
    .from("profiles")
    .select("id, email, full_name")
    .eq("is_admin", true);
  const adminRows = (admins ?? []) as { id: string; email: string | null; full_name: string | null }[];
  if (adminRows.length === 0) return;

  const studentLabel = fullName || newUserEmail;

  await serviceClient.from("notifications").insert(
    adminRows
      .filter((a) => a.id !== newUserId)
      .map((a) => ({
        user_id: a.id,
        type: "new_signup",
        title: "New student signup",
        body: `${studentLabel} (${newUserEmail}) just joined Master Grid.`,
        link: "/admin",
      }))
  );

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const from = process.env.REMINDER_FROM_EMAIL || "Master Grid <onboarding@resend.dev>";

  await Promise.all(
    adminRows
      .filter((a) => a.email)
      .map((a) =>
        sendEmail(
          a.email as string,
          "New student signup on Master Grid",
          `
            <div style="font-family: -apple-system, Segoe UI, Arial, sans-serif; font-size: 15px; color: #1a1a1a; line-height: 1.6;">
              <p>A new student just signed up:</p>
              <p style="font-size: 16px; margin: 16px 0;">
                <strong>${studentLabel}</strong><br />
                ${newUserEmail}
              </p>
              <p>- Master Grid</p>
            </div>
          `,
          `A new student just signed up:\n${studentLabel}\n${newUserEmail}\n\n- Master Grid`,
          apiKey,
          from
        )
      )
  );
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Signup confirmation links (and a first-time Google sign-in) land here
  // with no explicit "next" and default to onboarding. Password-reset links
  // pass next=/reset-password so the user lands on the "set a new password"
  // screen instead.
  const explicitNext = searchParams.get("next");
  let next = explicitNext || "/onboarding";

  // "student" or "mentor" - which portal (app/login+/signup vs
  // app/mentor/login+/mentor/signup) this login/signup started from. Set on
  // every Google button and every emailRedirectTo across all four pages.
  // Password login/signup can check the mentors table client-side the
  // moment a session exists, but Google OAuth and email-confirmation links
  // only ever get a session HERE, so this is the one place that can enforce
  // the split for those two flows - bouncing a mentor who signed in through
  // the student portal (or a student who signed in through the mentor
  // portal) back out to the correct one instead of ever letting them in.
  const portal = searchParams.get("portal");

  // A reset-password link's code is one-time-use and expires after a
  // while. If it's missing, already used, or expired, exchangeCodeForSession
  // fails and no session gets created - previously we redirected to
  // /reset-password anyway, which then failed with a raw "Auth session
  // missing!" error the moment the student tried to save a new password.
  // Now we catch that here and send them back to request a fresh link
  // instead, with a clear reason instead of a confusing error later.
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

    // Portal enforcement - a mentor is defined purely by an active row in
    // the mentors table matching this email (same check used everywhere
    // else, see lib/mentors.ts findMentorByEmail). Wrong-portal accounts
    // get signed straight back out before they ever see a real page.
    //
    // Admins are exempt from the "student portal, but this email is a
    // mentor" block - there's no separate admin portal, so /login (and its
    // Google button) is still the right door for an admin even if their
    // email is ALSO registered as a mentor. Not exempt from the reverse
    // (mentor portal requires an actual mentor row) since admin status
    // alone shouldn't grant the mentor dashboard.
    if (user?.email && portal) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();
      const isAdmin = !!profile?.is_admin;

      const { data: mentorRow } = await supabase
        .from("mentors")
        .select("id")
        .ilike("email", user.email)
        .eq("active", true)
        .maybeSingle();
      const isMentor = !!mentorRow;

      if (portal === "student" && isMentor && !isAdmin) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=mentor_account`);
      }
      if (portal === "mentor" && !isMentor) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/mentor/login?error=not_mentor`);
      }

      // Admin notification - only for a genuine student signup that just
      // happened (account created in the last few minutes), not every time
      // this same student logs back in via Google down the road.
      if (portal === "student" && !isMentor) {
        const createdMs = user.created_at ? new Date(user.created_at).getTime() : 0;
        const isFreshSignup = createdMs > 0 && Date.now() - createdMs < 5 * 60 * 1000;
        if (isFreshSignup) {
          const fullName = (user.user_metadata?.full_name as string | undefined) ?? null;
          await notifyAdminsOfNewStudent(user.id, user.email ?? "", fullName).catch(() => {});
        }
      }
    }

    // Google sign-in (both first-time and returning) comes through here with
    // no explicit "next", same as an email-confirmation link - without this
    // check, a returning Google user who already finished onboarding would
    // get bounced back to the onboarding form on every single login instead
    // of going straight to their dashboard like an email/password login does.
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
