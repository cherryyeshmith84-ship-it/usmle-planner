"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Search box for the admin Students page. Filters every student card on the
 * page (cards marked data-student-card) by name / email / mentor as you type,
 * and hides any group section left with no matches.
 */
export default function StudentSearch() {
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current?.closest("main");
    if (!root) return;
    const needle = q.trim().toLowerCase();
    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-student-card]"));
    let shown = 0;
    const seen = new Set<string>();
    for (const el of cards) {
      const hay = (el.dataset.studentCard ?? "").toLowerCase();
      const ok = !needle || hay.includes(needle);
      el.style.display = ok ? "" : "none";
      if (ok) {
        // Same student can appear in both the Waiting block and the grouped list.
        const id = el.dataset.studentId ?? hay;
        if (!seen.has(id)) {
          seen.add(id);
          shown++;
        }
      }
    }
    // Hide section blocks that have no visible cards.
    root.querySelectorAll<HTMLElement>("[data-student-section]").forEach((sec) => {
      const any = Array.from(sec.querySelectorAll<HTMLElement>("[data-student-card]")).some(
        (c) => c.style.display !== "none"
      );
      sec.style.display = !needle || any ? "" : "none";
    });
    setMatches(needle ? shown : null);
  }, [q]);

  return (
    <div ref={ref} className="mb-6">
      <div className="flex items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search students by name, email or mentor..."
          className="input w-full"
          aria-label="Search students"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} className="btn-secondary text-sm whitespace-nowrap">
            Clear
          </button>
        )}
      </div>
      {matches !== null && (
        <p className="text-xs text-slate-500 mt-1">
          {matches} student{matches === 1 ? "" : "s"} found
        </p>
      )}
    </div>
  );
}
