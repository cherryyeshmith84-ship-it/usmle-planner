export type UWorldBlockMode = "Timed" | "Untimed" | "Tutor";

// Which question bank a block was done in - was hardcoded to UWorld only
// (component name and all), now generalized so a student who splits
// practice across multiple banks can log every block in one place and get
// a breakdown per bank, not just a single flattened average. "UWorld" stays
// first/default since it's still the most common one.
export const QBANKS = ["UWorld", "Amboss", "Mehlman"] as const;
export type UWorldBlockQBank = (typeof QBANKS)[number];

export interface UWorldBlock {
  id: string;
  user_id: string;
  log_date: string;
  block_number: number;
  questions: number | null;
  percentage: number | null;
  average: number | null;
  mode: UWorldBlockMode | null;
  // Both nullable - older rows logged before this existed, or a student who
  // skips tagging, just won't show up in the per-qbank/per-system breakdown
  // (lib/qbankBlockStats.ts) but everything else about the block still works.
  qbank: UWorldBlockQBank | null;
  // Free-text but populated from lib/qbankTypes.ts's STEP1_SYSTEMS - the
  // same canonical system list score reports already use, so a block's
  // system lines up with the same names used everywhere else in Analysis.
  system: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Groups a flat list of blocks (as fetched for a whole date range) by log_date, each sorted by block_number. */
export function groupBlocksByDate(blocks: UWorldBlock[]): Record<string, UWorldBlock[]> {
  const out: Record<string, UWorldBlock[]> = {};
  for (const b of blocks) {
    (out[b.log_date] ??= []).push(b);
  }
  for (const date of Object.keys(out)) {
    out[date].sort((a, b) => a.block_number - b.block_number);
  }
  return out;
}
