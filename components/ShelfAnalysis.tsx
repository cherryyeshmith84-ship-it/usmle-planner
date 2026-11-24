"use client";

import { useMemo, useState } from "react";

/**
 * Analysis for Step 2 CK and Shelf / subject exam students. Instead of the
 * Step 1 system graphs, everything is arranged per SUBJECT (Medicine,
 * Psychiatry, Surgery, ...), the way the NBME shelf reports are:
 *  - score trend for that subject, against the national average
 *  - the Performance Report tables (organ system, physician task, site of
 *    care, patient group) for the latest exam
 *  - from the Question-Level Feedback: weakest topics, "easy misses"
 *    (questions most examinees got right that you missed) and a breakdown
 *    by organ system
 * Reports come from score_reports (saved by the shelf upload).
 */

interface TopicStat {
  subtopic: string;
  correct: number;
  total: number;
  percent: number;
  national_pct: number | null;
}

interface ReportRow {
  id: string;
  exam_type: string | null;
  exam_name: string | null;
  taken_date: string | null;
  overall_percent: number | null;
  system_breakdown: Record<string, number> | null;
  content_breakdown: Record<
    string,
    { subtopic: string; correct: number; total: number; percent: number; national_pct: number | null }
  > | null;
  ai_raw_response: {
    shelf?: {
      subject?: string | null;
      comparison_mean?: number | null;
      sections?: { group: string; name: string; epc: number | null; comparison: number | null; pct_questions: string | null }[];
    };
  } | null;
  created_at?: string | null;
}

function subjectOf(r: ReportRow): string {
  const fromAi = r.ai_raw_response?.shelf?.subject;
  if (fromAi && fromAi.trim()) return fromAi.trim();
  const name = (r.exam_name ?? "").replace(/\s*\(?NBME\)?/i, "").replace(/\s*Shelf.*$/i, "").trim();
  return name || "Other exams";
}

function barColor(pct: number) {
  if (pct >= 75) return "bg-green-500";
  if (pct >= 60) return "bg-amber-400";
  return "bg-red-400";
}

function kindOf(desc: string) {
  const k = desc.split(":")[0]?.trim() ?? "";
  if (/^diagnosis/i.test(k)) return "Diagnosis";
  if (/^management/i.test(k)) return "Management";
  if (/^foundation/i.test(k)) return "Foundational science";
  if (/^gen/i.test(k)) return "General principles";
  return "Other";
}

function dateLabel(d: string | null) {
  if (!d) return "no date";
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
}

export default function ShelfAnalysis({ reports }: { reports: ReportRow[] }) {
  const bySubject = useMemo(() => {
    const map = new Map<string, ReportRow[]>();
    for (const r of reports) {
      const s = subjectOf(r);
      map.set(s, [...(map.get(s) ?? []), r]);
    }
    for (const [k, list] of Array.from(map.entries())) {
      map.set(
        k,
        [...list].sort((a, b) => (a.taken_date ?? a.created_at ?? "").localeCompare(b.taken_date ?? b.created_at ?? ""))
      );
    }
    return map;
  }, [reports]);

  const subjects = Array.from(bySubject.keys()).sort();
  const [active, setActive] = useState<string>(subjects[0] ?? "");
  const current = subjects.includes(active) ? active : subjects[0];

  if (subjects.length === 0) {
    return (
      <div className="card">
        <p className="text-sm text-slate-400">
          No shelf exam reports yet. Upload your NBME Performance Report and/or Question-Level Feedback PDF above and
          your analysis will be arranged here by subject.
        </p>
      </div>
    );
  }

  const list = bySubject.get(current) ?? [];
  const latest = list[list.length - 1];
  const withSections = [...list].reverse().find((r) => (r.ai_raw_response?.shelf?.sections ?? []).length > 0);
  const withQuestions = [...list].reverse().find((r) => r.content_breakdown && Object.keys(r.content_breakdown).length > 0);

  const sections = withSections?.ai_raw_response?.shelf?.sections ?? [];
  const sectionGroups = Array.from(new Set(sections.map((s) => s.group || "Other")));

  const topics: [string, TopicStat][] = withQuestions
    ? Object.entries((withQuestions.content_breakdown ?? {}) as Record<string, TopicStat>)
    : [];
  const weakest = [...topics].sort((a, b) => a[1].percent - b[1].percent || b[1].total - a[1].total).filter((t) => t[1].percent < 100);
  const easyMisses = topics
    .filter(([, s]) => s.percent === 0 && (s.national_pct ?? 0) >= 70)
    .sort((a, b) => (b[1].national_pct ?? 0) - (a[1].national_pct ?? 0));
  const kindStats = new Map<string, { correct: number; total: number }>();
  for (const [key, s] of topics) {
    const k = kindOf(key);
    const t = kindStats.get(k) ?? { correct: 0, total: 0 };
    t.correct += s.correct;
    t.total += s.total;
    kindStats.set(k, t);
  }
  const systems: [string, number][] = withQuestions
    ? Object.entries((withQuestions.system_breakdown ?? {}) as Record<string, number>).sort((a, b) => a[1] - b[1])
    : [];

  const tabClass = (on: boolean) =>
    `text-sm rounded-full px-4 py-2 border transition ${
      on ? "border-brand-400 bg-brand-900/40 text-brand-300 font-semibold" : "border-slate-700 text-slate-300 hover:border-slate-600"
    }`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {subjects.map((s) => (
          <button key={s} type="button" onClick={() => setActive(s)} className={tabClass(s === current)}>
            {s} ({bySubject.get(s)?.length ?? 0})
          </button>
        ))}
      </div>

      {/* Score trend */}
      <div className="card">
        <h2 className="font-semibold mb-1">{current} - score over time</h2>
        <p className="text-xs text-slate-500 mb-4">Equated percent correct for each {current} exam, with the national average where the report gives it.</p>
        <div className="space-y-3">
          {list.map((r) => {
            const score = r.overall_percent;
            const avg = r.ai_raw_response?.shelf?.comparison_mean ?? null;
            return (
              <div key={r.id}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-300">
                    {r.exam_name || current} · {dateLabel(r.taken_date)}
                  </span>
                  <span className="font-semibold text-slate-200">
                    {score !== null ? `${Math.round(score)}%` : "-"}
                    {avg !== null && <span className="font-normal text-slate-500"> (national avg {avg})</span>}
                  </span>
                </div>
                <div className="relative h-3 rounded-full bg-slate-800 overflow-hidden">
                  {score !== null && <div className={`h-full ${barColor(score)}`} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />}
                  {avg !== null && <div className="absolute top-0 bottom-0 w-0.5 bg-slate-900" style={{ left: `${Math.max(0, Math.min(100, avg))}%` }} />}
                </div>
              </div>
            );
          })}
        </div>
        {list.length > 1 && latest.overall_percent !== null && list[0].overall_percent !== null && (
          <p className="text-xs text-slate-400 mt-3">
            {latest.overall_percent - list[0].overall_percent >= 0 ? "Up" : "Down"}{" "}
            {Math.abs(Math.round(latest.overall_percent - list[0].overall_percent))} points since your first {current} exam.
          </p>
        )}
      </div>

      {/* Performance report tables */}
      {sections.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-1">Performance report - {withSections?.exam_name || current}</h2>
          <p className="text-xs text-slate-500 mb-4">Your score in each area against the comparison group average.</p>
          <div className="space-y-5">
            {sectionGroups.map((g) => (
              <div key={g}>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{g}</p>
                <div className="space-y-2">
                  {sections
                    .filter((s) => (s.group || "Other") === g)
                    .map((s, i) => (
                      <div key={`${g}-${i}`}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-slate-300">{s.name}</span>
                          <span className="text-slate-200 font-semibold">
                            {s.epc ?? "-"}
                            <span className="font-normal text-slate-500"> / avg {s.comparison ?? "-"}</span>
                          </span>
                        </div>
                        <div className="relative h-2 rounded-full bg-slate-800 overflow-hidden">
                          {s.epc !== null && <div className={`h-full ${barColor(s.epc)}`} style={{ width: `${Math.max(0, Math.min(100, s.epc))}%` }} />}
                          {s.comparison !== null && <div className="absolute top-0 bottom-0 w-0.5 bg-slate-900" style={{ left: `${Math.max(0, Math.min(100, s.comparison))}%` }} />}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Question-level patterns */}
      {withQuestions && (
        <>
          <div className="card">
            <h2 className="font-semibold mb-1">Question patterns - {withQuestions.exam_name || current}</h2>
            <p className="text-xs text-slate-500 mb-4">What kind of questions you get right or wrong.</p>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
              {Array.from(kindStats.entries()).map(([k, t]) => {
                const pct = Math.round((t.correct / t.total) * 100);
                return (
                  <div key={k}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-300">{k}</span>
                      <span className="text-slate-200 font-semibold">
                        {pct}% <span className="font-normal text-slate-500">({t.correct}/{t.total})</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div className={`h-full ${barColor(pct)}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {systems.length > 0 && (
            <div className="card">
              <h2 className="font-semibold mb-1">By organ system</h2>
              <p className="text-xs text-slate-500 mb-4">Weakest first.</p>
              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
                {systems.map(([name, pct]) => (
                  <div key={name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-300">{name}</span>
                      <span className="text-slate-200 font-semibold">{pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div className={`h-full ${barColor(pct)}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <h2 className="font-semibold mb-1">Weakest topics</h2>
            <p className="text-xs text-slate-500 mb-3">The topics to study first, with how the national group did.</p>
            {weakest.length === 0 ? (
              <p className="text-sm text-slate-400">No missed topics in this report.</p>
            ) : (
              <div className="space-y-2">
                {weakest.slice(0, 15).map(([key, s]) => (
                  <div key={key} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-slate-300 flex-1 min-w-0">{key}</span>
                    <span className="text-slate-500 shrink-0">
                      {s.national_pct !== null ? `nat ${s.national_pct}%` : ""}
                    </span>
                    <span className="font-semibold text-slate-200 shrink-0 w-12 text-right">
                      {s.correct}/{s.total}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {easyMisses.length > 0 && (
            <div className="card">
              <h2 className="font-semibold mb-1">Easy misses</h2>
              <p className="text-xs text-slate-500 mb-3">
                Questions at least 70% of the national group got right, but you missed. These are the quickest points to win back.
              </p>
              <div className="space-y-2">
                {easyMisses.slice(0, 12).map(([key, s]) => (
                  <div key={key} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-slate-300 flex-1 min-w-0">{key}</span>
                    <span className="text-slate-500 shrink-0">nat {s.national_pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
