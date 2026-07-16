"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

function initials(name: string | null | undefined) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
}

/**
 * Thin persistent bar above the main content area (sidebar stays as-is) -
 * shows the streak + a notification bell (not wired to anything yet, just
 * a visual placeholder until there's a real notifications feature) + an
 * avatar that opens a small dropdown (Profile & Settings, Sign out). This
 * is what makes individual pages feel like one connected platform instead
 * of disconnected screens each just starting with a NavBar + content.
 */
export default function TopHeader({
  userName,
  streak,
}: {
  userName?: string | null;
  streak?: number;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex items-center justify-end gap-3 px-6 py-3 border-b border-slate-800 bg-black/80 backdrop-blur">
      {typeof streak === "number" && streak > 0 && (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 bg-amber-900/20 rounded-full px-2.5 py-1">
          🔥 {streak} day{streak === 1 ? "" : "s"}
        </span>
      )}

      <button
        type="button"
        title="Notifications"
        className="text-base w-8 h-8 rounded-full text-slate-400 hover:text-slate-200 hover:bg-slate-800 flex items-center justify-center transition"
      >
        🔔
      </button>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="w-8 h-8 rounded-full bg-brand-900/50 text-brand-300 text-xs font-bold flex items-center justify-center hover:bg-brand-900/70 transition"
        >
          {initials(userName)}
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-2 w-52 rounded-lg border border-slate-800 bg-[#0a0a0a] shadow-lg py-1 z-30">
            <p className="px-3 py-2 text-xs text-slate-500 truncate border-b border-slate-800">
              {userName || "Your profile"}
            </p>
            <Link
              href="/settings"
              onClick={() => setMenuOpen(false)}
              className="block px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              Profile &amp; Settings
            </Link>
            <form action="/auth/signout" method="post">
              <button className="w-full text-left px-3 py-2 text-sm text-slate-400 hover:bg-slate-800">
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
