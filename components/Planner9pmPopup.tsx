"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // recheck every 5 minutes

function dismissKey(): string {
  return `planner-9pm-popup-dismissed-${new Date().toDateString()}`;
}

/** Local calendar date ("YYYY-MM-DD") from the browser's own clock - "en-CA"
 *  formats dates in that order, same trick used server-side in
 *  lib/timezone.ts. This is what /api/planner/today-status checks against,
 *  so "today" always means the student's own local day, not the server's
 *  UTC day. */
function localDateString(): string {
  return new Date().toLocaleDateString("en-CA");
}

/**
 * Sitewide "update your planner" popup - the website-popup half of the
 * 9pm-local-time reminder (the other half is the email sent by
 * app/api/cron/planner-9pm-reminder/route.ts). Mounted globally in
 * AppShell.tsx so it can appear no matter which page a student happens to
 * have open when their own local clock hits 9pm - it doesn't wait for a
 * page reload or a visit to a specific page.
 *
 * Deliberately reads the browser's OWN clock (`new Date().getHours()`) to
 * decide "is it 9pm yet" - that's already the student's real local time,
 * no stored timezone needed for this half (profiles.timezone, synced by
 * TimezoneSync.tsx, is only needed server-side for the email cron, which
 * has no browser to ask). Whether there's actually anything to remind
 * about comes from /api/planner/today-status?date=<local date>, which
 * applies the exact same "hasn't touched today's planner, or has
 * outstanding Assignments" rule the email cron uses - passing the local
 * date explicitly (rather than letting the server guess from UTC) is what
 * keeps "today" meaning the same calendar day here as it does on the
 * student's own clock.
 *
 * Dismissing is remembered in localStorage keyed by the browser's own
 * local calendar date (`Date().toDateString()`), same pattern
 * MissedDayPrompt.tsx uses - so dismissing tonight doesn't suppress
 * tomorrow night's popup, and it naturally resets itself with no cleanup
 * needed.
 */
export default function Planner9pmPopup() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (typeof window === "undefined") return;
      if (new Date().getHours() < 21) return; // not 9pm yet, locally
      if (window.localStorage.getItem(dismissKey()) === "1") return;

      try {
        const res = await fetch(`/api/planner/today-status?date=${localDateString()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.needsReminder) setShow(true);
      } catch {
        // Offline or a transient error - just skip silently, this isn't
        // worth interrupting anyone's actual task for.
      }
    }

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  function dismiss() {
    window.localStorage.setItem(dismissKey(), "1");
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="card max-w-sm w-full">
        <p className="text-lg font-bold mb-1">It&apos;s 9 PM</p>
        <p className="text-sm text-slate-400 mb-4">
          Today&apos;s planner still needs an update - take a minute to check off what you did today
          before the day closes out.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/planner" onClick={dismiss} className="btn-primary text-sm">
            Open your planner
          </Link>
          <button type="button" onClick={dismiss} className="btn-secondary text-sm">
            Dismiss for today
          </button>
        </div>
      </div>
    </div>
  );
}
