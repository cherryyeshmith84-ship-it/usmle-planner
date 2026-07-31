"use client";

import { Fragment, useMemo, useState } from "react";
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
}: {
  targetUserId: string;
  columns: PlannerColumn[];
  initialEntries: PlannerEntry[];
  initialBlocks?: UWorldBlock[];
  initialMentorNotes?: MentorDailyNote[];
  initialPlanTasks?: PlanTask[];
  studyResources?: StudyResource[];
  canEdit?: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
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
                          disabled={clearingDate === date}
                          className="text-xs text-red-400 hover:text-red-300 whitespace-nowrap"
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
                                  disabled={!canEdit}
                                  onChange={(mood) => setCellValue(date, "mood", mood)}
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
                                  disabled={!canEdit}
                                  onChange={(issue) => setCellValue(date, "study_issue", issue)}
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
                                  disabled={!canEdit}
                                  onChange={(csv) => setCellValue(date, "resources_used", csv)}
                                />
                              </div>
                            )}
                            <div className="pt-3 border-t border-slate-800">
                              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                                Assignments
                              </p>
                              <AssignmentsChecklist tasks={planTasksByDate[date] ?? []} />
                            </div>
                            <div className="pt-3 border-t border-slate-800">
                              <UWorldBlockTracker
                                targetUserId={targetUserId}
                                date={date}
                                initialBlocks={dayBlocks}
                                canEdit={canEdit}
                              />
                            </div>
                            {notesColumn && (
                              <div className="pt-3 border-t border-slate-800">
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                                  Student Notes
                                </p>
                                <textarea
                                  value={(rowValues["student_notes"] as string) ?? ""}
                                  disabled={!canEdit}
                                  onChange={(e) => setCellValue(date, "student_notes", e.target.value)}
                                  rows={4}
                                  placeholder="Today's goals, what you struggled with, what to review tomorrow..."
                                  className="input text-sm py-2 px-2.5 w-full resize-y text-slate-100"
                                />
                                <p className="text-[11px] text-slate-500 mt-1">
                                  Your study journal - your mentor can read this but can't edit it. Saved with
                                  the rest of the day via "Save changes" above.
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
                                  disabled={!canEdit}
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
                                  disabled={!canEdit}
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
                            {(mentorNotesByDate[date]?.content ||
                              mentorNotesByDate[date]?.status ||
                              mentorNotesByDate[date]?.reviewed ||
                              mentorNotesByDate[date]?.next_checkin_date) && (
                              <div className="pt-3 border-t border-slate-800">
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                                  Mentor Notes
                                </p>
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
