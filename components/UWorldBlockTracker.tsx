"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { UWorldBlock, UWorldBlockMode } from "@/lib/uworldBlocks";

const MODES: UWorldBlockMode[] = ["Timed", "Untimed", "Tutor"];

interface DraftBlock {
  key: string; // stable local key - real id for existing rows, "new-N" for freshly added ones
  questions: string;
  percentage: string;
  average: string;
  mode: UWorldBlockMode | "";
}

function toDraft(b: UWorldBlock): DraftBlock {
  return {
    key: b.id,
    questions: b.questions?.toString() ?? "",
    percentage: b.percentage?.toString() ?? "",
    average: b.average?.toString() ?? "",
    mode: b.mode ?? "",
  };
}

/**
 * "UWorld Block Tracker" (Study Planner v1 item 2) - lets a student log each
 * UWorld block they did that day exactly as UWorld already shows it
 * (Questions/Percentage/Average/Mode), no math required or performed here.
 * Lives inside a day's expanded row in PlannerGridClient.
 *
 * Save is explicit (not autosave) to match the rest of the planner's UX -
 * on save this simply replaces every block row for this user+date with
 * whatever's currently drafted, which keeps add/remove/reorder trivial
 * instead of diffing against the DB.
 */
export default function UWorldBlockTracker({
  targetUserId,
  date,
  initialBlocks,
  canEdit = true,
}: {
  targetUserId: string;
  date: string;
  initialBlocks: UWorldBlock[];
  canEdit?: boolean;
}) {
  const [blocks, setBlocks] = useState<DraftBlock[]>(() => initialBlocks.map(toDraft));
  const [nextNewId, setNextNewId] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  function updateBlock(key: string, patch: Partial<DraftBlock>) {
    setSaveMessage(null);
    setBlocks((prev) => prev.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  }

  function addBlock() {
    setSaveMessage(null);
    const key = `new-${nextNewId}`;
    setNextNewId((n) => n + 1);
    setBlocks((prev) => [...prev, { key, questions: "", percentage: "", average: "", mode: "" }]);
  }

  function removeBlock(key: string) {
    setSaveMessage(null);
    setBlocks((prev) => prev.filter((b) => b.key !== key));
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    const supabase = createClient();

    const { error: deleteError } = await supabase
      .from("uworld_blocks")
      .delete()
      .eq("user_id", targetUserId)
      .eq("log_date", date);
    if (deleteError) {
      setSaving(false);
      setSaveError(deleteError.message);
      return;
    }

    const rows = blocks.map((b, i) => ({
      user_id: targetUserId,
      log_date: date,
      block_number: i + 1,
      questions: b.questions === "" ? null : Number(b.questions),
      percentage: b.percentage === "" ? null : Number(b.percentage),
      average: b.average === "" ? null : Number(b.average),
      mode: b.mode || null,
    }));

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from("uworld_blocks").insert(rows);
      if (insertError) {
        setSaving(false);
        setSaveError(insertError.message);
        return;
      }
    }

    setSaving(false);
    setSaveMessage("Blocks saved.");
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">UWorld Blocks</p>

      {blocks.length === 0 ? (
        <p className="text-xs text-slate-500">No blocks logged for this day yet.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {blocks.map((b, i) => (
            <div key={b.key} className="rounded-lg border border-slate-800 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-300">Block {i + 1}</p>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => removeBlock(b.key)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                )}
              </div>
              <label className="block">
                <span className="text-xs text-slate-500">Questions</span>
                <input
                  type="number"
                  value={b.questions}
                  disabled={!canEdit}
                  onChange={(e) => updateBlock(b.key, { questions: e.target.value })}
                  className="input text-sm py-1 px-2 w-full"
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">Percentage</span>
                <input
                  type="number"
                  value={b.percentage}
                  disabled={!canEdit}
                  placeholder="%"
                  onChange={(e) => updateBlock(b.key, { percentage: e.target.value })}
                  className="input text-sm py-1 px-2 w-full"
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">Average</span>
                <input
                  type="number"
                  value={b.average}
                  disabled={!canEdit}
                  placeholder="Peer avg %"
                  onChange={(e) => updateBlock(b.key, { average: e.target.value })}
                  className="input text-sm py-1 px-2 w-full"
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">Mode</span>
                <select
                  value={b.mode}
                  disabled={!canEdit}
                  onChange={(e) => updateBlock(b.key, { mode: e.target.value as UWorldBlockMode })}
                  className="input text-sm py-1 px-2 w-full"
                >
                  <option value="">-</option>
                  {MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="flex items-center gap-3 flex-wrap">
          <button type="button" onClick={addBlock} className="btn-secondary text-xs">
            + Add Another Block
          </button>
          <button type="button" onClick={save} disabled={saving} className="btn-primary text-xs">
            {saving ? "Saving..." : "Save blocks"}
          </button>
          {saveMessage && <p className="text-xs text-green-400">{saveMessage}</p>}
          {saveError && <p className="text-xs text-red-400">{saveError}</p>}
        </div>
      )}
    </div>
  );
}
