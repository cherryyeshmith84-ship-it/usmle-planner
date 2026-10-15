"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export interface PickerStudent {
  id: string;
  name: string;
  email: string;
  reportCount: number;
}

/**
 * Search box + dropdown to choose which student's analysis to open. Picking
 * a student navigates to /admin/analysis?student=<id>.
 */
export default function AdminAnalysisPicker({
  students,
  selectedId,
}: {
  students: PickerStudent[];
  selectedId: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
  }, [students, query]);

  function choose(id: string) {
    if (id) router.push(`/admin/analysis?student=${id}`);
    else router.push("/admin/analysis");
  }

  return (
    <div className="card mb-6">
      <label className="label">Find a student</label>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or email..."
        className="input mb-3"
      />
      <label className="label">Student ({filtered.length})</label>
      <select value={selectedId ?? ""} onChange={(e) => choose(e.target.value)} className="input">
        <option value="">Select a student...</option>
        {filtered.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} - {s.email} ({s.reportCount} report{s.reportCount === 1 ? "" : "s"})
          </option>
        ))}
      </select>
    </div>
  );
}
