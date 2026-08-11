"use client";

import { useState, type ReactNode } from "react";

export interface StudentTabDef {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Tab switcher for the mentor's per-student page
 * (app/mentorship/student/[studentId]/page.tsx) - replaces the old one long
 * scrolling page (Status, Intake, Analysis, Study plan, Score reports,
 * Planner schedule/layout, Study planner calendar, Previous sessions, all
 * stacked at once) with focused sections: Overview, Sessions, Study Planner,
 * Analysis, Messages - matching the same grouping a student sees for
 * themselves via the sidebar (Mentorship / Upcoming Sessions / Study
 * Planner / Analysis), just as in-page tabs instead of separate routes,
 * since every tab here is scoped to one specific student.
 *
 * Only the active tab's content is ever rendered into the tree - the others
 * sit inert in the `tabs` array (a React element isn't mounted, and none of
 * its effects run, until it's actually returned into the render tree). That
 * matters here specifically: the Messages tab polls every 5s
 * (MentorChatPanel) and Study Planner mounts a fairly heavy calendar - we
 * don't want either running/fetching in the background while a mentor is
 * looking at a different tab.
 */
export default function MentorStudentTabs({ tabs, defaultTab }: { tabs: StudentTabDef[]; defaultTab?: string }) {
  const [activeId, setActiveId] = useState(defaultTab ?? tabs[0]?.id ?? "");
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  return (
    <div>
      <div className="flex gap-1 border-b border-slate-800 mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveId(t.id)}
            className={`text-sm font-semibold px-4 py-2.5 border-b-2 -mb-px whitespace-nowrap transition ${
              active?.id === t.id
                ? "border-brand-400 text-brand-300"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {active?.content}
    </div>
  );
}
