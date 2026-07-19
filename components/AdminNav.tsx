"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
    items: [{ href: "/admin", label: "Students" }],
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
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 border-r border-slate-800 bg-[#050505] min-h-screen sticky top-0 flex flex-col">
      <div className="px-5 py-6">
        <span className="font-bold text-brand-300 block mb-1">Master Grid</span>
        <span className="text-xs font-semibold bg-brand-900/40 text-brand-300 rounded-full px-2 py-1">
          Admin
        </span>
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
        <Link
          href="/dashboard"
          className="block text-sm font-medium px-3 py-2.5 rounded-lg text-slate-300 hover:bg-slate-800"
        >
          My dashboard
        </Link>
        <form action="/auth/signout" method="post">
          <button className="w-full text-left text-sm font-medium px-3 py-2.5 rounded-lg text-slate-400 hover:bg-slate-800">
            Log out
          </button>
        </form>
      </div>
    </aside>
  );
}
