"use client";

import Link from "next/link";
import type { Profile } from "@/lib/types";
import AppShell from "@/components/AppShell";

/**
 * Bare home screen. Everything that used to be here (recommended session,
 * mastery stats, Master Grid preview, biggest opportunity, daily task
 * checklist, hours/block scores, end-of-day reflection, AI coach, coach
 * messages) was intentionally removed on 2026-07-28 - this is a clean slate
 * waiting on new content/direction.
 */
export default function DashboardClient({
  profile,
  contentPublished,
}: {
  profile: Profile;
  // Whether the coach has published student content yet - fetched
  // server-side by app/dashboard/page.tsx (this file is a Client Component
  // and can't fetch it itself) and passed straight through to AppShell so
  // the sidebar hides Learn/Improve for students until it's published.
  contentPublished?: boolean;
}) {
  const firstName = profile.full_name?.trim().split(/\s+/)[0];

  return (
    <AppShell isAdmin={profile.is_admin} userName={profile.full_name} contentPublished={contentPublished}>
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8 space-y-6 w-full">
        <div>
          <h1 className="text-2xl font-bold">Welcome back{firstName ? `, ${firstName}` : ""}</h1>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Link href="/planner" className="card hover:border-brand-500 transition block">
            <p className="font-bold text-lg mb-1">Study Planner</p>
            <p className="text-sm text-slate-400">Your day-by-day study grid.</p>
          </Link>
          <Link href="/history" className="card hover:border-brand-500 transition block">
            <p className="font-bold text-lg mb-1">Analysis</p>
            <p className="text-sm text-slate-400">Upload score reports, track weak/strong systems.</p>
          </Link>
        </div>
      </main>
    </AppShell>
  );
}
