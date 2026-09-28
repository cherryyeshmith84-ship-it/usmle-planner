import type { ReactNode } from "react";
import NavBar from "./NavBar";
import TopHeader from "./TopHeader";
import TimezoneSync from "./TimezoneSync";
import Planner9pmPopup from "./Planner9pmPopup";

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
 * TimezoneSync and Planner9pmPopup are both mounted here, unconditionally,
 * rather than on individual pages - that's what makes them work sitewide
 * (any signed-in page, not just Dashboard/Study Planner) with zero new
 * props threaded through every AppShell caller. Both render nothing
 * visible most of the time: TimezoneSync is a silent background sync, and
 * Planner9pmPopup only ever renders its modal after 9pm local time when
 * there's actually something to remind about (see each component's own
 * doc comment).
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
      <TimezoneSync />
      <Planner9pmPopup />
      <NavBar isAdmin={isAdmin} userName={userName} streak={streak} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader userName={userName} streak={streak} />
        {children}
      </div>
    </div>
  );
}
