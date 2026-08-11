import type { UWorldBlock } from "./uworldBlocks";

export interface QBankSystemCell {
  qbank: string;
  system: string;
  averagePercent: number;
  blockCount: number;
  totalQuestions: number;
}

export function computeQBankSystemBreakdown(blocks: UWorldBlock[]): QBankSystemCell[] {
  const groups = new Map<string, { qbank: string; system: string; percentages: number[]; questions: number }>();

  for (const b of blocks) {
    if (!b.qbank || !b.system || typeof b.percentage !== "number") continue;
    const key = `${b.qbank} ${b.system}`;
    const g = groups.get(key) ?? { qbank: b.qbank, system: b.system, percentages: [], questions: 0 };
    g.percentages.push(b.percentage);
    g.questions += b.questions ?? 0;
    groups.set(key, g);
  }

  return Array.from(groups.values())
    .map((g) => ({
      qbank: g.qbank,
      system: g.system,
      averagePercent: Math.round((g.percentages.reduce((s, p) => s + p, 0) / g.percentages.length) * 10) / 10,
      blockCount: g.percentages.length,
      totalQuestions: g.questions,
    }))
    .sort((a, b) => a.qbank.localeCompare(b.qbank) || a.averagePercent - b.averagePercent);
}

export function distinctQBanks(cells: QBankSystemCell[]): string[] {
  return Array.from(new Set(cells.map((c) => c.qbank)));
}

export function distinctSystemsByWeakness(cells: QBankSystemCell[]): string[] {
  const bySystem = new Map<string, number[]>();
  for (const c of cells) {
    const arr = bySystem.get(c.system) ?? [];
    arr.push(c.averagePercent);
    bySystem.set(c.system, arr);
  }
  return Array.from(bySystem.entries())
    .map(([system, percents]) => ({ system, mean: percents.reduce((s, p) => s + p, 0) / percents.length }))
    .sort((a, b) => a.mean - b.mean)
    .map((x) => x.system);
}
