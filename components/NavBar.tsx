"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    title: "Learn",
    items: [
      { href: "/qbank", label: "Question Bank" },
      { href: "/assessments", label: "Self Assessments" },
    ],
  },
  {
    title: "Improve",
    items: [
      { href: "/master-grid", label: "Master Grid" },
      { href: "/anki", label: "Anki" },
      { href: "/error-notes", label: "Error Notes" },
      { href: "/visual-lab", label: "Visual Lab" },
    ],
  },
  {
    title: "Mentorship",
    items: [
      // Same link for everyone - app/mentorship/page.tsx decides server-side
      // whether the signed-in email belongs to a mentor (shows their
      // availability manager) or a student (shows the mentor directory).
      { href: "/mentorship", label: "Mentorship" },
      { href: "/mentorship/sessions", label: "Upcoming Sessions" },
      { href: "/planner", label: "Study Planner" },
      // "Analysis" (was "Performance") absorbs what used to be the
      // standalone History page - detailed day-by-day history lives here
      // now, not as its own nav item.
      { href: "/history", label: "Analysis" },
    ],
  },
];

// Groups hidden from students until the admin flips the global publish
// switch on. "Mentorship" (which now also holds Study Planner/Analysis) is
// intentionally left out - that's always visible.
const GATED_GROUP_TITLES = new Set(["Learn", "Improve"]);

function isActive(pathname: string, href: string) {
  // Exact-match only for routes that now have their own sub-route (e.g.
  // "/mentorship/sessions" nested under "/mentorship") - otherwise the
  // parent nav item would light up alongside the child's on every one of
  // its sub-pages, since a plain startsWith would match both.
  if (href === "/dashboard" || href === "/mentorship") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initials(name: string | null | undefined) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
}

export default function NavBar({
  isAdmin,
  userName,
  streak,
  contentPublished = true,
}: {
  isAdmin?: boolean;
  // Optional - pages that haven't been updated to pass these yet just won't
  // show the streak badge / real name in the profile block below.
  userName?: string | null;
  streak?: number;
  // Whether the coach has published student content yet. Defaults to true
  // so any caller that hasn't been updated to pass this (or admins, who
  // should never be gated) still sees the full nav.
  contentPublished?: boolean;
}) {
  const pathname = usePathname();
  const visibleGroups = GROUPS.filter(
    (group) => isAdmin || contentPublished || !GATED_GROUP_TITLES.has(group.title)
  );

  function linkClass(href: string) {
    const active = isActive(pathname, href);
    return `text-sm font-medium px-3 py-2.5 rounded-lg transition ${
      active ? "bg-brand-900/40 text-brand-300" : "text-slate-300 hover:bg-slate-800"
    }`;
  }

  return (
    // h-screen (not min-h-screen + sticky) - the old "min-h-screen sticky
    // top-0" relied on this aside staying pinned via CSS sticky while the
    // whole page scrolled around it, but the parent flex row stretching this
    // aside to match the (much taller) content column's height made that
    // unreliable in practice - the sidebar scrolled away with everything
    // else instead of staying put. Now AppShell makes only the content
    // column scroll, so this just needs to be exactly one viewport tall and
    // never move at all. The nav below still scrolls internally
    // (overflow-y-auto) if there are ever more links than fit.
    <aside className="w-60 shrink-0 border-r border-slate-800 bg-[#050505] h-screen flex flex-col">
      <div className="px-5 py-6">
        <span className="font-bold text-brand-300 block">Master Grid</span>
        {typeof streak === "number" && streak > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 mt-1">
            🔥 {streak} day{streak === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <nav className="flex flex-col gap-4 px-3 flex-1 overflow-y-auto pb-4">
        <Link href="/dashboard" className={linkClass("/dashboard")}>
          Home
        </Link>

        {visibleGroups.map((group) => (
          <div key={group.title}>
            <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              {group.title}
            </p>
            <div className="flex flex-col gap-1">
              {group.items.map((item) => (
                <Link key={item.href} href={item.href} className={linkClass(item.href)}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}

        {isAdmin && (
          <div>
            <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Admin
            </p>
            <div className="flex flex-col gap-1">
              <Link href="/lab-values" className={linkClass("/lab-values")}>
                Lab Values
              </Link>
              <Link
                href="/admin"
                className="text-sm font-medium px-3 py-2.5 rounded-lg text-brand-300 bg-brand-900/40 hover:bg-brand-900/40"
              >
                Admin
              </Link>
            </div>
          </div>
        )}
      </nav>

      <div className="px-3 pb-6 pt-3 border-t border-slate-800">
        <Link href="/settings" className={linkClass("/settings")}>
          Settings
        </Link>
        <div className="flex items-center gap-2.5 px-3 py-2.5 mt-1">
          <span className="w-7 h-7 rounded-full bg-brand-900/50 text-brand-300 text-xs font-bold flex items-center justify-center shrink-0">
            {initials(userName)}
          </span>
          <span className="text-sm text-slate-300 truncate">{userName || "Your profile"}</span>
        </div>
        <form action="/auth/signout" method="post">
          <button className="w-full text-left text-sm font-medium px-3 py-2 rounded-lg text-slate-500 hover:bg-slate-800 hover:text-slate-300">
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
