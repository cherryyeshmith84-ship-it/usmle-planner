"use client";

import { useEffect, useState } from "react";
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
 * on save this replaces every block row for this user+date with whatever's
 * currently drafted, which keeps add/remove/reorder trivial instead of
 * diffing against the DB.
 *
 * IMPORTANT ordering: insert the new rows FIRST, then delete the old ones -
 * never delete-then-insert. A real bug report ("I updated my score, then
 * refreshed, and it was gone") traced back to the old delete-then-insert
 * order: if the delete succeeded but the insert afterward failed for any
 * reason (dropped connection, validation error, etc.), the day's blocks were
 * already gone with nothing to replace them - a refresh then showed a
 * completely empty day. Insert-first means a failed insert leaves the
 * original rows untouched; a failed cleanup-delete afterward just leaves a
 * harmless duplicate that the next save clears out, never data loss.
 *
 * Also tracks `dirty` (any local edit not yet saved) and warns before the
 * browser tab is closed/refreshed while dirty - the other likely cause of
 * "I updated it and it didn't save": every other field on this same day
 * (Mood, Study Issue, Resources Used) autosaves instantly, so it's an easy
 * habit to assume typing a new Percentage here does too and navigate away
 * before clicking "Save blocks".
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
  // The real DB ids currently persisted for this user+date - seeded from
  // initialBlocks, then kept in sync after every successful save so a
  // second save (without a page reload in between) still cleans up the
  // right rows instead of the stale ones from page load.
  const [savedIds, setSavedIds] = useState<string[]>(() => initialBlocks.map((b) => b.id));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Warn before leaving the tab (close/refresh) with an un-saved edit -
  // doesn't catch in-app navigation (Next.js router links), but covers the
  // exact "typed a new score, hit refresh" scenario that prompted this.
  useEffect(() => {
    if (!dirty) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function updateBlock(key: string, patch: Partial<DraftBlock>) {
    setSaveMessage(null);
    setDirty(true);
    setBlocks((prev) => prev.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  }

  function addBlock() {
    setSaveMessage(null);
    setDirty(true);
    const key = `new-${nextNewId}`;
    setNextNewId((n) => n + 1);
    setBlocks((prev) => [
      ...prev,
      { key, questions: "", percentage: "", average: "", mode: "", qbank: "", system: "" },
    ]);
  }

  function removeBlock(key: string) {
    setSaveMessage(null);
    setDirty(true);
    setBlocks((prev) => prev.filter((b) => b.key !== key));
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    const supabase = createClient();

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

    let newIds: string[] = [];
    if (rows.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from("uworld_blocks")
        .insert(rows)
        .select("id");
      if (insertError) {
        setSaving(false);
        setSaveError(insertError.message);
        return;
      }
      newIds = (inserted ?? []).map((r: { id: string }) => r.id);
    }

    if (savedIds.length > 0) {
      const { error: deleteError } = await supabase.from("uworld_blocks").delete().in("id", savedIds);
      if (deleteError) {
        // The new rows above are already safely saved - this only failed to
        // clean up the old ones, leaving a harmless duplicate rather than
        // lost data. Surface it, but still record the new ids as current so
        // the NEXT save doesn't try to delete them too.
        setSaving(false);
        setSavedIds(newIds);
        setDirty(false);
        setSaveError(
          `Your new values are saved, but couldn't clear ${savedIds.length} old entr${
            savedIds.length === 1 ? "y" : "ies"
          }: ${deleteError.message}. Saving again will clean it up.`
        );
        return;
      }
    }

    setSavedIds(newIds);
    setSaving(false);
    setDirty(false);
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
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className={dirty && !saving ? "btn-primary text-xs animate-pulse" : "btn-primary text-xs"}
          >
            {saving ? "Saving..." : dirty ? "Save blocks (unsaved changes)" : "Save blocks"}
          </button>
          {dirty && !saving && (
            <p className="text-xs text-amber-400 font-semibold">
              Unsaved - this section doesn&apos;t autosave. Click Save blocks before leaving this page.
            </p>
          )}
          {saveMessage && <p className="text-xs text-green-400">{saveMessage}</p>}
          {saveError && <p className="text-xs text-red-400">{saveError}</p>}
        </div>
      )}
    </div>
  );
}
