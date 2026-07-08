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
    <aside className="w-56 shrink-0 border-r border-slate-800 bg-[#050505] min-h-screen sticky top-0 flex flex-col">
      <div className="px-5 py-6">
        <span className="font-bold text-brand-300 block mb-1">Step 1 Planner</span>
        <span className="text-xs font-semibold bg-brand-900/40 text-brand-300 rounded-full px-2 py-1">
          Admin
        </span>
      </div>
      <nav className="flex flex-col gap-1 px-3 flex-1">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`text-sm font-medium px-3 py-2.5 rounded-lg transition ${
              pathname === l.href
                ? "bg-brand-900/40 text-brand-300"
                : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            {l.label}
          </Link>
        ))}
        <Link
          href="/dashboard"
          className="text-sm font-medium px-3 py-2.5 rounded-lg text-slate-300 hover:bg-slate-800"
        >
          My dashboard
        </Link>
      </nav>
      <div className="px-3 pb-6">
        <form action="/auth/signout" method="post">
          <button className="w-full text-left text-sm font-medium px-3 py-2.5 rounded-lg text-slate-400 hover:bg-slate-800">
            Log out
          </button>
        </form>
      </div>
    </aside>
  );
}
