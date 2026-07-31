"use client";

import { Fragment, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PlannerColumn, PlannerEntry } from "@/lib/plannerColumns";
import type { UWorldBlock } from "@/lib/uworldBlocks";
import { groupBlocksByDate } from "@/lib/uworldBlocks";
import UWorldBlockTracker from "./UWorldBlockTracker";

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type CellValue = string | boolean;
type RowValues = Record<string, CellValue>;

function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(date: string): string {
  return WEEKDAY[new Date(date + "T00:00:00").getDay()];
}

/** Turns a row's raw string/boolean values into what the DB should store (numbers coerced, blanks dropped). */
function toFieldValues(row: RowValues, columns: PlannerColumn[]): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const col of columns) {
    const v = row[col.key];
    if (v === undefined) continue;
    if (col.field_type === "checkbox") {
      out[col.key] = !!v;
    } else if (col.field_type === "number") {
      if (v === "" || v === undefined) continue;
      const n = Number(v);
      if (!Number.isNaN(n)) out[col.key] = n;
    } else {
      if (v !== "") out[col.key] = v as string;
    }
  }
  return out;
}

/**
 * Day-by-day planner grid - one row per calendar date, one column per
 * active planner_columns row (admin-configurable in /admin/planner-config).
 * Each row also expands (▼) into a "day workspace" panel - currently just
 * the UWorld Block Tracker (Study Planner v1 item 2), with more sections
 * (Student/Mentor Notes, Assignments, etc.) landing there as later items
 * are built - so a day isn't just a flat spreadsheet row.
 *
 * Grid edits are staged locally (not saved as you type) and only written to
 * planner_entries when "Save changes" is clicked - gives a clear, visible
 * confirmation that the student will actually see what was entered, instead
 * of a silent per-cell autosave. Each row also has a "Clear" button to wipe
 * a day back to blank, and rows/columns can be click-highlighted to flag
 * something for attention (visual only, not saved).
 *
 * `canEdit` controls whether cells (and the expanded panel) are interactive
 * at all - false renders everything read-only.
 */
export default function PlannerGridClient({
  targetUserId,
  columns,
  initialEntries,
  initialBlocks = [],
  canEdit = true,
}: {
  targetUserId: string;
  columns: PlannerColumn[];
  initialEntries: PlannerEntry[];
  initialBlocks?: UWorldBlock[];
  canEdit?: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const activeColumns = useMemo(
    () => columns.filter((c) => c.active).sort((a, b) => a.sort_order - b.sort_order),
    [columns]
  );
  const blocksByDate = useMemo(() => groupBlocksByDate(initialBlocks), [initialBlocks]);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  function toggleExpanded(date: string) {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  const [valuesByDate, setValuesByDate] = useState<Record<string, RowValues>>(() => {
    const map: Record<string, RowValues> = {};
    for (const e of initialEntries) {
      const row: RowValues = {};
      for (const [k, v] of Object.entries(e.field_values ?? {})) {
        row[k] = typeof v === "boolean" ? v : v === null || v === undefined ? "" : String(v);
      }
      map[e.log_date] = row;
    }
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
  const [newDate, setNewDate] = useState("");
  const [dirtyDates, setDirtyDates] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [clearingDate, setClearingDate] = useState<string | null>(null);
  const [highlightedRows, setHighlightedRows] = useState<Set<string>>(new Set());
  const [highlightedCols, setHighlightedCols] = useState<Set<string>>(new Set());

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

  function setCellValue(date: string, key: string, value: CellValue) {
    setSaveMessage(null);
    setValuesByDate((prev) => ({ ...prev, [date]: { ...(prev[date] ?? {}), [key]: value } }));
    setDirtyDates((prev) => new Set(prev).add(date));
  }

  async function saveAll() {
    if (dirtyDates.size === 0 || !canEdit) return;
    setSaving(true);
    setSaveError(null);
    const supabase = createClient();
    const targets = Array.from(dirtyDates);
    const rows = targets.map((date) => ({
      user_id: targetUserId,
      log_date: date,
      field_values: toFieldValues(valuesByDate[date] ?? {}, activeColumns),
    }));
    const { error } = await supabase.from("planner_entries").upsert(rows, { onConflict: "user_id,log_date" });
    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    setDirtyDates(new Set());
    setSaveMessage(`Saved ${targets.length} day${targets.length === 1 ? "" : "s"} - visible to the student now.`);
  }

  function addSpecificDay() {
    if (!newDate) return;
    if (newDate < rangeStart) setRangeStart(newDate);
    if (newDate > rangeEnd) setRangeEnd(newDate);
    setValuesByDate((prev) => (prev[newDate] ? prev : { ...prev, [newDate]: {} }));
    setNewDate("");
  }

  async function clearDay(date: string) {
    if (!canEdit) return;
    if (!confirm(`Clear everything entered for ${date}? This can't be undone.`)) return;
    setClearingDate(date);
    const supabase = createClient();
    await supabase.from("planner_entries").delete().eq("user_id", targetUserId).eq("log_date", date);
    setClearingDate(null);
    setValuesByDate((prev) => {
      const next = { ...prev };
      delete next[date];
      return next;
    });
    setDirtyDates((prev) => {
      const next = new Set(prev);
      next.delete(date);
      return next;
    });
  }

  function toggleRowHighlight(date: string) {
    setHighlightedRows((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function toggleColHighlight(key: string) {
    setHighlightedCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function renderCell(date: string, col: PlannerColumn) {
    const raw = valuesByDate[date]?.[col.key];
    const disabled = !canEdit;
    const colHighlighted = highlightedCols.has(col.key);

    if (col.field_type === "checkbox") {
      return (
        <input
          type="checkbox"
          checked={!!raw}
          disabled={disabled}
          onChange={(e) => setCellValue(date, col.key, e.target.checked)}
          className="w-5 h-5"
        />
      );
    }
    if (col.field_type === "textarea") {
      return (
        <textarea
          value={(raw as string) ?? ""}
          disabled={disabled}
          onChange={(e) => setCellValue(date, col.key, e.target.value)}
          rows={1}
          className={`input text-sm py-1.5 px-2 min-w-[160px] w-full resize-y text-slate-100 ${
            colHighlighted ? "border-amber-500" : ""
          }`}
        />
      );
    }
    if (col.field_type === "number") {
      return (
        <input
          type="number"
          value={(raw as string) ?? ""}
          disabled={disabled}
          onChange={(e) => setCellValue(date, col.key, e.target.value)}
          className={`input text-sm py-1.5 px-2 w-24 font-medium text-slate-100 ${
            colHighlighted ? "border-amber-500" : ""
          }`}
        />
      );
    }
    return (
      <input
        type="text"
        value={(raw as string) ?? ""}
        disabled={disabled}
        onChange={(e) => setCellValue(date, col.key, e.target.value)}
        className={`input text-sm py-1.5 px-2 min-w-[160px] w-full text-slate-100 ${
          colHighlighted ? "border-amber-500" : ""
        }`}
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

      {canEdit && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={saveAll}
            disabled={saving || dirtyDates.size === 0}
            className="btn-primary text-sm"
          >
            {saving ? "Saving..." : dirtyDates.size > 0 ? `Save changes (${dirtyDates.size})` : "Save changes"}
          </button>
          {saveMessage && <p className="text-xs text-green-400">{saveMessage}</p>}
          {saveError && <p className="text-xs text-red-400">{saveError}</p>}
          {!saveMessage && !saveError && dirtyDates.size === 0 && (
            <p className="text-xs text-slate-500">
              Click a cell to edit, then Save - nothing reaches the student until you save. Click a row's
              day/date or a column header to highlight it.
            </p>
          )}
        </div>
      )}

      <div className="overflow-x-auto border border-slate-800 rounded-xl">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-900 text-left">
              <th className="px-2 py-2 text-xs font-semibold text-slate-400" />
              <th className="px-3 py-2 text-xs font-semibold text-slate-400 sticky left-0 bg-slate-900">Day</th>
              <th className="px-3 py-2 text-xs font-semibold text-slate-400">Date</th>
              {activeColumns.map((c) => (
                <th key={c.id} className="px-3 py-2 text-xs font-semibold text-slate-400 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleColHighlight(c.key)}
                    className={`hover:text-amber-400 transition ${
                      highlightedCols.has(c.key) ? "text-amber-400" : ""
                    }`}
                    title="Click to highlight this column"
                  >
                    {c.label}
                  </button>
                </th>
              ))}
              {canEdit && <th className="px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {dates.map((date) => {
              const rowHighlighted = highlightedRows.has(date);
              const expanded = expandedDates.has(date);
              const colCount = 3 + activeColumns.length + (canEdit ? 1 : 0);
              return (
                <Fragment key={date}>
                  <tr
                    className={`border-t border-slate-800 ${date === today ? "bg-brand-900/10" : ""} ${
                      rowHighlighted ? "bg-amber-900/20" : ""
                    } ${dirtyDates.has(date) ? "outline outline-1 outline-brand-500/40" : ""}`}
                  >
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(date)}
                        className="text-slate-500 hover:text-brand-400 transition"
                        title={expanded ? "Collapse day" : "Expand day (UWorld blocks and more)"}
                      >
                        {expanded ? "▾" : "▸"}
                      </button>
                    </td>
                    <td
                      onClick={() => toggleRowHighlight(date)}
                      className="px-3 py-1.5 text-xs text-slate-400 whitespace-nowrap sticky left-0 bg-[#0a0a0a] cursor-pointer hover:text-amber-400"
                      title="Click to highlight this row"
                    >
                      {weekdayOf(date)}
                    </td>
                    <td
                      onClick={() => toggleRowHighlight(date)}
                      className="px-3 py-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer"
                    >
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
                    {canEdit && (
                      <td className="px-2 py-1">
                        <button
                          type="button"
                          onClick={() => clearDay(date)}
                          disabled={clearingDate === date}
                          className="text-xs text-red-400 hover:text-red-300 whitespace-nowrap"
                        >
                          {clearingDate === date ? "Clearing..." : "Clear"}
                        </button>
                      </td>
                    )}
                  </tr>
                  {expanded && (
                    <tr className="border-t border-slate-800 bg-slate-950/40">
                      <td colSpan={colCount} className="px-4 py-4">
                        <UWorldBlockTracker
                          targetUserId={targetUserId}
                          date={date}
                          initialBlocks={blocksByDate[date] ?? []}
                          canEdit={canEdit}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
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
