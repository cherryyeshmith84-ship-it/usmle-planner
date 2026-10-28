"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ScoreReport } from "@/lib/scoreReports";

function parsePct(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
}

/**
 * Inline editor for an uploaded self-assessment / score report: exam name,
 * date taken, overall %, and the per-system / per-discipline percentages.
 * Writes straight to score_reports - RLS (score_reports_write_own_or_admin)
 * already lets the owner student or an admin update the row.
 */
export default function ScoreReportEditForm({
  report,
  onClose,
}: {
  report: ScoreReport;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(report.exam_name ?? "");
  const [date, setDate] = useState(report.taken_date ?? "");
  const [overall, setOverall] = useState(report.overall_percent != null ? String(report.overall_percent) : "");
  const [systems, setSystems] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(report.system_breakdown ?? {}).map(([k, v]) => [k, String(v)]))
  );
  const [disciplines, setDisciplines] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(report.discipline_breakdown ?? {}).map(([k, v]) => [k, String(v)]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) {
      setError("Exam name can't be empty.");
      return;
    }
    setSaving(true);
    setError(null);
    const toNumMap = (m: Record<string, string>) => {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(m)) {
        const n = parsePct(v);
        if (n !== null) out[k] = n;
      }
      return out;
    };
    const update: Record<string, unknown> = {
      exam_name: name.trim(),
      taken_date: date || null,
      overall_percent: parsePct(overall),
    };
    if (Object.keys(systems).length > 0) update.system_breakdown = toNumMap(systems);
    if (Object.keys(disciplines).length > 0) update.discipline_breakdown = toNumMap(disciplines);

    const supabase = createClient();
    const { error: err } = await supabase.from("score_reports").update(update).eq("id", report.id);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-800 space-y-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Edit report</p>
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="label">Exam name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Date taken</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Overall %</label>
          <input
            type="number"
            min={0}
            max={100}
            step="0.1"
            className="input"
            value={overall}
            onChange={(e) => setOverall(e.target.value)}
          />
        </div>
      </div>

      {Object.keys(systems).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 mb-1.5">Systems (%)</p>
          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
            {Object.keys(systems).map((k) => (
              <div key={k} className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400 truncate">{k}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  className="input w-20 py-1 text-xs"
                  value={systems[k]}
                  onChange={(e) => setSystems((p) => ({ ...p, [k]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {Object.keys(disciplines).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 mb-1.5">Disciplines (%)</p>
          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
            {Object.keys(disciplines).map((k) => (
              <div key={k} className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400 truncate">{k}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  className="input w-20 py-1 text-xs"
                  value={disciplines[k]}
                  onChange={(e) => setDisciplines((p) => ({ ...p, [k]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={saving} className="btn-primary text-xs">
          {saving ? "Saving..." : "Save changes"}
        </button>
        <button type="button" onClick={onClose} disabled={saving} className="text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
    </div>
  );
}
