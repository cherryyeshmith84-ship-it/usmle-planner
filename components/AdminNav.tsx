"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import NotificationsBell from "./NotificationsBell";

interface NavItem {
  href: string;
  label: string;
  addHref?: string;
  addLabel?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { href: "/admin", label: "Students" },
      { href: "/admin/performance", label: "Performance" },
      { href: "/admin/terms", label: "Terms acceptances" },
    ],
  },
  {
    title: "Content",
    items: [
      { href: "/admin/qbank", label: "Question Bank", addHref: "/admin/qbank/new", addLabel: "New question" },
      { href: "/admin/qbank/bulk-import", label: "Bulk import" },
      { href: "/admin/qbank/review", label: "Review queue" },
      { href: "/admin/error-dna", label: "Error DNA" },
      { href: "/admin/concepts", label: "Concept Library" },
      {
        href: "/admin/assessments",
        label: "Self Assessments",
        addHref: "/admin/assessments/new?kind=qbank",
        addLabel: "New assessment",
      },
      { href: "/admin/templates", label: "Templates", addHref: "/admin/templates/new", addLabel: "New template" },
    ],
  },
  {
    title: "Mentorship",
    items: [
      { href: "/admin/mentors", label: "Mentors" },
      // Separate roster from Mentors above - a "viewer" is never a mentor,
      // never has availability/sessions (see lib/viewers.ts and
      // ViewerAdminClient.tsx).
      { href: "/admin/viewers", label: "Viewers" },
    ],
  },
  {
    title: "Settings",
    items: [{ href: "/admin/planner-config", label: "Planner Settings" }],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminNav() {
  const pathname = usePathname();
  // Same off-canvas mobile drawer pattern as NavBar.tsx. Admin pages don't
  // go through AppShell (each renders AdminNav directly), so this is fully
  // self-contained. There is intentionally no link back to the student
  // dashboard - admins only see admin pages.
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen((v) => !v)}
        aria-label={mobileOpen ? "Close menu" : "Open menu"}
        className="md:hidden fixed top-3 left-3 z-50 w-10 h-10 rounded-lg bg-white border border-slate-800 shadow-sm flex items-center justify-center text-slate-300"
      >
        {mobileOpen ? "✕" : "☰"}
      </button>

      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-slate-950/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`w-60 shrink-0 border-r border-slate-800 bg-white h-screen flex flex-col fixed top-0 left-0 z-40 transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
      <div className="px-5 py-6">
        <div className="flex items-center gap-2 mb-1">
          <Image
            src="/logo.png"
            alt=""
            width={28}
            height={28}
            className="rounded-md shrink-0"
          />
          <span className="font-bold text-brand-300 block">Master Grid</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold bg-brand-900/40 text-brand-300 rounded-full px-2 py-1">
            Admin
          </span>
          {/* New-signup notifications land here - admin pages have their own
              sidebar instead of the shared AppShell/TopHeader, so the bell
              lives here too. align="left" keeps the dropdown on screen. */}
          <NotificationsBell align="left" />
        </div>
      </div>

      <nav className="flex flex-col gap-4 px-3 flex-1 overflow-y-auto pb-4">
        {GROUPS.map((group) => (
          <div key={group.title}>
            <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              {group.title}
            </p>
            <div className="flex flex-col gap-1">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <div
                    key={item.href}
                    className={`group flex items-center justify-between gap-1 rounded-lg transition ${
                      active ? "bg-brand-900/40" : "hover:bg-slate-800"
                    }`}
                  >
                    <Link
                      href={item.href}
                      className={`flex-1 text-sm font-medium px-3 py-2.5 ${
                        active ? "text-brand-300" : "text-slate-300"
                      }`}
                    >
                      {item.label}
                    </Link>
                    {item.addHref && (
                      <Link
                        href={item.addHref}
                        title={item.addLabel}
                        className="shrink-0 pr-3 text-slate-500 hover:text-brand-300 text-base leading-none opacity-0 group-hover:opacity-100 transition"
                      >
                        +
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 pb-6 pt-3 border-t border-slate-800">
        <form action="/auth/signout" method="post">
          <button className="w-full text-left text-sm font-medium px-3 py-2.5 rounded-lg text-slate-400 hover:bg-slate-800">
            Log out
          </button>
        </form>
      </div>
      </aside>

      {/* Reserves the sidebar's width in each admin page's flex row so the
          always-fixed <aside> doesn't overlap <main>. Hidden on mobile. */}
      <div className="hidden md:block w-60 shrink-0" aria-hidden="true" />
    </>
  );
}
