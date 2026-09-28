export type UWorldBlockMode = "Timed" | "Untimed" | "Tutor";

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
  qbank: UWorldBlockQBank | null;
  system: string | null;
  // Optional screenshot of the block's result straight from the question
  // bank (a "proof" image backing up the typed-in Percentage/Average
  // fields) - stored in the "block-screenshots" Supabase Storage bucket,
  // under this block's user_id as the folder (see migration
  // add_block_screenshots). Visible to the student, their mentor, admins,
  // and anyone granted viewer access to this student - the same audience
  // that already sees the numeric fields above.
  screenshot_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

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
