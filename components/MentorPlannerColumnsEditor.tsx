"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { slugifyColumnKey, type PlannerColumn, type PlannerFieldType } from "@/lib/plannerColumns";

const FIELD_TYPE_LABEL: Record<PlannerFieldType, string> = {
  text: "Text",
  number: "Number",
  textarea: "Long text",
  checkbox: "Checkbox",
};

/**
 * Lets a mentor add/edit/delete the actual planner columns for ONE
 * specific student - not the global default set every student otherwise
 * shares (that's still admin-only, /admin/planner-config). Per-student
 * customization is all-or-nothing (see resolvePlannerColumns in
 * lib/plannerColumns.ts): a student with zero student_id-scoped rows is
 * still on the shared defaults, so the first action here is always
 * "Customize" - which seeds a real copy of the defaults as new rows owned
 * by this student, so the mentor edits/removes from something familiar
 * instead of starting from a blank grid. "Reset to default layout" deletes
 * that copy and puts the student back on the shared set.
 */
export default function MentorPlannerColumnsEditor({
  studentId,
  defaultColumns,
  initialOwnColumns,
}: {
  studentId: string;
  defaultColumns: PlannerColumn[];
  initialOwnColumns: PlannerColumn[];
}) {
  const router = useRouter();
  const [columns, setColumns] = useState(initialOwnColumns);
  const [newColumnLabel, setNewColumnLabel] = useState("");
  const [newColumnType, setNewColumnType] = useState<PlannerFieldType>("text");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function sorted(list: PlannerColumn[]): PlannerColumn[] {
    return [...list].sort((a, b) => a.sort_order - b.sort_order);
  }

  async function customize() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const seedRows = defaultColumns
      .filter((c) => c.active)
      .map((c) => ({
        student_id: studentId,
        key: c.key,
        label: c.label,
        field_type: c.field_type,
        sort_order: c.sort_order,
        active: true,
      }));
    const { data, error: insertError } = await supabase.from("planner_columns").insert(seedRows).select("*");
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setColumns((data ?? []) as PlannerColumn[]);
    router.refresh();
  }

  async function resetToDefault() {
    if (!confirm("Reset this student back to the shared default planner layout? Their custom columns will be removed (values already saved under those keys are kept but won't show up).")) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("planner_columns").delete().eq("student_id", studentId);
    setSaving(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setColumns([]);
    router.refresh();
  }

  async function addColumn() {
    const label = newColumnLabel.trim();
    if (!label || saving) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const key = slugifyColumnKey(label);
    const nextOrder = (columns.reduce((m, c) => Math.max(m, c.sort_order), 0) || 0) + 10;
    const { data, error: insertError } = await supabase
      .from("planner_columns")
      .insert({ student_id: studentId, key, label, field_type: newColumnType, sort_order: nextOrder, active: true })
      .select("*")
      .single();
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setColumns((prev) => [...prev, data as PlannerColumn]);
    setNewColumnLabel("");
    router.refresh();
  }

  async function updateColumn(id: string, patch: Partial<PlannerColumn>) {
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const supabase = createClient();
    await supabase.from("planner_columns").update(patch).eq("id", id);
    router.refresh();
  }

  async function deleteColumn(id: string, label: string) {
    if (!confirm(`Remove the "${label}" column for this student? Any values already saved under it are kept but will no longer show up.`)) return;
    setColumns((prev) => prev.filter((c) => c.id !== id));
    const supabase = createClient();
    await supabase.from("planner_columns").delete().eq("id", id);
    router.refresh();
  }

  function moveColumn(id: string, direction: -1 | 1) {
    const list = sorted(columns);
    const idx = list.findIndex((c) => c.id === id);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= list.length) return;
    const a = list[idx];
    const b = list[swapIdx];
    updateColumn(a.id, { sort_order: b.sort_order });
    updateColumn(b.id, { sort_order: a.sort_order });
  }

  if (columns.length === 0) {
    return (
      <div className="card">
        <p className="text-sm text-slate-300 mb-3">
          This student is currently on the shared default planner layout. Customize it just for
          them - add, rename, or remove columns without affecting any other student.
        </p>
        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
        <button type="button" onClick={customize} disabled={saving} className="btn-primary text-sm">
          {saving ? "Setting up..." : "Customize planner for this student"}
        </button>
      </div>
    );
  }

  return (
    <div>
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      <div className="space-y-2 mb-4">
        {sorted(columns).map((c, idx, list) => (
          <div key={c.id} className="card flex items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => moveColumn(c.id, -1)}
                  disabled={idx === 0}
                  className="text-slate-500 hover:text-slate-200 disabled:opacity-20 disabled:cursor-not-allowed leading-none text-xs"
                  aria-label="Move up"
                >
                  &#9650;
                </button>
                <button
                  type="button"
                  onClick={() => moveColumn(c.id, 1)}
                  disabled={idx === list.length - 1}
                  className="text-slate-500 hover:text-slate-200 disabled:opacity-20 disabled:cursor-not-allowed leading-none text-xs"
                  aria-label="Move down"
                >
                  &#9660;
                </button>
              </div>
              <div className="min-w-0">
                <p className={`text-sm font-semibold truncate ${c.active ? "" : "text-slate-500 line-through"}`}>
                  {c.label}
                </p>
                <p className="text-xs text-slate-500">
                  {FIELD_TYPE_LABEL[c.field_type]} &middot; key: {c.key}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => updateColumn(c.id, { active: !c.active })}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full transition ${
                  c.active ? "bg-green-900/40 text-green-400" : "bg-slate-800 text-slate-400"
                }`}
              >
                {c.active ? "Visible" : "Hidden"}
              </button>
              <button
                type="button"
                onClick={() => deleteColumn(c.id, c.label)}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="card flex flex-wrap items-end gap-3 mb-3">
        <div className="flex-1 min-w-[180px]">
          <label className="label">New column label</label>
          <input
            type="text"
            value={newColumnLabel}
            onChange={(e) => setNewColumnLabel(e.target.value)}
            placeholder="e.g. Flashcards made"
            className="input"
          />
        </div>
        <div>
          <label className="label">Type</label>
          <select
            value={newColumnType}
            onChange={(e) => setNewColumnType(e.target.value as PlannerFieldType)}
            className="input"
          >
            {(Object.keys(FIELD_TYPE_LABEL) as PlannerFieldType[]).map((t) => (
              <option key={t} value={t}>
                {FIELD_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <button type="button" onClick={addColumn} disabled={saving || !newColumnLabel.trim()} className="btn-primary">
          Add column
        </button>
      </div>

      <button type="button" onClick={resetToDefault} disabled={saving} className="text-xs text-slate-500 hover:text-slate-300">
        Reset to shared default layout
      </button>
    </div>
  );
}
