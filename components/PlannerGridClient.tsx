"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PlannerColumn, PlannerEntry, StudyResource } from "@/lib/plannerColumns";
import type { UWorldBlock } from "@/lib/uworldBlocks";
import { groupBlocksByDate } from "@/lib/uworldBlocks";
import type { MentorDailyNote, DayStatus } from "@/lib/mentorDailyNotes";
import { groupNotesByDate, DAY_STATUS_LABEL } from "@/lib/mentorDailyNotes";
import type { PlanTask } from "@/lib/planTasks";
import { groupTasksByDate } from "@/lib/planTasks";
import UWorldBlockTracker from "./UWorldBlockTracker";
import DailySummary from "./DailySummary";
import AssignmentsChecklist from "./AssignmentsChecklist";
import MoodPicker from "./MoodPicker";
import StudyIssueSelector from "./StudyIssueSelector";
import ResourcesUsedChecklist from "./ResourcesUsedChecklist";
import DailyReflection from "./DailyReflection";
import { computeInitialPlannerRange } from "@/lib/plannerSettings";
import { easternDateStringNow } from "@/lib/timezone";
import { computeGridPlanProgress, computeDayBadge, isDateEditable } from "@/lib/planProgress";
import MentorDailyNoteCell from "./MentorDailyNoteCell";
import StudyPlanProgressBar from "./StudyPlanProgressBar";

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Study Planner v1 item 7 (Mentor Checklist) - badge colors for the
// mentor's day rating, shown read-only alongside Mentor Notes below.
const MENTOR_STATUS_BADGE: Record<DayStatus, string> = {
  completed: "bg-green-900/40 text-green-400",
  needs_improvement: "bg-yellow-900/40 text-yellow-400",
  missed: "bg-red-900/40 text-red-400",
  rescheduled: "bg-slate-700 text-slate-300",
};

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

/**
 * Remembers the range a student/mentor last explicitly jumped to (via "Jump
 * to date"), so reloading the page doesn't silently snap back to the
 * mentor-anchored start date or the default "centered on today" window -
 * the whole point of jumping somewhere was to keep looking at it. Scoped
 * per-student (targetUserId) so a mentor browsing several students' grids
 * from the same browser doesn't cross-contaminate each other's saved spot.
 */
function plannerRangeStorageKey(targetUserId: string): string {
  return `master-grid-planner-range-${targetUserId}`;
}

function loadPersistedRange(targetUserId: string): { rangeStart: string; rangeEnd: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(plannerRangeStorageKey(targetUserId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.rangeStart === "string" && typeof parsed?.rangeEnd === "string") {
      return { rangeStart: parsed.rangeStart, rangeEnd: parsed.rangeEnd };
    }
  } catch {
    // Malformed or unavailable storage (e.g. private browsing) - just fall
    // back to the default range below.
  }
  return null;
}

function savePersistedRange(targetUserId: string, rangeStart: string, rangeEnd: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      plannerRangeStorageKey(targetUserId),
      JSON.stringify({ rangeStart, rangeEnd })
    );
  } catch {
    // Storage unavailable - jumping still works for this session, it just
    // won't survive a reload.
  }
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
  initialMentorNotes = [],
  initialPlanTasks = [],
  studyResources = [],
  canEdit = true,
  startDate = null,
  mentorId = null,
  enforceEditWindow = false,
}: {
  targetUserId: string;
  columns: PlannerColumn[];
  initialEntries: PlannerEntry[];
  initialBlocks?: UWorldBlock[];
  initialMentorNotes?: MentorDailyNote[];
  initialPlanTasks?: PlanTask[];
  studyResources?: StudyResource[];
  canEdit?: boolean;
  // Mentor-set date this student's plan starts on (student_planner_settings).
  // When present, the grid's default range starts there and keeps growing
  // forward instead of always centering on "today" - see
  // lib/plannerSettings.ts.
  startDate?: string | null;
  // When a mentor (not the student, not an admin browsing generically) is
  // viewing this grid, passing their mentor id turns the read-only Mentor
  // Notes block in each day's expanded panel into an editable
  // MentorDailyNoteCell - lets them write the note without leaving the grid.
  // Left null for the student's own /planner view and the plain admin view,
  // both of which keep the old read-only-display behavior.
  mentorId?: string | null;
  // Locks every day older than yesterday to read-only (see isDateEditable
  // in lib/planProgress.ts) - only ever turned on for a student editing
  // their OWN grid (app/planner/page.tsx). Left off for mentors/admins
  // editing a student's grid on their behalf, since they legitimately need
  // to backfill or correct older days.
  enforceEditWindow?: boolean;
}) {
  // Eastern Time, not the browser's local clock - two students in different
  // timezones (or a server-rendered "today" vs. a browser's) should always
  // agree on which row is "TODAY".
  const today = easternDateStringNow();
  const activeColumns = useMemo(
    () => columns.filter((c) => c.active).sort((a, b) => a.sort_order - b.sort_order),
    [columns]
  );
  // Student Notes (Study Planner v1 item 4) is pulled out of the flat grid
  // and rendered as a dedicated journal box in each day's expanded panel
  // instead - a paragraph-length daily journal doesn't belong crammed into
  // a table cell next to number inputs. Everything else still renders as a
  // normal grid column.
  // Daily Mood (item 9) gets the same "pulled out of the flat grid,
  // rendered specially in the expanded panel" treatment as Student Notes -
  // one-click emoji buttons don't belong in a dense table cell either.
  const mainColumns = useMemo(
    () =>
      activeColumns.filter(
        (c) =>
          c.key !== "student_notes" &&
          c.key !== "mood" &&
          c.key !== "study_issue" &&
          c.key !== "resources_used" &&
          c.key !== "tomorrow_goal" &&
          c.key !== "reflection_went_well" &&
          c.key !== "reflection_slowed_down" &&
          c.key !== "reflection_improve"
      ),
    [activeColumns]
  );
  const notesColumn = useMemo(() => activeColumns.find((c) => c.key === "student_notes") ?? null, [activeColumns]);
  const moodColumn = useMemo(() => activeColumns.find((c) => c.key === "mood") ?? null, [activeColumns]);
  const issueColumn = useMemo(() => activeColumns.find((c) => c.key === "study_issue") ?? null, [activeColumns]);
  const resourcesColumn = useMemo(
    () => activeColumns.find((c) => c.key === "resources_used") ?? null,
    [activeColumns]
  );
  const tomorrowGoalColumn = useMemo(
    () => activeColumns.find((c) => c.key === "tomorrow_goal") ?? null,
    [activeColumns]
  );
  const reflectionColumn = useMemo(
    () => activeColumns.find((c) => c.key === "reflection_went_well") ?? null,
    [activeColumns]
  );
  const blocksByDate = useMemo(() => groupBlocksByDate(initialBlocks), [initialBlocks]);
  const mentorNotesByDate = useMemo(() => groupNotesByDate(initialMentorNotes), [initialMentorNotes]);
  const planTasksByDate = useMemo(() => groupTasksByDate(initialPlanTasks), [initialPlanTasks]);
  const entryByDate = useMemo(() => {
    const map: Record<string, PlannerEntry> = {};
    for (const e of initialEntries) map[e.log_date] = e;
    return map;
  }, [initialEntries]);
  // How many days of the full grid have been completely filled in, from
  // whenever the mentor set this student's plan start date through today
  // (see lib/planProgress.ts) - grows on its own as more days pass, and
  // readjusts immediately if the mentor moves the start date or changes
  // which columns are active.
  const mentorPlanProgress = useMemo(
    () => computeGridPlanProgress(initialEntries, mainColumns, startDate, today),
    [initialEntries, mainColumns, startDate, today]
  );
  // A day is only actually locked when the caller opted into the edit
  // window (enforceEditWindow - see prop doc above) AND it's outside
  // today/yesterday.
  const isLocked = (date: string) => enforceEditWindow && !isDateEditable(date, today);
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

  const initialRange = useMemo(
    () => computeInitialPlannerRange(startDate, today, initialEntries.map((e) => e.log_date)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [rangeStart, setRangeStart] = useState(initialRange.rangeStart);
  const [rangeEnd, setRangeEnd] = useState(initialRange.rangeEnd);
  const [newDate, setNewDate] = useState("");
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const [dirtyDates, setDirtyDates] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [clearingDate, setClearingDate] = useState<string | null>(null);
  const [highlightedRows, setHighlightedRows] = useState<Set<string>>(new Set());
  const [highlightedCols, setHighlightedCols] = useState<Set<string>>(new Set());
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [dayStatus, setDayStatus] = useState<{ date: string; ok: boolean; message: string } | null>(null);

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

  // Scrolls "Jump to date"'s target row into view once it's actually in the
  // rendered table - if the date required extending rangeStart/rangeEnd,
  // that state update and this effect land in the same render pass, so the
  // row exists in the DOM by the time this runs.
  useEffect(() => {
    if (!scrollTarget) return;
    const el = document.getElementById(`planner-row-${scrollTarget}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setScrollTarget(null);
  }, [scrollTarget, dates]);

  // Restores whatever date range was last explicitly jumped to, if any -
  // client-only (runs after the initial render) so the server-rendered
  // markup still matches on first paint and there's no hydration mismatch.
  // Without this, refreshing the page after "Jump to date" silently snapped
  // back to the default range (mentor-anchored start date, or today ± a
  // week), discarding where the student/mentor had navigated to.
  useEffect(() => {
    const persisted = loadPersistedRange(targetUserId);
    if (persisted) {
      setRangeStart(persisted.rangeStart);
      setRangeEnd(persisted.rangeEnd);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUserId]);

  function setCellValue(date: string, key: string, value: CellValue) {
    setSaveMessage(null);
    setValuesByDate((prev) => ({ ...prev, [date]: { ...(prev[date] ?? {}), [key]: value } }));
    setDirtyDates((prev) => new Set(prev).add(date));
  }

  /**
   * Same as setCellValue, but writes that day's row to the database right
   * away instead of waiting for "Save changes" - for the click-to-choose
   * widgets (Daily Mood, Today's Biggest Issue, Resources Used) where
   * requiring a separate save step just meant the choice silently vanished
   * on refresh if the student forgot to click it. Text/number cells in the
   * main grid still stay staged-until-Save on purpose (typing shouldn't fire
   * a network request per keystroke).
   */
  async function setCellValueAndSave(date: string, key: string, value: CellValue) {
    setSaveMessage(null);
    const updatedRow = { ...(valuesByDate[date] ?? {}), [key]: value };
    setValuesByDate((prev) => ({ ...prev, [date]: updatedRow }));
    if (!canEdit) return;
    const supabase = createClient();
    const { error } = await supabase.from("planner_entries").upsert(
      {
        user_id: targetUserId,
        log_date: date,
        field_values: toFieldValues(updatedRow, activeColumns),
      },
      { onConflict: "user_id,log_date" }
    );
    if (error) {
      setSaveError(error.message);
      return;
    }
    setDirtyDates((prev) => {
      const next = new Set(prev);
      next.delete(date);
      return next;
    });
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

  /**
   * Saves just one day - the "Save this day" button inside an expanded
   * panel (Student Notes, Daily Reflection, Tomorrow's Goal, etc.). Those
   * fields intentionally don't auto-save on every keystroke like the
   * click-to-choose widgets do, but making someone scroll all the way back
   * up to the top "Save changes" button just to not lose a paragraph they
   * just wrote was the actual complaint - this does the same save, right
   * where they're already looking.
   */
  async function saveDay(date: string) {
    if (!canEdit) return;
    setSavingDate(date);
    setDayStatus(null);
    const supabase = createClient();
    const { error } = await supabase.from("planner_entries").upsert(
      {
        user_id: targetUserId,
        log_date: date,
        field_values: toFieldValues(valuesByDate[date] ?? {}, activeColumns),
      },
      { onConflict: "user_id,log_date" }
    );
    setSavingDate(null);
    if (error) {
      setDayStatus({ date, ok: false, message: error.message });
      return;
    }
    setDirtyDates((prev) => {
      const next = new Set(prev);
      next.delete(date);
      return next;
    });
    setDayStatus({ date, ok: true, message: "Saved - visible now." });
  }

  function addSpecificDay() {
    if (!newDate) return;
    // Re-anchors the visible table to start exactly at this date, rather
    // than just making sure the date is somewhere in the existing range -
    // that was the actual ask ("get dates from that date"), not merely
    // scrolling to a row that might already be showing. Keeps at least ~2
    // weeks visible past it, same minimum window the initial load uses.
    const minimumEnd = addDays(newDate, 13);
    const nextRangeEnd = rangeEnd < minimumEnd ? minimumEnd : rangeEnd;
    setRangeStart(newDate);
    if (rangeEnd < minimumEnd) setRangeEnd(nextRangeEnd);
    setValuesByDate((prev) => (prev[newDate] ? prev : { ...prev, [newDate]: {} }));
    setScrollTarget(newDate);
    setNewDate("");
    // Remember this jump so refreshing the page doesn't lose it (see
    // loadPersistedRange/savePersistedRange above).
    savePersistedRange(targetUserId, newDate, nextRangeEnd);
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
    const disabled = !canEdit || isLocked(date);
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
      <StudyPlanProgressBar progress={mentorPlanProgress} />

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
              {mainColumns.map((c) => (
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
              const colCount = 3 + mainColumns.length + (canEdit ? 1 : 0);
              return (
                <Fragment key={date}>
                  <tr
                    id={`planner-row-${date}`}
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
                      className="px-3 py-1.5 text-xs text-slate-400 whitespace-nowrap sticky left-0 bg-white cursor-pointer hover:text-amber-400"
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
                      {isLocked(date) &&
                        (() => {
                          const badge = computeDayBadge(mainColumns, entryByDate[date]);
                          return badge === "done" ? (
                            <span className="ml-1.5 text-green-500" title="Completed - this day is locked">
                              ✓
                            </span>
                          ) : (
                            <span className="ml-1.5 text-red-500" title="Not completed - this day is locked">
                              ✗
                            </span>
                          );
                        })()}
                    </td>
                    {mainColumns.map((c) => (
                      <td key={c.id} className="px-2 py-1">
                        {renderCell(date, c)}
                      </td>
                    ))}
                    {canEdit && (
                      <td className="px-2 py-1">
                        <button
                          type="button"
                          onClick={() => clearDay(date)}
                          disabled={clearingDate === date || isLocked(date)}
                          className="text-xs text-red-400 hover:text-red-300 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {clearingDate === date ? "Clearing..." : "Clear"}
                        </button>
                      </td>
                    )}
                  </tr>
                  {expanded &&
                    (() => {
                      const dayBlocks = blocksByDate[date] ?? [];
                      const rowValues = valuesByDate[date] ?? {};
                      const numOrNull = (raw: CellValue | undefined): number | null => {
                        if (raw === undefined || raw === "" || raw === null) return null;
                        const n = Number(raw);
                        return Number.isNaN(n) ? null : n;
                      };
                      const blockQuestionsSum = dayBlocks.reduce((sum, b) => sum + (b.questions ?? 0), 0);
                      const questionsCompleted =
                        dayBlocks.length > 0 ? blockQuestionsSum : numOrNull(rowValues["q_solved"]);
                      return (
                        <tr className="border-t border-slate-800 bg-slate-950/40">
                          <td colSpan={colCount} className="px-4 py-4 space-y-4">
                            <DailySummary
                              questionsCompleted={questionsCompleted}
                              blocksCount={dayBlocks.length}
                              questionsReviewed={numOrNull(rowValues["q_reviewed"])}
                              hours={numOrNull(rowValues["hours"])}
                              studyCompleted={!!rowValues["task_completed"]}
                            />
                            {moodColumn && (
                              <div className="pt-3 border-t border-slate-800">
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                                  Daily Mood
                                </p>
                                <MoodPicker
                                  value={(rowValues["mood"] as string) ?? ""}
                                  disabled={!canEdit || isLocked(date)}
                                  onChange={(mood) => setCellValueAndSave(date, "mood", mood)}
                                />
                              </div>
                            )}
                            {issueColumn && (
                              <div className="pt-3 border-t border-slate-800">
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                                  Today&apos;s Biggest Issue
                                </p>
                                <StudyIssueSelector
                                  value={(rowValues["study_issue"] as string) ?? ""}
                                  disabled={!canEdit || isLocked(date)}
                                  onChange={(issue) => setCellValueAndSave(date, "study_issue", issue)}
                                />
                              </div>
                            )}
                            {resourcesColumn && (
                              <div className="pt-3 border-t border-slate-800">
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                                  Resources Used
                                </p>
                                <ResourcesUsedChecklist
                                  resources={studyResources}
                                  value={(rowValues["resources_used"] as string) ?? ""}
                                  disabled={!canEdit || isLocked(date)}
                                  onChange={(csv) => setCellValueAndSave(date, "resources_used", csv)}
                                />
                              </div>
                            )}
                            <div className="pt-3 border-t border-slate-800">
                              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                                Assignments
                              </p>
                              <AssignmentsChecklist
                                tasks={planTasksByDate[date] ?? []}
                                editable={canEdit && !isLocked(date)}
                              />
                            </div>
                            <div className="pt-3 border-t border-slate-800">
                              <UWorldBlockTracker
                                targetUserId={targetUserId}
                                date={date}
                                initialBlocks={dayBlocks}
                                canEdit={canEdit && !isLocked(date)}
                              />
                            </div>
                            {notesColumn && (
                              <div className="pt-3 border-t border-slate-800">
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                                  Student Notes
                                </p>
                                <textarea
                                  value={(rowValues["student_notes"] as string) ?? ""}
                                  // Always read-only when a mentor is viewing (mentorId set), even
                                  // though everything else on this grid is mentor-editable - this is
                                  // the student's own journal, kept one-directional on purpose.
                                  disabled={!canEdit || !!mentorId || isLocked(date)}
                                  onChange={(e) => setCellValue(date, "student_notes", e.target.value)}
                                  rows={4}
                                  placeholder="Today's goals, what you struggled with, what to review tomorrow..."
                                  className="input text-sm py-2 px-2.5 w-full resize-y text-slate-100"
                                />
                                <p className="text-[11px] text-slate-500 mt-1">
                                  {mentorId
                                    ? "The student's own journal - you can read it but can't edit it."
                                    : "Your study journal - your mentor can read this but can't edit it. Saved with the rest of the day via \"Save changes\" above."}
                                </p>
                              </div>
                            )}
                            {reflectionColumn && (
                              <div className="pt-3 border-t border-slate-800">
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                                  Daily Reflection
                                </p>
                                <DailyReflection
                                  wentWell={(rowValues["reflection_went_well"] as string) ?? ""}
                                  slowedDown={(rowValues["reflection_slowed_down"] as string) ?? ""}
                                  improve={(rowValues["reflection_improve"] as string) ?? ""}
                                  disabled={!canEdit || isLocked(date)}
                                  onChangeWentWell={(v) => setCellValue(date, "reflection_went_well", v)}
                                  onChangeSlowedDown={(v) => setCellValue(date, "reflection_slowed_down", v)}
                                  onChangeImprove={(v) => setCellValue(date, "reflection_improve", v)}
                                />
                                <p className="text-[11px] text-slate-500 mt-1">
                                  Saved with the rest of the day via "Save changes" above - your mentor can see
                                  this too.
                                </p>
                              </div>
                            )}
                            {tomorrowGoalColumn && (
                              <div className="pt-3 border-t border-slate-800">
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                                  Tomorrow&apos;s Goal
                                </p>
                                <textarea
                                  value={(rowValues["tomorrow_goal"] as string) ?? ""}
                                  disabled={!canEdit || isLocked(date)}
                                  onChange={(e) => setCellValue(date, "tomorrow_goal", e.target.value)}
                                  rows={2}
                                  placeholder="What's the plan for tomorrow?"
                                  className="input text-sm py-2 px-2.5 w-full resize-y text-slate-100"
                                />
                                <p className="text-[11px] text-slate-500 mt-1">
                                  Saved with the rest of the day via "Save changes" above - your mentor can see
                                  this too.
                                </p>
                              </div>
                            )}
                            {(mentorId ||
                              mentorNotesByDate[date]?.content ||
                              mentorNotesByDate[date]?.status ||
                              mentorNotesByDate[date]?.reviewed ||
                              mentorNotesByDate[date]?.next_checkin_date) && (
                              <div className="pt-3 border-t border-slate-800">
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                                  Mentor Notes
                                </p>
                                {mentorId ? (
                                  <MentorDailyNoteCell
                                    studentId={targetUserId}
                                    mentorId={mentorId}
                                    date={date}
                                    initialContent={mentorNotesByDate[date]?.content ?? ""}
                                    initialStatus={mentorNotesByDate[date]?.status ?? null}
                                    initialReviewed={mentorNotesByDate[date]?.reviewed ?? false}
                                    initialReviewedAt={mentorNotesByDate[date]?.reviewed_at ?? null}
                                    initialNextCheckinDate={mentorNotesByDate[date]?.next_checkin_date ?? null}
                                  />
                                ) : (
                                  <>
                                    <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                                      {mentorNotesByDate[date].status && (
                                        <span
                                          className={`inline-block text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${
                                            MENTOR_STATUS_BADGE[mentorNotesByDate[date].status as DayStatus]
                                          }`}
                                        >
                                          {DAY_STATUS_LABEL[mentorNotesByDate[date].status as DayStatus]}
                                        </span>
                                      )}
                                      {mentorNotesByDate[date].reviewed && (
                                        <span className="inline-block text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-brand-900/40 text-brand-400">
                                          ✓ Reviewed
                                          {mentorNotesByDate[date].reviewed_at
                                            ? ` ${new Date(mentorNotesByDate[date].reviewed_at as string).toLocaleDateString()}`
                                            : ""}
                                        </span>
                                      )}
                                    </div>
                                    {mentorNotesByDate[date].content && (
                                      <p className="text-sm text-slate-200 whitespace-pre-wrap">
                                        {mentorNotesByDate[date].content}
                                      </p>
                                    )}
                                    {mentorNotesByDate[date].next_checkin_date && (
                                      <p className="text-[11px] text-slate-400 mt-1">
                                        Next check-in: {mentorNotesByDate[date].next_checkin_date}
                                      </p>
                                    )}
                                    <p className="text-[11px] text-slate-500 mt-1">
                                      From your mentor - you can read this but can't edit it.
                                    </p>
                                  </>
                                )}
                              </div>
                            )}
                            {canEdit && isLocked(date) && (
                              <p className="text-xs text-slate-500 pt-3 border-t border-slate-800">
                                This day is locked - you can only update today's and yesterday's planner.
                              </p>
                            )}
                            {canEdit && !isLocked(date) && (
                              <div className="flex items-center gap-3 pt-3 border-t border-slate-800">
                                <button
                                  type="button"
                                  onClick={() => saveDay(date)}
                                  disabled={savingDate === date}
                                  className="btn-primary text-xs"
                                >
                                  {savingDate === date ? "Saving..." : "Save this day"}
                                </button>
                                <p className="text-xs text-slate-500">
                                  Saves everything above in this expanded day - notes, reflection, goal, and
                                  the row at the top.
                                </p>
                                {dayStatus && dayStatus.date === date && (
                                  <p className={`text-xs ${dayStatus.ok ? "text-green-400" : "text-red-400"}`}>
                                    {dayStatus.message}
                                  </p>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })()}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {mainColumns.length === 0 && (
        <p className="text-sm text-slate-400">
          No planner columns are set up yet - an admin can add some from Planner Settings.
        </p>
      )}
    </div>
  );
}
