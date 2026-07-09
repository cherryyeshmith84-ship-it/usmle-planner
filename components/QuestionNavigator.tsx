"use client";

export interface NavItem {
  index: number;
  answered: boolean;
  flagged: boolean;
}

/**
 * Numbered question list down the side of the exam, like UWorld's "Question
 * Status" panel - click a number to jump straight to that question. Shows
 * answered (filled) vs unanswered (empty) and a flag marker for questions
 * marked "review later".
 */
export default function QuestionNavigator({
  items,
  currentIndex,
  onSelect,
}: {
  items: NavItem[];
  currentIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="w-16 shrink-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2 text-center">
        Questions
      </p>
      <div className="flex flex-col gap-1 max-h-[70vh] overflow-y-auto pr-1">
        {items.map((item) => (
          <button
            key={item.index}
            type="button"
            onClick={() => onSelect(item.index)}
            className={`relative rounded-lg py-2 text-xs font-semibold border transition ${
              item.index === currentIndex
                ? "border-brand-400 bg-brand-900/40 text-brand-200"
                : item.answered
                ? "border-slate-600 bg-slate-800 text-slate-200"
                : "border-slate-800 text-slate-500 hover:border-slate-600"
            }`}
          >
            {item.index + 1}
            {item.flagged && (
              <span className="absolute -top-1 -right-1 text-amber-400 text-[10px]">&#9873;</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
