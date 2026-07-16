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
 */
export default function AppShell({
  isAdmin,
  userName,
  streak,
  children,
}: {
  isAdmin?: boolean;
  userName?: string | null;
  streak?: number;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      <NavBar isAdmin={isAdmin} userName={userName} streak={streak} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader userName={userName} streak={streak} />
        {children}
      </div>
    </div>
  );
}
