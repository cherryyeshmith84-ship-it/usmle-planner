"use client";

import { useMemo, useState } from "react";
import { LAB_VALUES } from "@/lib/labValues";

/**
 * Searchable lab-values reference. Used both as a standalone page
 * (/lab-values) and inside the in-exam "Lab values" modal (compact mode).
 */
export default function LabValuesSearch({ compact = false }: { compact?: boolean }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LAB_VALUES;
    return LAB_VALUES.filter(
      (v) =>
        v.test.toLowerCase().includes(q) ||
        v.category.toLowerCase().includes(q) ||
        v.range.toLowerCase().includes(q)
    );
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof LAB_VALUES>();
    for (const v of filtered) {
      if (!map.has(v.category)) map.set(v.category, []);
      map.get(v.category)!.push(v);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search (e.g. potassium, TSH, WBC, creatinine)..."
        className="input mb-4"
      />

      {grouped.length === 0 && <p className="text-sm text-slate-400">No matches.</p>}

      <div className={compact ? "max-h-[55vh] overflow-y-auto space-y-4 pr-1" : "space-y-4"}>
        {grouped.map(([category, rows]) => (
          <div key={category}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-400 mb-1">
              {category}
            </h3>
            <div className="text-sm divide-y divide-slate-800">
              {rows.map((row) => (
                <div key={category + row.test} className="flex items-center justify-between py-2 gap-4">
                  <span className="text-slate-300">{row.test}</span>
                  <span className="text-slate-400 text-right">{row.range}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
