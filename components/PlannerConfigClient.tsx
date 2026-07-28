"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { slugifyColumnKey, type PlannerColumn, type PlannerFieldType, type StudyResource } from "@/lib/plannerColumns";

const FIELD_TYPE_LABEL: Record<PlannerFieldType, string> = {
  text: "Text",
  number: "Number",
  textarea: "Long text",
  checkbox: "Checkbox",
};

/**
 * Admin-only screen for customizing two things students see on the Study
 * Planner grid: which tracking columns show up (e.g. "PP FA", "Q solved",
 * "Student notes") and which study resources are selectable (UWorld,
 * Sketchy, etc.). Both lists work the same way - add, reorder with
 * up/down, toggle active/inactive without losing history, or delete
 * outright. Mutates planner_columns/study_resources directly via the
 * Supabase client (RLS restricts writes to admins), same pattern as
 * QBankReviewActions.tsx.
 */
export default function PlannerConfigClient({
  initialColumns,
  initialResources,
}: {
  initialColumns: PlannerColumn[];
  initialResources: StudyResource[];
}) {
  const router = useRouter();
  const [columns, setColumns] = useState(initialColumns);
  const [resources, setResources] = useState(initialResources);
  const [newColumnLabel, setNewColumnLabel] = useState("");
  const [newColumnType, setNewColumnType] = useState<PlannerFieldType>("text");
  const [newResourceName, setNewResourceName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function sorted<T extends { sort_order: number }>(list: T[]): T[] {
    return [...list].sort((a, b) => a.sort_order - b.sort_order);
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
      .insert({ key, label, field_type: newColumnType, sort_order: nextOrder, active: true })
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
    if (!confirm(`Remove the "${label}" column? Any values already saved under it are kept but will no longer show up.`)) return;
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

  async function addResource() {
    const name = newResourceName.trim();
    if (!name || saving) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const nextOrder = (resources.reduce((m, r) => Math.max(m, r.sort_order), 0) || 0) + 10;
    const { data, error: insertError } = await supabase
      .from("study_resources")
      .insert({ name, sort_order: nextOrder, active: true })
      .select("*")
      .single();
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setResources((prev) => [...prev, data as StudyResource]);
    setNewResourceName("");
    router.refresh();
  }

  async function updateResource(id: string, patch: Partial<StudyResource>) {
    setResources((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const supabase = createClient();
    await supabase.from("study_resources").update(patch).eq("id", id);
    router.refresh();
  }

  async function deleteResource(id: string, name: string) {
    if (!confirm(`Remove "${name}" from the resource list?`)) return;
    setResources((prev) => prev.filter((r) => r.id !== id));
    const supabase = createClient();
    await supabase.from("study_resources").delete().eq("id", id);
    router.refresh();
  }

  function moveResource(id: string, direction: -1 | 1) {
    const list = sorted(resources);
    const idx = list.findIndex((r) => r.id === id);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= list.length) return;
    const a = list[idx];
    const b = list[swapIdx];
    updateResource(a.id, { sort_order: b.sort_order });
    updateResource(b.id, { sort_order: a.sort_order });
  }

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div>
        <h2 className="text-lg font-bold mb-1">Planner columns</h2>
        <p className="text-sm text-slate-400 mb-4">
          These are the fields every student's daily planner row tracks - matches your spreadsheet
          (Planned system, PP FA, CP FA, Hours, Q solved, and so on). Reorder, rename by removing and
          re-adding, hide without losing data, or delete.
        </p>

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
          {columns.length === 0 && <p className="text-sm text-slate-400">No columns yet.</p>}
        </div>

        <div className="card flex flex-wrap items-end gap-3">
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
      </div>

      <div>
        <h2 className="text-lg font-bold mb-1">Study resources</h2>
        <p className="text-sm text-slate-400 mb-4">
          The resource options students can log against (block scores, planner notes, etc.).
        </p>

        <div className="space-y-2 mb-4">
          {sorted(resources).map((r, idx, list) => (
            <div key={r.id} className="card flex items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => moveResource(r.id, -1)}
                    disabled={idx === 0}
                    className="text-slate-500 hover:text-slate-200 disabled:opacity-20 disabled:cursor-not-allowed leading-none text-xs"
                    aria-label="Move up"
                  >
                    &#9650;
                  </button>
                  <button
                    type="button"
                    onClick={() => moveResource(r.id, 1)}
                    disabled={idx === list.length - 1}
                    className="text-slate-500 hover:text-slate-200 disabled:opacity-20 disabled:cursor-not-allowed leading-none text-xs"
                    aria-label="Move down"
                  >
                    &#9660;
                  </button>
                </div>
                <p className={`text-sm font-semibold truncate ${r.active ? "" : "text-slate-500 line-through"}`}>
                  {r.name}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => updateResource(r.id, { active: !r.active })}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full transition ${
                    r.active ? "bg-green-900/40 text-green-400" : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {r.active ? "Visible" : "Hidden"}
                </button>
                <button
                  type="button"
                  onClick={() => deleteResource(r.id, r.name)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {resources.length === 0 && <p className="text-sm text-slate-400">No resources yet.</p>}
        </div>

        <div className="card flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="label">New resource name</label>
            <input
              type="text"
              value={newResourceName}
              onChange={(e) => setNewResourceName(e.target.value)}
              placeholder="e.g. Amboss"
              className="input"
            />
          </div>
          <button
            type="button"
            onClick={addResource}
            disabled={saving || !newResourceName.trim()}
            className="btn-primary"
          >
            Add resource
          </button>
        </div>
      </div>
    </div>
  );
}
