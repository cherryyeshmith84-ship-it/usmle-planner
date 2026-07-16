"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { DIFFICULTY_LEVELS, STEP1_SUBJECTS, STEP1_SYSTEMS } from "@/lib/qbankTypes";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "under_review", label: "Under review" },
  { value: "published", label: "Published" },
];

/**
 * Filter bar for the Question Bank list - reads/writes plain URL search
 * params (?status=&subject=&system=&difficulty=) so the server component
 * page can filter server-side and the filters survive a refresh/share link.
 */
export default function QBankFilters({
  status,
  subject,
  system,
  difficulty,
}: {
  status: string;
  subject: string;
  system: string;
  difficulty: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  const hasFilters = !!(status || subject || system || difficulty);

  return (
    <div className="card mb-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="label mb-1">Status</label>
          <select className="input" value={status} onChange={(e) => setParam("status", e.target.value)}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label mb-1">Subject</label>
          <select className="input" value={subject} onChange={(e) => setParam("subject", e.target.value)}>
            <option value="">All subjects</option>
            {STEP1_SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label mb-1">System</label>
          <select className="input" value={system} onChange={(e) => setParam("system", e.target.value)}>
            <option value="">All systems</option>
            {STEP1_SYSTEMS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label mb-1">Difficulty</label>
          <select
            className="input"
            value={difficulty}
            onChange={(e) => setParam("difficulty", e.target.value)}
          >
            <option value="">All difficulties</option>
            {DIFFICULTY_LEVELS.map((d) => (
              <option key={d} value={d}>
                {d[0].toUpperCase() + d.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {hasFilters && (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="text-xs font-medium text-brand-400 hover:text-brand-300 mt-3"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
