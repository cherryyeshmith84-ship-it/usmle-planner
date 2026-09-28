"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Silently keeps profiles.timezone in sync with whatever IANA timezone the
 * signed-in person's own browser reports (Intl.DateTimeFormat().resolvedOptions().timeZone)
 * - no onboarding step, no Settings field, nothing for anyone to fill in.
 * Mounted once, globally, in AppShell.tsx, so it runs on every page load for
 * every signed-in role (student, mentor, admin) without needing to be wired
 * into each page individually.
 *
 * This is what lets the 9pm planner reminder
 * (app/api/cron/planner-9pm-reminder/route.ts) know when it's actually 9pm
 * for a given student, without ever asking them to pick a timezone from a
 * dropdown - see migration add_profile_timezone_and_9pm_reminder_dedup.
 *
 * Fire-and-forget: writes unconditionally on every mount rather than
 * reading first to compare - an extra identical write is harmless, and
 * skipping the read keeps this to a single request. Silently does nothing
 * if no one's signed in, or if the write fails (e.g. offline) - never
 * surfaces an error to the person, since this has nothing to do with
 * whatever page they're actually trying to use.
 */
export default function TimezoneSync() {
  useEffect(() => {
    let cancelled = false;
    async function sync() {
      let tz: string;
      try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        return;
      }
      if (!tz) return;

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;

      await supabase.from("profiles").update({ timezone: tz }).eq("id", user.id);
    }
    sync();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
