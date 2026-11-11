"use client";

import { useState } from "react";
import Link from "next/link";

export type MentorStudentItem = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  status_update: string | null;
  exam_date: string | null;
  co: boolean;
};

/**
 * Searchable list for the mentor's "Your students" page. Filters by name or
 * email as you type.
 */
export default function MentorStudentList({ students }: { students: MentorStudentItem[] }) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const shown = term
    ? students.filter(
        (s) => (s.full_name ?? "").toLowerCase().includes(term) || (s.email ?? "").toLowerCase().includes(term)
      )
    : students;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search students by name or email..."
          className="input w-full sm:max-w-sm"
        />
        <span className="text-xs text-slate-500">
          {term ? `${shown.length} of ${students.length}` : `${students.length} students`}
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-slate-500">No students match &ldquo;{q}&rdquo;.</p>
      ) : (
        <div className="space-y-2">
          {shown.map((s) => (
            <Link
              key={s.id}
              href={`/mentorship/student/${s.id}`}
              className="card py-3 flex items-center gap-3 text-sm hover:border-brand-400 transition"
            >
              {s.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.avatar_url}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover border border-slate-700 shrink-0"
                />
              ) : (
                <span className="w-10 h-10 rounded-full bg-brand-900/50 text-brand-300 text-sm font-bold flex items-center justify-center shrink-0">
                  {(s.full_name || "?").trim().charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p>
                    <span className="font-semibold">{s.full_name || "A student"}</span>{" "}
                    <span className="text-slate-500">&middot; {s.email}</span>
                    {s.co && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-brand-400">Co-mentor</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {s.exam_date ? `Exam ${s.exam_date}` : "No exam date set"}
                  </p>
                  {s.status_update && (
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">&ldquo;{s.status_update}&rdquo;</p>
                  )}
                </div>
                <span className="text-xs text-brand-400 shrink-0">Open →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
