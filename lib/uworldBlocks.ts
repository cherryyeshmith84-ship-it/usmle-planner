export type UWorldBlockMode = "Timed" | "Untimed" | "Tutor";

export interface UWorldBlock {
  id: string;
  user_id: string;
  log_date: string;
  block_number: number;
  questions: number | null;
  percentage: number | null;
  average: number | null;
  mode: UWorldBlockMode | null;
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
