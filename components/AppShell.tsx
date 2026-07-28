import type { ReactNode } from "react";
import NavBar from "./NavBar";
import TopHeader from "./TopHeader";

/**
 * Shared page shell: sidebar (NavBar) + persistent top header, wrapping
 * whatever the page renders as its main content. Replaces the old pattern
 * where every page manually rendered `<div className="min-h-screen
 * flex"><NavBar/><main>...</main></div>` on its own - that worked but meant
 * there was nowhere shared to hang a top header, and each page repeated the
 * same boilerplate. Pages still render their own <main> as a child (so each
 * keeps its own max-width/padding), this just adds the sidebar + header
 * around it.
 *
 * Deliberately a plain sync component with no Supabase import - it's used
 * from DashboardClient.tsx, which is a Client Component, and a Client
 * Component can't (even transitively) import lib/supabase/server.ts (that
 * needs next/headers, server-only - breaks the build if pulled in here).
 * So `contentPublished` (the platform_settings publish switch, used to hide
 * the Learn/Improve nav groups from students) has to be fetched by each
 * calling Server Component page and passed in as a plain boolean prop -
 * defaults to true so any page that hasn't been updated to pass it just
 * shows the full nav.
 */
export default function AppShell({
  isAdmin,
  userName,
  streak,
  contentPublished = true,
  children,
}: {
  isAdmin?: boolean;
  userName?: string | null;
  streak?: number;
  contentPublished?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      <NavBar isAdmin={isAdmin} userName={userName} streak={streak} contentPublished={contentPublished} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader userName={userName} streak={streak} />
        {children}
      </div>
    </div>
  );
}
