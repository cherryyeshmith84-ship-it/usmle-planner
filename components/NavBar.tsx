"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
      // standalone History page.
      { href: "/history", label: "Analysis" },
    ],
  },
];

// Groups hidden from students until the admin flips the global publish
// switch on. "Mentorship" is intentionally left out - always visible.
const GATED_GROUP_TITLES = new Set(["Learn", "Improve"]);

function isActive(pathname: string, href: string) {
  // Exact-match only for routes that have their own sub-route (e.g.
  // "/mentorship/sessions" nested under "/mentorship").
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
  isMentor: isMentorProp,
  userName,
  streak,
  contentPublished = true,
}: {
  isAdmin?: boolean;
  // Passed in by AppShell (server-resolved). If missing, falls back to a
  // client-side lookup below.
  isMentor?: boolean;
  userName?: string | null;
  streak?: number;
  contentPublished?: boolean;
}) {
  const pathname = usePathname();
  const [isMentorState, setIsMentorState] = useState(false);
  const isMentor = isMentorProp ?? isMentorState;
  // Below the md breakpoint the sidebar is an off-canvas drawer (closed by
  // default) toggled by the hamburger button, auto-closing on route change.
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Whether the signed-in user is an active mentor - checked client-side so
  // no isMentor prop has to be threaded through every page that renders
  // AppShell/NavBar.
  useEffect(() => {
    if (isMentorProp !== undefined) return;
    let cancelled = false;
    async function checkMentor() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) return;
      const { data } = await supabase.from("mentors").select("email").eq("active", true);
      const match = (data ?? []).some(
        (m: { email: string }) => m.email.toLowerCase() === user.email!.toLowerCase()
      );
      if (!cancelled) setIsMentorState(match);
    }
    checkMentor();
    return () => {
      cancelled = true;
    };
  }, [isMentorProp]);

  // Role split: students get the full student nav; mentors get ONLY the
  // mentor links; admins get ONLY the admin links (plus the mentor links if
  // they are also a mentor). No student features for mentors/admins.
  const isStudent = !isAdmin && !isMentor;
  const mentorGroup: NavGroup = {
    title: "Mentor",
    items: [
      { href: "/mentorship", label: "Mentorship" },
      // Booked sessions, notes and student feedback live on this page.
      { href: "/mentorship/sessions", label: "Upcoming Sessions" },
      { href: "/mentorship/students", label: "Students" },
      // Mentor-wide, day-by-day assignment plans per system (see
      // MentorTemplatesManager.tsx).
      { href: "/mentorship/templates", label: "Planner Templates" },
      // Self-service "waiting for a mentor" pool.
      { href: "/mentorship/waiting", label: "Waiting" },
      // Students an admin has granted this mentor read-only access to.
      { href: "/mentorship/viewing", label: "Viewing" },
    ],
  };
  const visibleGroups: NavGroup[] = isStudent
    ? GROUPS.filter((group) => contentPublished || !GATED_GROUP_TITLES.has(group.title))
    : isMentor
    ? [mentorGroup]
    : [];

  function linkClass(href: string) {
    const active = isActive(pathname, href);
    return `text-sm font-medium px-3 py-2.5 rounded-lg transition ${
      active ? "bg-brand-900/40 text-brand-300" : "text-slate-300 hover:bg-slate-800"
    }`;
  }

  return (
    <>
      {/* Hamburger toggle - only rendered below the md breakpoint. */}
      <button
        type="button"
        onClick={() => setMobileOpen((v) => !v)}
        aria-label={mobileOpen ? "Close menu" : "Open menu"}
        className="md:hidden fixed top-3 left-3 z-50 w-10 h-10 rounded-lg bg-white border border-slate-800 shadow-sm flex items-center justify-center text-slate-300"
      >
        {mobileOpen ? "✕" : "☰"}
      </button>

      {/* Backdrop - tapping it closes the drawer. */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-slate-950/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/*
        Sidebar stays pinned while the page scrolls: at md and above it is
        position:sticky; top:0 with self-start (so it is NOT stretched to the
        height of the tall content column) and h-screen, so it is exactly one
        viewport tall and never scrolls away. The nav inside still scrolls
        internally (overflow-y-auto) if there are more links than fit.
        Below md: fixed off-canvas drawer toggled by mobileOpen.
      */}
      <aside
        className={`w-60 shrink-0 border-r border-slate-800 bg-white h-screen flex flex-col fixed md:sticky md:top-0 md:self-start inset-y-0 left-0 z-40 transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
      <div className="px-5 py-6">
        <div className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt=""
            width={28}
            height={28}
            className="rounded-md shrink-0"
          />
          <span className="font-bold text-brand-300 block">Master Grid</span>
        </div>
        {typeof streak === "number" && streak > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 mt-1">
            🔥 {streak} day{streak === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <nav className="flex flex-col gap-4 px-3 flex-1 overflow-y-auto pb-4">
        {isStudent && (
          <Link href="/dashboard" data-tour="/dashboard" className={linkClass("/dashboard")}>
            Home
          </Link>
        )}

        {visibleGroups.map((group) => (
          <div key={group.title}>
            <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              {group.title}
            </p>
            <div className="flex flex-col gap-1">
              {group.items.map((item) => (
                // data-tour lets OnboardingTour.tsx find and spotlight this link.
                <Link key={item.href} href={item.href} data-tour={item.href} className={linkClass(item.href)}>
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
        {isStudent && (
          <Link href="/settings" data-tour="/settings" className={linkClass("/settings")}>
            Settings
          </Link>
        )}
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
    </>
  );
}
