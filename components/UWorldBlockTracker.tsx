"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { UWorldBlock, UWorldBlockMode, UWorldBlockQBank } from "@/lib/uworldBlocks";
import { QBANKS } from "@/lib/uworldBlocks";
import { STEP1_SYSTEMS } from "@/lib/qbankTypes";

const MODES: UWorldBlockMode[] = ["Timed", "Untimed", "Tutor"];

interface DraftBlock {
  key: string; // stable local key - real id for existing rows, "new-N" for freshly added ones
  questions: string;
  percentage: string;
  average: string;
  mode: UWorldBlockMode | "";
  qbank: UWorldBlockQBank | "";
  system: string;
}

function toDraft(b: UWorldBlock): DraftBlock {
  return {
    key: b.id,
    questions: b.questions?.toString() ?? "",
    percentage: b.percentage?.toString() ?? "",
    average: b.average?.toString() ?? "",
    mode: b.mode ?? "",
    qbank: b.qbank ?? "",
    system: b.system ?? "",
  };
}

/**
 * Question-bank block tracker (Study Planner v1 item 2, originally
 * "UWorld Block Tracker") - lets a student log each block of questions they
 * did that day exactly as the bank already shows it (Questions/
 * Percentage/Average/Mode), no math required or performed here. Generalized
 * beyond just UWorld - a student who splits practice across UWorld, Amboss,
 * and Mehlman logs every block here, each tagged with which bank AND which
 * organ system it covered (lib/qbankTypes.ts's STEP1_SYSTEMS - the same
 * canonical list score reports use), so Analysis can show an average % per
 * system per bank (lib/qbankBlockStats.ts /
 * components/QBankSystemBreakdown.tsx) instead of one flat number across
 * everything. Both tags are optional - an untagged block still counts
 * everywhere it always did (weekly average, streaks, question counts), it
 * just won't show up broken out by bank/system.
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
    setBlocks((prev) => [
      ...prev,
      { key, questions: "", percentage: "", average: "", mode: "", qbank: "", system: "" },
    ]);
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
      qbank: b.qbank || null,
      system: b.system || null,
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
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Question Bank Blocks</p>

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
                <span className="text-xs text-slate-500">Question bank</span>
                <select
                  value={b.qbank}
                  disabled={!canEdit}
                  onChange={(e) => updateBlock(b.key, { qbank: e.target.value as UWorldBlockQBank })}
                  className="input text-sm py-1 px-2 w-full"
                >
                  <option value="">-</option>
                  {QBANKS.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">System</span>
                <select
                  value={b.system}
                  disabled={!canEdit}
                  onChange={(e) => updateBlock(b.key, { system: e.target.value })}
                  className="input text-sm py-1 px-2 w-full"
                >
                  <option value="">-</option>
                  {/* Random (mixed-system) blocks are common - UWorld's own
                      "Random" quiz mode pulls from every system at once, so
                      forcing a single system on it would misrepresent what
                      was actually practiced. Kept out of lib/qbankTypes.ts's
                      STEP1_SYSTEMS (that list is shared with score-report
                      breakdowns, which really do need one real system per
                      column) - this is a tracker-only option that just shows
                      up as its own row in the per-system breakdown table. */}
                  <option value="Random">Random (mixed systems)</option>
                  {STEP1_SYSTEMS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
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
