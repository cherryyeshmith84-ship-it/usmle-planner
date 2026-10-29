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
 * 9:30pm-local-time reminder (the other half is the email sent by
 * app/api/cron/planner-9pm-reminder/route.ts). Mounted globally in
 * AppShell.tsx so it can appear no matter which page a student happens to
 * have open when their own local clock hits 9:30pm.
 *
 * Reads the browser's OWN clock to decide "is it 9:30pm yet" - that's
 * already the student's real local time. Whether there's actually anything
 * to remind about comes from /api/planner/today-status?date=<local date>.
 *
 * Dismissing is remembered in localStorage keyed by the browser's own
 * local calendar date, so dismissing tonight doesn't suppress tomorrow
 * night's popup.
 */
export default function Planner9pmPopup() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (typeof window === "undefined") return;
      const now = new Date();
      if (now.getHours() * 60 + now.getMinutes() < 21 * 60 + 30) return; // not 9:30pm yet, locally
      if (window.localStorage.getItem(dismissKey()) === "1") return;

      try {
        const res = await fetch(`/api/planner/today-status?date=${localDateString()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.needsReminder) setShow(true);
      } catch {
        // Offline or a transient error - just skip silently.
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
        <p className="text-lg font-bold mb-1">You&apos;re doing great - one last step 💪</p>
        <p className="text-sm text-slate-400 mb-4">
          Every day you show up gets you closer to your goal. Your planner hasn&apos;t been updated yet
          today - take a minute to tick off what you got done, even if it wasn&apos;t everything. Small,
          steady progress is what counts, and it helps your mentor support you better.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/planner" onClick={dismiss} className="btn-primary text-sm">
            Update my planner
          </Link>
          <button type="button" onClick={dismiss} className="btn-secondary text-sm">
            Remind me tomorrow
          </button>
        </div>
      </div>
    </div>
  );
}
