import type { ReactNode } from "react";
import NavBar from "./NavBar";
import TopHeader from "./TopHeader";
import { createClient } from "@/lib/supabase/server";
import { getContentPublished } from "@/lib/platformSettings";

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
 * Also decides whether the gated nav groups (Learn/Improve) should show up
 * in the sidebar at all, based on the platform_settings publish switch.
 * Admins always see everything, so this only ever matters for students -
 * pass `contentPublished` in if the calling page already fetched it (to
 * avoid a second query), otherwise AppShell fetches it itself.
 */
export default async function AppShell({
  isAdmin,
  userName,
  streak,
  contentPublished,
  children,
}: {
  isAdmin?: boolean;
  userName?: string | null;
  streak?: number;
  contentPublished?: boolean;
  children: ReactNode;
}) {
  let resolvedPublished = true;
  if (!isAdmin) {
    resolvedPublished =
      contentPublished !== undefined ? contentPublished : await getContentPublished(createClient());
  }

  return (
    <div className="min-h-screen flex">
      <NavBar isAdmin={isAdmin} userName={userName} streak={streak} contentPublished={resolvedPublished} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader userName={userName} streak={streak} />
        {children}
      </div>
    </div>
  );
}
