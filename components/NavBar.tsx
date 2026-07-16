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
      { href: "/smart-review", label: "Smart Review" },
      { href: "/error-notes", label: "Error Notes" },
      { href: "/visual-lab", label: "Visual Lab" },
    ],
  },
  {
    title: "Plan",
    items: [
      { href: "/planner", label: "Study Planner" },
      // "Performance" absorbs what used to be the standalone History page -
      // detailed day-by-day history lives here now, not as its own nav item.
      { href: "/history", label: "Performance" },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
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
}: {
  isAdmin?: boolean;
  // Optional - pages that haven't been updated to pass these yet just won't
  // show the streak badge / real name in the profile block below.
  userName?: string | null;
  streak?: number;
}) {
  const pathname = usePathname();

  function linkClass(href: string) {
    const active = isActive(pathname, href);
    return `text-sm font-medium px-3 py-2.5 rounded-lg transition ${
      active ? "bg-brand-900/40 text-brand-300" : "text-slate-300 hover:bg-slate-800"
    }`;
  }

  return (
    <aside className="w-60 shrink-0 border-r border-slate-800 bg-[#050505] min-h-screen sticky top-0 flex flex-col">
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

        {GROUPS.map((group) => (
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
