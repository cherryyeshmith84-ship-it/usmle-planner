import type { QBankSystemCell } from "@/lib/qbankBlockStats";
import { distinctQBanks, distinctSystemsByWeakness } from "@/lib/qbankBlockStats";

function scoreBadgeClass(pct: number) {
  if (pct >= 75) return "bg-green-900/40 text-green-400";
  if (pct >= 60) return "bg-yellow-900/40 text-yellow-400";
  if (pct >= 45) return "bg-orange-900/40 text-orange-400";
  return "bg-red-900/40 text-red-400";
}

export default function QBankSystemBreakdown({ cells }: { cells: QBankSystemCell[] }) {
  if (cells.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No question bank blocks tagged with a bank and system yet - log some from the Study Planner calendar
        (Question Bank Blocks) and pick a bank + system for each to see your average here.
      </p>
    );
  }

  const qbanks = distinctQBanks(cells);
  const systems = distinctSystemsByWeakness(cells);
  const cellByKey = new Map(cells.map((c) => [`${c.qbank} ${c.system}`, c]));

  return (
    <div className="card overflow-x-auto">
      <p className="text-sm font-semibold mb-3">Average % by system, per question bank</p>
      <table className="min-w-full text-xs">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="pr-3 py-1">System</th>
            {qbanks.map((q) => (
              <th key={q} className="px-2 py-1 whitespace-nowrap">
                {q}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {systems.map((system) => (
            <tr key={system} className="border-t border-slate-800">
              <td className="pr-3 py-1.5 text-slate-300">{system}</td>
              {qbanks.map((q) => {
                const cell = cellByKey.get(`${q} ${system}`);
                return (
                  <td key={q} className="px-2 py-1.5 text-center">
                    {cell ? (
                      <span
                        className={`rounded-full px-1.5 py-0.5 ${scoreBadgeClass(cell.averagePercent)}`}
                        title={`${cell.blockCount} block${cell.blockCount === 1 ? "" : "s"}, ${cell.totalQuestions} questions`}
                      >
                        {cell.averagePercent}%
                      </span>
                    ) : (
                      <span className="text-slate-700">-</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
