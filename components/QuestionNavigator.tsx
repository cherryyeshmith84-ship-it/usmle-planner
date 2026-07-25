"use client";

export interface NavItem {
  index: number;
  answered: boolean;
  flagged: boolean;
  // Optional - only set in results/review mode. When present, coloring
  // switches from the taking-mode answered/unanswered look to a
  // correct/incorrect/unanswered look (green/red/slate), since by review
  // time every question already has a right-or-wrong outcome instead of
  // just an answered/blank state.
  status?: "correct" | "incorrect" | "unanswered";
}

/**
 * Numbered question list down the side of the exam, like UWorld's "Question
 * Status" panel - click a number to jump straight to that question. In
 * taking mode, shows answered (filled) vs unanswered (empty) and a flag
 * marker for questions marked "review later". In review mode (when items
 * carry a `status`), shows correct/incorrect/unanswered instead, and
 * `currentIndex` can be null so nothing is expanded until a number is
 * clicked.
 */
export default function QuestionNavigator({
  items,
  currentIndex,
  onSelect,
}: {
  items: NavItem[];
  currentIndex: number | null;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="w-16 shrink-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2 text-center">
        Questions
      </p>
      <div className="flex flex-col gap-1 max-h-[70vh] overflow-y-auto pr-1">
        {items.map((item) => {
          let colorClass: string;
          if (item.index === currentIndex) {
            colorClass = "border-brand-400 bg-brand-900/40 text-brand-200";
          } else if (item.status) {
            colorClass =
              item.status === "correct"
                ? "border-green-800 bg-green-900/30 text-green-300"
                : item.status === "incorrect"
                ? "border-red-800 bg-red-900/30 text-red-300"
                : "border-slate-800 text-slate-500 hover:border-slate-600";
          } else if (item.answered) {
            colorClass = "border-slate-600 bg-slate-800 text-slate-200";
          } else {
            colorClass = "border-slate-800 text-slate-500 hover:border-slate-600";
          }
          return (
            <button
              key={item.index}
              type="button"
              onClick={() => onSelect(item.index)}
              className={`relative rounded-lg py-2 text-xs font-semibold border transition ${colorClass}`}
            >
              {item.index + 1}
              {item.flagged && (
                <span className="absolute -top-1 -right-1 text-amber-400 text-[10px]">&#9873;</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
