"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PlannerColumn, PlannerEntry } from "@/lib/plannerColumns";

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(date: string): string {
  return WEEKDAY[new Date(date + "T00:00:00").getDay()];
}

/**
 * Spreadsheet-style day-by-day planner grid - replaces the old
 * template-driven task checklist. One row per calendar date, one column per
 * active planner_columns row (admin-configurable in /admin/planner-config).
 * Cells autosave on blur/change straight to planner_entries via the
 * Supabase client (RLS: the row's own student, or an admin, can write).
 *
 * `canEdit` controls whether cells are interactive at all - false renders a
 * read-only grid (useful for e.g. a future "view only" context).
 */
export default function PlannerGridClient({
  targetUserId,
  columns,
  initialEntries,
  canEdit = true,
}: {
  targetUserId: string;
  columns: PlannerColumn[];
  initialEntries: PlannerEntry[];
  canEdit?: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const activeColumns = useMemo(
    () => columns.filter((c) => c.active).sort((a, b) => a.sort_order - b.sort_order),
    [columns]
  );

  const [entriesByDate, setEntriesByDate] = useState<Record<string, PlannerEntry["field_values"]>>(() => {
    const map: Record<string, PlannerEntry["field_values"]> = {};
    for (const e of initialEntries) map[e.log_date] = e.field_values ?? {};
    return map;
  });

  const earliestExisting = initialEntries.reduce(
    (min, e) => (e.log_date < min ? e.log_date : min),
    today
  );

  const [rangeStart, setRangeStart] = useState(() => {
    const fallback = addDays(today, -7);
    return earliestExisting < fallback ? earliestExisting : fallback;
  });
  const [rangeEnd, setRangeEnd] = useState(() => addDays(today, 7));
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [newDate, setNewDate] = useState("");

  const dates = useMemo(() => {
    const out: string[] = [];
    let cursor = rangeStart;
    let guard = 0;
    while (cursor <= rangeEnd && guard < 400) {
      out.push(cursor);
      cursor = addDays(cursor, 1);
      guard++;
    }
    return out;
  }, [rangeStart, rangeEnd]);

  async function saveCell(date: string, key: string, value: string | number | boolean) {
    if (!canEdit) return;
    setSavingDate(date);
    const nextValues = { ...(entriesByDate[date] ?? {}), [key]: value };
    setEntriesByDate((prev) => ({ ...prev, [date]: nextValues }));
    const supabase = createClient();
    await supabase.from("planner_entries").upsert(
      { user_id: targetUserId, log_date: date, field_values: nextValues },
      { onConflict: "user_id,log_date" }
    );
    setSavingDate(null);
  }

  function addSpecificDay() {
    if (!newDate) return;
    if (newDate < rangeStart) setRangeStart(newDate);
    if (newDate > rangeEnd) setRangeEnd(newDate);
    setEntriesByDate((prev) => (prev[newDate] ? prev : { ...prev, [newDate]: {} }));
    setNewDate("");
  }

  function renderCell(date: string, col: PlannerColumn) {
    const raw = entriesByDate[date]?.[col.key];
    const disabled = !canEdit;

    if (col.field_type === "checkbox") {
      return (
        <input
          type="checkbox"
          checked={!!raw}
          disabled={disabled}
          onChange={(e) => saveCell(date, col.key, e.target.checked)}
          className="w-4 h-4"
        />
      );
    }
    if (col.field_type === "textarea") {
      return (
        <textarea
          defaultValue={(raw as string) ?? ""}
          disabled={disabled}
          onBlur={(e) => saveCell(date, col.key, e.target.value)}
          rows={1}
          className="input text-xs py-1 px-2 min-w-[140px] w-full resize-y"
        />
      );
    }
    if (col.field_type === "number") {
      return (
        <input
          type="number"
          defaultValue={raw === undefined || raw === null || raw === "" ? "" : Number(raw)}
          disabled={disabled}
          onBlur={(e) => saveCell(date, col.key, e.target.value === "" ? "" : Number(e.target.value))}
          className="input text-xs py-1 px-2 w-20"
        />
      );
    }
    return (
      <input
        type="text"
        defaultValue={(raw as string) ?? ""}
        disabled={disabled}
        onBlur={(e) => saveCell(date, col.key, e.target.value)}
        className="input text-xs py-1 px-2 min-w-[160px] w-full"
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRangeStart((d) => addDays(d, -7))}
            className="text-xs font-semibold text-brand-400 hover:text-brand-300"
          >
            &larr; Show earlier week
          </button>
          <button
            type="button"
            onClick={() => setRangeEnd((d) => addDays(d, 7))}
            className="text-xs font-semibold text-brand-400 hover:text-brand-300"
          >
            Show more weeks &rarr;
          </button>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="input text-xs py-1 px-2"
            />
            <button type="button" onClick={addSpecificDay} className="btn-secondary text-xs">
              Jump to date
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto border border-slate-800 rounded-xl">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-900 text-left">
              <th className="px-3 py-2 text-xs font-semibold text-slate-400 sticky left-0 bg-slate-900">Day</th>
              <th className="px-3 py-2 text-xs font-semibold text-slate-400">Date</th>
              {activeColumns.map((c) => (
                <th key={c.id} className="px-3 py-2 text-xs font-semibold text-slate-400 whitespace-nowrap">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dates.map((date) => (
              <tr
                key={date}
                className={`border-t border-slate-800 ${date === today ? "bg-brand-900/10" : ""} ${
                  savingDate === date ? "opacity-60" : ""
                }`}
              >
                <td className="px-3 py-1.5 text-xs text-slate-400 whitespace-nowrap sticky left-0 bg-[#0a0a0a]">
                  {weekdayOf(date)}
                </td>
                <td className="px-3 py-1.5 text-xs font-semibold whitespace-nowrap">
                  {date}
                  {date === today && (
                    <span className="ml-1.5 text-[10px] font-semibold text-brand-400">TODAY</span>
                  )}
                </td>
                {activeColumns.map((c) => (
                  <td key={c.id} className="px-2 py-1">
                    {renderCell(date, c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {activeColumns.length === 0 && (
        <p className="text-sm text-slate-400">
          No planner columns are set up yet - an admin can add some from Planner Settings.
        </p>
      )}
    </div>
  );
}
