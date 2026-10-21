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
  dayOffset: number; // 0 = start date
  title: string;
  detail: string | null;
  category: Category;
  minutes: number | null;
  optional: boolean;
}

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

/** Excel serial number, ISO string, "D/M/YYYY" or "D Mon YYYY" -> UTC day number (ms), or null. */
function parseDateCell(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && v > 20000 && v < 80000) {
    return Math.floor(Date.UTC(1899, 11, 30) + v * DAY_MS);
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

function normHeader(h: unknown) {
  return String(h ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
}

function toCategory(v: unknown): Category {
  const s = String(v ?? "").toLowerCase();
  if (/question|block|qbank|uworld|amboss q/.test(s)) return "question_block";
  if (/read|first aid|pathoma notes/.test(s)) return "reading";
  if (/review|anki|revise|error/.test(s)) return "review";
  if (/video|lecture|sketchy|boards|bnb|pathoma/.test(s)) return "video";
  return "other";
}

/**
 * Reads the first sheet. Needs a header row with a Task column plus either
 * a Day column (1, 2, 3...) or a Date column. Optional: Details, Type,
 * Minutes, Optional.
 */
async function parseWorkbook(file: File): Promise<{ tasks: ParsedTask[]; warnings: string[]; mode: "day" | "date" }> {
  const XLSX = await loadXlsx();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });

  const headerIdx = rows.findIndex((r) => r.some((c) => ["task", "title", "topic", "assignment"].includes(normHeader(c))));
  if (headerIdx < 0) throw new Error('Couldn\'t find a header row with a "Task" column.');
  const headers = rows[headerIdx].map(normHeader);
  const col = (...names: string[]) => headers.findIndex((h) => names.includes(h));

  const cTask = col("task", "title", "topic", "assignment");
  const cDay = col("day", "dayno", "daynumber");
  const cDate = col("date");
  const cDetail = col("details", "detail", "notes", "note", "description");
  const cType = col("type", "category", "resource");
  const cMin = col("minutes", "mins", "min", "time", "estimatedminutes");
  const cOpt = col("optional");
  if (cDay < 0 && cDate < 0) throw new Error('Add a "Day" column (1, 2, 3...) or a "Date" column.');

  const warnings: string[] = [];
  const raw: { dayKey: number; title: string; detail: string | null; category: Category; minutes: number | null; optional: boolean }[] = [];

  rows.slice(headerIdx + 1).forEach((r, i) => {
    const title = String(r[cTask] ?? "").trim();
    if (!title) return;
    let dayKey: number | null = null;
    if (cDay >= 0) {
      const n = Number(String(r[cDay]).replace(/[^0-9.]/g, ""));
      dayKey = Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
    } else {
      dayKey = parseDateCell(r[cDate]);
    }
    if (dayKey === null) {
      warnings.push(`Row ${headerIdx + i + 2} ("${title}") skipped: no valid ${cDay >= 0 ? "day" : "date"}.`);
      return;
    }
    const minRaw = cMin >= 0 ? Number(String(r[cMin]).replace(/[^0-9.]/g, "")) : NaN;
    raw.push({
      dayKey,
      title,
      detail: cDetail >= 0 && String(r[cDetail]).trim() ? String(r[cDetail]).trim() : null,
      category: cType >= 0 ? toCategory(r[cType]) : toCategory(title),
      minutes: Number.isFinite(minRaw) && minRaw > 0 ? Math.round(minRaw) : null,
      optional: cOpt >= 0 ? /^(y|yes|true|1|optional)/i.test(String(r[cOpt]).trim()) : false,
    });
  });

  if (raw.length === 0) throw new Error("No task rows found under the header.");

  const base = Math.min(...raw.map((t) => t.dayKey));
  const tasks: ParsedTask[] = raw.map((t) => ({
    dayOffset: cDay >= 0 ? t.dayKey - 1 : Math.round((t.dayKey - base) / DAY_MS),
    title: t.title,
    detail: t.detail,
    category: t.category,
    minutes: t.minutes,
    optional: t.optional,
  }));
  return { tasks, warnings, mode: cDay >= 0 ? "day" : "date" };
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

export default function PlannerImportClient({ students }: { students: ImportStudent[] }) {
  const [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [setPlannerStart, setSetPlannerStart] = useState(true);
  const [replace, setReplace] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<{ tasks: ParsedTask[]; warnings: string[]; mode: "day" | "date" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
  }, [students, search]);

  const student = students.find((s) => s.id === studentId) ?? null;

  const byDay = useMemo(() => {
    if (!parsed || !startDate) return [] as { date: string; tasks: ParsedTask[] }[];
    const map = new Map<string, ParsedTask[]>();
    for (const t of parsed.tasks) {
      const d = addDays(startDate, t.dayOffset);
      (map.get(d) ?? map.set(d, []).get(d)!).push(t);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, tasks]) => ({ date, tasks }));
  }, [parsed, startDate]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setError(null);
    setDone(null);
    setParsed(null);
    setFileName(f.name);
    try {
      setParsed(await parseWorkbook(f));
    } catch (err: any) {
      setError(err.message || "Couldn't read that file.");
    }
  }

  function pickStudent(id: string) {
    setStudentId(id);
    setDone(null);
    const s = students.find((x) => x.id === id);
    if (s?.startDate && !startDate) setStartDate(s.startDate);
  }

  async function importPlan() {
    if (!student || !parsed || !startDate || byDay.length === 0) return;
    setBusy(true);
    setError(null);
    setDone(null);
    const supabase = createClient();

    if (replace) {
      const { error: delErr } = await supabase
        .from("mentor_plan_tasks")
        .delete()
        .eq("student_id", student.id)
        .eq("source", "mentor")
        .gte("task_date", startDate);
      if (delErr) {
        setBusy(false);
        setError(delErr.message);
        return;
      }
    }

    const rows = byDay.flatMap(({ date, tasks }) =>
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

    for (let i = 0; i < rows.length; i += 200) {
      const { error: insErr } = await supabase.from("mentor_plan_tasks").insert(rows.slice(i, i + 200));
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
          { student_id: student.id, start_date: startDate, updated_at: new Date().toISOString() },
          { onConflict: "student_id" }
        );
    }

    setBusy(false);
    setDone(
      `Imported ${rows.length} task${rows.length === 1 ? "" : "s"} across ${byDay.length} day${
        byDay.length === 1 ? "" : "s"
      } (${byDay[0].date} to ${byDay[byDay.length - 1].date}) into ${student.name}'s planner.`
    );
    setParsed(null);
    setFileName("");
  }

  const canImport = !!student && !!parsed && !!startDate && byDay.length > 0 && !busy;

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
            Day 1 of the sheet lands on this date (or, if your sheet has dates, the first date in it).
          </p>
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm font-semibold">Upload the Excel sheet</p>
          <button type="button" onClick={() => downloadTemplate().catch((e) => setError(e.message))} className="text-xs font-semibold text-brand-400 hover:text-brand-300">
            Download template
          </button>
        </div>
        <p className="text-xs text-slate-400">
          One row per task. Columns: <strong>Day</strong> (1, 2, 3...) or <strong>Date</strong>, <strong>Task</strong>, and
          optionally Details, Type (Question block / Reading / Review / Video), Minutes, Optional (Yes/No). .xlsx, .xls and .csv work.
        </p>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="text-sm text-slate-300" />
        {fileName && <p className="text-xs text-slate-500">{fileName}</p>}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {done && <p className="text-sm text-green-400">{done}</p>}

      {parsed && (
        <div className="card space-y-4">
          <div>
            <p className="text-sm font-semibold">Preview</p>
            <p className="text-xs text-slate-400">
              {parsed.tasks.length} task{parsed.tasks.length === 1 ? "" : "s"}
              {startDate && byDay.length > 0
                ? ` across ${byDay.length} day${byDay.length === 1 ? "" : "s"}, ${byDay[0].date} to ${byDay[byDay.length - 1].date}`
                : " - choose a start date to see the dates"}
              {" "}(read by {parsed.mode === "day" ? "Day number" : "Date column"}).
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

          {startDate && (
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
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="w-4 h-4 mt-0.5" checked={setPlannerStart} onChange={(e) => setSetPlannerStart(e.target.checked)} />
              <span>Also set the student&apos;s planner start date to this date</span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="w-4 h-4 mt-0.5" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
              <span>
                Replace the student&apos;s existing mentor-assigned tasks from the start date onward
                <span className="block text-xs text-slate-500">Off = imported tasks are added alongside what&apos;s already there.</span>
              </span>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={importPlan} disabled={!canImport} className="btn-primary text-sm">
              {busy ? "Importing..." : student ? `Import into ${student.name}'s planner` : "Choose a student first"}
            </button>
            <button type="button" onClick={() => { setParsed(null); setFileName(""); }} disabled={busy} className="btn-secondary text-sm">
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
