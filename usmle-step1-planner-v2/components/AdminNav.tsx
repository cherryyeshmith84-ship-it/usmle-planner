"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Students" },
  { href: "/admin/templates", label: "Templates" },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="font-bold text-brand-700">Step 1 Planner</span>
          <span className="text-xs font-semibold bg-brand-50 text-brand-700 rounded-full px-2 py-1">
            Admin
          </span>
        </div>
        <nav className="flex items-center gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`text-sm font-medium px-3 py-2 rounded-lg transition ${
                pathname === l.href
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/dashboard"
            className="text-sm font-medium px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100"
          >
            My dashboard
          </Link>
          <form action="/auth/signout" method="post">
            <button className="text-sm font-medium px-3 py-2 rounded-lg text-slate-500 hover:bg-slate-100">
              Log out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
