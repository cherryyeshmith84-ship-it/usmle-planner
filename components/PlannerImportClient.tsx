"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface ImportStudent {
  id: string;
  name: string;
  email: string;
  mentorId: string | null;
  startDate: string | null;
}

type Category = "question_block" | "reading" | "review" | "video" | "other";

interface ParsedTask {
  /** Days after the first task's date (or Day number - 1). */
  dayOffset: number;
  /** Original sheet date (UTC ms) when the sheet has real dates, else null. */
  dateMs: number | null;
  title: string;
  detail: string | null;
  category: Category;
  minutes: number | null;
  optional: boolean;
}

type Cell = unknown;
type Rows = Cell[][];

const XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";

function loadXlsx(): Promise<any> {
  const w = window as any;
  if (w.XLSX) return Promise.resolve(w.XLSX);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = XLSX_URL;
    s.onload = () => resolve(w.XLSX);
    s.onerror = () => reject(new Error("Couldn't load the Excel reader. Check your connection and try again."));
    document.head.appendChild(s);
  });
}

const DAY_MS = 86400000;

function isoFromUtc(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}
function utcFromIso(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function addDays(iso: string, n: number) {
  return isoFromUtc(utcFromIso(iso) + n * DAY_MS);
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Excel serial (2009-2064), Date, ISO string, "D/M/YYYY" or "D Mon YYYY" -> UTC midnight ms, or null. */
function parseDateCell(v: Cell): number | null {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  if (typeof v === "number") {
    if (v > 40000 && v < 60000) return Math.floor(Date.UTC(1899, 11, 30) + v * DAY_MS);
    return null;
  }
  if (v instanceof Date) return Date.UTC(v.getFullYear(), v.getMonth(), v.getDate());
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/); // day/month/year
  if (m) return Date.UTC(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]);
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})$/);
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) return Date.UTC(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  return null;
}

function normHeader(h: Cell) {
  return String(h ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
}

function colLetter(i: number) {
  let s = "";
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function toCategory(v: Cell): Category {
  const s = String(v ?? "").toLowerCase();
  if (/question|block|qbank|uworld|\bq\b|\d+\s*q\b/.test(s)) return "question_block";
  if (/read|first aid|notes/.test(s)) return "reading";
  if (/review|anki|revise|error/.test(s)) return "review";
  if (/video|lecture|sketchy|boards|bnb|pathoma/.test(s)) return "video";
  return "other";
}

const WEEKDAY = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*$/i;

function isTextCell(v: Cell) {
  return typeof v === "string" && v.trim() !== "" && !/^(true|false)$/i.test(v.trim());
}

/* ------------------------------------------------------------------ */
/* Structured format (the downloadable template): Day/Date + Task      */
/* ------------------------------------------------------------------ */

function parseStructured(rows: Rows): { tasks: ParsedTask[]; warnings: string[] } | null {
  const headerIdx = rows.findIndex((r) =>
    r.some((c) => ["task", "title", "topic", "assignment"].includes(normHeader(c)))
  );
  if (headerIdx < 0) return null;
  const headers = rows[headerIdx].map(normHeader);
  const col = (...names: string[]) => headers.findIndex((h) => names.includes(h));
  const cTask = col("task", "title", "topic", "assignment");
  const cDay = col("day", "dayno", "daynumber");
  const cDate = col("date");
  if (cDay < 0 && cDate < 0) return null;
  const cDetail = col("details", "detail", "notes", "note", "description");
  const cType = col("type", "category", "resource");
  const cMin = col("minutes", "mins", "min", "time", "estimatedminutes");
  const cOpt = col("optional");

  const warnings: string[] = [];
  const raw: { key: number; t: Omit<ParsedTask, "dayOffset" | "dateMs"> }[] = [];
  rows.slice(headerIdx + 1).forEach((r, i) => {
    const title = String(r[cTask] ?? "").trim();
    if (!title) return;
    let key: number | null = null;
    if (cDay >= 0) {
      const n = Number(String(r[cDay]).replace(/[^0-9.]/g, ""));
      key = Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
    } else {
      key = parseDateCell(r[cDate]);
    }
    if (key === null) {
      warnings.push(`Row ${headerIdx + i + 2} ("${title}") skipped: no valid ${cDay >= 0 ? "day" : "date"}.`);
      return;
    }
    const minRaw = cMin >= 0 ? Number(String(r[cMin]).replace(/[^0-9.]/g, "")) : NaN;
    raw.push({
      key,
      t: {
        title,
        detail: cDetail >= 0 && String(r[cDetail]).trim() ? String(r[cDetail]).trim() : null,
        category: cType >= 0 ? toCategory(r[cType]) : toCategory(title),
        minutes: Number.isFinite(minRaw) && minRaw > 0 ? Math.round(minRaw) : null,
        optional: cOpt >= 0 ? /^(y|yes|true|1|optional)/i.test(String(r[cOpt]).trim()) : false,
      },
    });
  });
  if (raw.length === 0) return null;
  const base = Math.min(...raw.map((x) => x.key));
  const tasks = raw.map((x) => ({
    ...x.t,
    dayOffset: cDay >= 0 ? x.key - 1 : Math.round((x.key - base) / DAY_MS),
    dateMs: cDay >= 0 ? null : x.key,
  }));
  return { tasks, warnings };
}

/* ------------------------------------------------------------------ */
/* Free-form grids: one date column + one or more "what to do" columns */
/* ------------------------------------------------------------------ */

interface GridDetect {
  dateCol: number;
  /** Row index of the header labels (or -1 if none was found). */
  headerIdx: number;
  firstDateRow: number;
  candidates: number[];
  preselected: number[];
  dateRows: number;
}

function detectGrid(rows: Rows): GridDetect | null {
  const ncols = Math.max(0, ...rows.map((r) => r.length));
  let bestCol = -1;
  let bestCount = 0;
  for (let c = 0; c < ncols; c++) {
    let n = 0;
    for (const r of rows) if (parseDateCell(r[c]) !== null) n++;
    if (n > bestCount) {
      bestCount = n;
      bestCol = c;
    }
  }
  if (bestCol < 0 || bestCount < 3) return null;

  const firstDateRow = rows.findIndex((r) => parseDateCell(r[bestCol]) !== null);
  const textCount = (r: Cell[] | undefined, skip: number) =>
    (r ?? []).filter((v, c) => c !== skip && isTextCell(v)).length;
  // Header labels sit on the row just above the first date (a mid-sheet table),
  // or ARE the first row when it holds a date plus several text labels.
  let headerIdx = -1;
  if (firstDateRow > 0 && textCount(rows[firstDateRow - 1], bestCol) >= 2) headerIdx = firstDateRow - 1;
  else if (firstDateRow === 0 && textCount(rows[0], bestCol) >= 3) headerIdx = 0;
  const firstDataRow = headerIdx >= 0 ? headerIdx + 1 : firstDateRow;

  const candidates: number[] = [];
  for (let c = 0; c < ncols; c++) {
    if (c === bestCol) continue;
    const texts: string[] = [];
    rows.slice(firstDataRow).forEach((r) => {
      if (parseDateCell(r[bestCol]) !== null && isTextCell(r[c])) texts.push(String(r[c]).trim());
    });
    if (texts.length === 0) continue;
    const weekdayShare = texts.filter((t) => WEEKDAY.test(t)).length / texts.length;
    if (weekdayShare >= 0.8) continue; // a "Monday, Tuesday..." column
    candidates.push(c);
  }

  const hdr = (c: number) => (headerIdx >= 0 ? String(rows[headerIdx]?.[c] ?? "") : "");
  const named = candidates.filter((c) => /plan|task|topic|assign|todo|to do|study|resource|schedule|notes?/i.test(hdr(c)));
  return {
    dateCol: bestCol,
    headerIdx,
    firstDateRow,
    candidates,
    preselected: named.length > 0 ? named : candidates,
    dateRows: bestCount,
  };
}

function parseGrid(
  rows: Rows,
  dateCol: number,
  taskCols: number[],
  headerIdx: number
): { tasks: ParsedTask[]; warnings: string[] } {
  const start = headerIdx >= 0 ? headerIdx + 1 : 0;
  const hdr = (c: number) => (headerIdx >= 0 ? String(rows[headerIdx]?.[c] ?? "").trim() : "");
  const found: { dateMs: number; title: string; col: number }[] = [];
  rows.slice(start).forEach((r) => {
    const dateMs = parseDateCell(r[dateCol]);
    if (dateMs === null) return;
    for (const c of taskCols) {
      if (!isTextCell(r[c])) continue;
      found.push({ dateMs, title: String(r[c]).trim(), col: c });
    }
  });
  if (found.length === 0) return { tasks: [], warnings: [] };
  const base = Math.min(...found.map((f) => f.dateMs));
  const prefix = taskCols.length > 1;
  const tasks: ParsedTask[] = found.map((f) => {
    const label = hdr(f.col);
    const title = prefix && label && !/^https?:/i.test(label) ? `${label}: ${f.title}` : f.title;
    return {
      dayOffset: Math.round((f.dateMs - base) / DAY_MS),
      dateMs: f.dateMs,
      title,
      detail: null,
      category: toCategory(f.title),
      minutes: null,
      optional: false,
    };
  });
  return { tasks, warnings: [] };
}

async function downloadTemplate() {
  const XLSX = await loadXlsx();
  const data = [
    ["Day", "Task", "Details", "Type", "Minutes", "Optional"],
    [1, "UWorld - Cardiovascular (40 questions)", "Timed, random", "Question block", 90, "No"],
    [1, "Boards & Beyond - Cardiology videos", "", "Video", 120, "No"],
    [1, "Anki review", "", "Review", 45, "No"],
    [2, "UWorld - Cardiovascular review", "Review incorrects", "Review", 60, "No"],
    [2, "First Aid - Cardiovascular", "", "Reading", 60, "Yes"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 6 }, { wch: 44 }, { wch: 28 }, { wch: 16 }, { wch: 9 }, { wch: 9 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Plan");
  XLSX.writeFile(wb, "master-grid-planner-template.xlsx");
}

function sheetRows(XLSX: any, wb: any, name: string): Rows {
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: "" }) as Rows;
}

export default function PlannerImportClient({ students }: { students: ImportStudent[] }) {
  const [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [shiftToStart, setShiftToStart] = useState(true);
  const [setPlannerStart, setSetPlannerStart] = useState(true);
  const [replace, setReplace] = useState(false);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  // Workbook state
  const [wbState, setWbState] = useState<{ XLSX: any; wb: any; names: string[] } | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [rows, setRows] = useState<Rows>([]);
  const [grid, setGrid] = useState<GridDetect | null>(null);
  const [dateCol, setDateCol] = useState(0);
  const [taskCols, setTaskCols] = useState<number[]>([]);
  const [headerOn, setHeaderOn] = useState(false);

  // Row holding the column labels (-1 = none). Auto-detected, can be switched off.
  const headerIdx = useMemo(() => {
    if (!grid || !headerOn) return -1;
    if (grid.headerIdx >= 0) return grid.headerIdx;
    return Math.max(0, grid.firstDateRow - 1);
  }, [grid, headerOn]);

  const structured = useMemo(() => (rows.length ? parseStructured(rows) : null), [rows]);

  const parsed = useMemo(() => {
    if (!rows.length) return null;
    if (structured) return { ...structured, mode: "template" as const };
    if (!grid) return null;
    const g = parseGrid(rows, dateCol, taskCols, headerIdx);
    return { ...g, mode: "grid" as const };
  }, [rows, structured, grid, dateCol, taskCols, headerIdx]);

  const hasRealDates = !!parsed && parsed.tasks.some((t) => t.dateMs !== null);
  const needsStart = shiftToStart || !hasRealDates;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
  }, [students, search]);
  const student = students.find((s) => s.id === studentId) ?? null;

  const byDay = useMemo(() => {
    if (!parsed || parsed.tasks.length === 0) return [] as { date: string; tasks: ParsedTask[] }[];
    if (needsStart && !startDate) return [];
    const map = new Map<string, ParsedTask[]>();
    for (const t of parsed.tasks) {
      const d = needsStart ? addDays(startDate, t.dayOffset) : isoFromUtc(t.dateMs as number);
      (map.get(d) ?? map.set(d, []).get(d)!).push(t);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, tasks]) => ({ date, tasks }));
  }, [parsed, startDate, needsStart]);

  function applySheet(XLSX: any, wb: any, name: string) {
    const r = sheetRows(XLSX, wb, name);
    setSheetName(name);
    setRows(r);
    const g = detectGrid(r);
    setGrid(g);
    if (g) {
      setDateCol(g.dateCol);
      setTaskCols(g.preselected);
      setHeaderOn(g.headerIdx >= 0);
    } else {
      setTaskCols([]);
    }
  }

  function bestSheet(XLSX: any, wb: any, names: string[]) {
    let best = names[0];
    let bestScore = -1;
    for (const n of names) {
      const r = sheetRows(XLSX, wb, n);
      const score = parseStructured(r) ? 1e6 : detectGrid(r)?.dateRows ?? 0;
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }
    return best;
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setError(null);
    setDone(null);
    setFileName(f.name);
    try {
      const XLSX = await loadXlsx();
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const names: string[] = wb.SheetNames;
      setWbState({ XLSX, wb, names });
      applySheet(XLSX, wb, bestSheet(XLSX, wb, names));
    } catch (err: any) {
      setWbState(null);
      setRows([]);
      setGrid(null);
      setError(err.message || "Couldn't read that file.");
    }
  }

  function clearAll() {
    setWbState(null);
    setRows([]);
    setGrid(null);
    setFileName("");
    setSheetName("");
  }

  function pickStudent(id: string) {
    setStudentId(id);
    setDone(null);
    const s = students.find((x) => x.id === id);
    if (s?.startDate && !startDate) setStartDate(s.startDate);
  }

  function toggleCol(c: number) {
    setTaskCols((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c].sort((a, b) => a - b)));
  }

  const colLabel = (c: number) => {
    const h = headerIdx >= 0 ? String(rows[headerIdx]?.[c] ?? "").trim() : "";
    const sample = rows
      .slice(headerIdx >= 0 ? headerIdx + 1 : 0)
      .map((r) => r[c])
      .find((v) => isTextCell(v));
    const shortHeader = h.length > 28 ? h.slice(0, 28) + "…" : h;
    const shortSample = sample ? String(sample).slice(0, 28) : "";
    return `${colLetter(c)}${shortHeader ? ` - ${shortHeader}` : ""}${shortSample ? ` (e.g. "${shortSample}")` : ""}`;
  };

  async function importPlan() {
    if (!student || !parsed || byDay.length === 0) return;
    setBusy(true);
    setError(null);
    setDone(null);
    const supabase = createClient();
    const firstDate = byDay[0].date;

    if (replace) {
      const { error: delErr } = await supabase
        .from("mentor_plan_tasks")
        .delete()
        .eq("student_id", student.id)
        .eq("source", "mentor")
        .gte("task_date", firstDate);
      if (delErr) {
        setBusy(false);
        setError(delErr.message);
        return;
      }
    }

    const insertRows = byDay.flatMap(({ date, tasks }) =>
      tasks.map((t, i) => ({
        student_id: student.id,
        mentor_id: student.mentorId,
        task_date: date,
        title: t.title,
        detail: t.detail,
        category: t.category,
        is_optional: t.optional,
        estimated_minutes: t.minutes,
        sort_order: i,
        source: "mentor",
      }))
    );

    for (let i = 0; i < insertRows.length; i += 200) {
      const { error: insErr } = await supabase.from("mentor_plan_tasks").insert(insertRows.slice(i, i + 200));
      if (insErr) {
        setBusy(false);
        setError(`Import stopped part-way: ${insErr.message}`);
        return;
      }
    }

    if (setPlannerStart) {
      await supabase
        .from("student_planner_settings")
        .upsert(
          { student_id: student.id, start_date: firstDate, updated_at: new Date().toISOString() },
          { onConflict: "student_id" }
        );
    }

    setBusy(false);
    setDone(
      `Imported ${insertRows.length} task${insertRows.length === 1 ? "" : "s"} across ${byDay.length} day${
        byDay.length === 1 ? "" : "s"
      } (${firstDate} to ${byDay[byDay.length - 1].date}) into ${student.name}'s planner.`
    );
    clearAll();
  }

  const canImport = !!student && !!parsed && byDay.length > 0 && !busy;
  const noDateGridMessage = rows.length > 0 && !structured && !grid;

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <div>
          <label className="label">Find a student</label>
          <input
            className="input mb-2"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="input" value={studentId} onChange={(e) => pickStudent(e.target.value)}>
            <option value="">Select a student ({filtered.length})</option>
            {filtered.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} - {s.email}
              </option>
            ))}
          </select>
          {student && !student.mentorId && (
            <p className="text-xs text-slate-500 mt-1">
              This student has no mentor linked - tasks will still appear in their planner, just not tied to a mentor.
            </p>
          )}
        </div>

        <div>
          <label className="label">Plan starts on</label>
          <input type="date" className="input !w-48" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <p className="text-xs text-slate-500 mt-1">
            The first task in the sheet lands on this date and the rest follow in the same order and spacing.
          </p>
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm font-semibold">Upload the Excel sheet</p>
          <button
            type="button"
            onClick={() => downloadTemplate().catch((e) => setError(e.message))}
            className="text-xs font-semibold text-brand-400 hover:text-brand-300"
          >
            Download template
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Works with the template, or with your own planner: any sheet that has a date column and a column saying what to
          study that day (like a &ldquo;plan&rdquo; column). You choose the sheet and which columns become tasks. .xlsx,
          .xls and .csv work.
        </p>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="text-sm text-slate-300" />
        {fileName && <p className="text-xs text-slate-500">{fileName}</p>}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {done && <p className="text-sm text-green-400">{done}</p>}

      {wbState && (
        <div className="card space-y-4">
          {wbState.names.length > 1 && (
            <div>
              <label className="label">Sheet</label>
              <select
                className="input"
                value={sheetName}
                onChange={(e) => applySheet(wbState.XLSX, wbState.wb, e.target.value)}
              >
                {wbState.names.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Pick the tab that has the day-by-day plan. I preselected the one that looks most like a planner.
              </p>
            </div>
          )}

          {structured && (
            <p className="text-xs text-green-400">Template format recognised (Day/Date + Task columns).</p>
          )}

          {noDateGridMessage && (
            <p className="text-sm text-amber-400">
              This sheet has no date column I can use (I need at least 3 dates in one column). Pick another sheet, or
              use the template.
            </p>
          )}

          {!structured && grid && (
            <div className="space-y-3">
              <div>
                <label className="label">Date column</label>
                <select className="input !w-auto" value={dateCol} onChange={(e) => setDateCol(Number(e.target.value))}>
                  {Array.from({ length: Math.max(0, ...rows.map((r) => r.length)) }, (_, c) => c).map((c) => (
                    <option key={c} value={c}>
                      {colLabel(c)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Which columns become tasks?</label>
                <div className="space-y-1.5">
                  {grid.candidates.map((c) => (
                    <label key={c} className="flex items-start gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 mt-0.5"
                        checked={taskCols.includes(c)}
                        onChange={() => toggleCol(c)}
                      />
                      <span>{colLabel(c)}</span>
                    </label>
                  ))}
                  {grid.candidates.length === 0 && (
                    <p className="text-xs text-slate-500">No text columns found next to the dates.</p>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Tick/untick TRUE/FALSE habit columns and weekday names are left out automatically. Each filled cell
                  becomes one task on that row&apos;s date.
                </p>
              </div>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 mt-0.5"
                  checked={headerOn}
                  onChange={(e) => setHeaderOn(e.target.checked)}
                />
                <span>Use the row above the first date as column labels</span>
              </label>
            </div>
          )}
        </div>
      )}

      {parsed && parsed.tasks.length > 0 && (
        <div className="card space-y-4">
          <div>
            <p className="text-sm font-semibold">Preview</p>
            <p className="text-xs text-slate-400">
              {parsed.tasks.length} task{parsed.tasks.length === 1 ? "" : "s"}
              {byDay.length > 0
                ? ` across ${byDay.length} day${byDay.length === 1 ? "" : "s"}, ${byDay[0].date} to ${byDay[byDay.length - 1].date}`
                : " - choose a start date above to see the dates"}
              .
            </p>
            {parsed.warnings.length > 0 && (
              <ul className="text-xs text-amber-400 mt-2 space-y-0.5">
                {parsed.warnings.slice(0, 6).map((w) => (
                  <li key={w}>{w}</li>
                ))}
                {parsed.warnings.length > 6 && <li>...and {parsed.warnings.length - 6} more skipped rows.</li>}
              </ul>
            )}
          </div>

          {byDay.length > 0 && (
            <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
              {byDay.map(({ date, tasks }) => (
                <div key={date} className="border border-slate-800 rounded-lg px-3 py-2">
                  <p className="text-xs font-semibold text-slate-400 mb-1">{date}</p>
                  <ul className="text-sm space-y-0.5">
                    {tasks.map((t, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span className="min-w-0">
                          {t.title}
                          {t.optional && <span className="text-slate-500"> (optional)</span>}
                        </span>
                        <span className="text-xs text-slate-500 shrink-0">
                          {t.category.replace("_", " ")}
                          {t.minutes ? ` · ${t.minutes}m` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            {hasRealDates && (
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 mt-0.5"
                  checked={shiftToStart}
                  onChange={(e) => setShiftToStart(e.target.checked)}
                />
                <span>
                  Move the plan to start on the date above
                  <span className="block text-xs text-slate-500">
                    Off = keep the exact dates written in the sheet.
                  </span>
                </span>
              </label>
            )}
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 mt-0.5"
                checked={setPlannerStart}
                onChange={(e) => setSetPlannerStart(e.target.checked)}
              />
              <span>Also set the student&apos;s planner start date to the plan&apos;s first day</span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="w-4 h-4 mt-0.5" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
              <span>
                Replace the student&apos;s existing mentor-assigned tasks from the first day onward
                <span className="block text-xs text-slate-500">
                  Off = imported tasks are added alongside what&apos;s already there.
                </span>
              </span>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={importPlan} disabled={!canImport} className="btn-primary text-sm">
              {busy ? "Importing..." : student ? `Import into ${student.name}'s planner` : "Choose a student first"}
            </button>
            <button type="button" onClick={clearAll} disabled={busy} className="btn-secondary text-sm">
              Clear
            </button>
          </div>
        </div>
      )}

      {parsed && parsed.tasks.length === 0 && !noDateGridMessage && wbState && (
        <p className="text-sm text-amber-400">
          No tasks found with the current choices. Tick at least one task column, or pick a different sheet.
        </p>
      )}
    </div>
  );
}
