"use client";

export type FontSize = "sm" | "md" | "lg";
export type ExamTheme = "dark" | "light";

export default function ExamSettings({
  fontSize,
  setFontSize,
  theme,
  setTheme,
  splitScreen,
  setSplitScreen,
  onClose,
}: {
  fontSize: FontSize;
  setFontSize: (v: FontSize) => void;
  theme: ExamTheme;
  setTheme: (v: ExamTheme) => void;
  splitScreen: boolean;
  setSplitScreen: (v: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-30 bg-black/70 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div className="card w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-sm"
          >
            Close
          </button>
        </div>

        <div className="mb-4">
          <p className="label">Font size</p>
          <div className="flex gap-2">
            {(["sm", "md", "lg"] as FontSize[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setFontSize(v)}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold border ${
                  fontSize === v
                    ? "border-brand-400 bg-brand-900/30 text-brand-300"
                    : "border-slate-700 text-slate-300 hover:border-slate-600"
                }`}
              >
                {v === "sm" ? "Small" : v === "md" ? "Medium" : "Large"}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <p className="label">Color theme</p>
          <div className="flex gap-2">
            {(["dark", "light"] as ExamTheme[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setTheme(v)}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold border ${
                  theme === v
                    ? "border-brand-400 bg-brand-900/30 text-brand-300"
                    : "border-slate-700 text-slate-300 hover:border-slate-600"
                }`}
              >
                {v === "dark" ? "Black" : "White"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="label">Split screen</p>
          <div className="flex gap-2">
            {[
              { v: true, l: "On" },
              { v: false, l: "Off" },
            ].map((opt) => (
              <button
                key={opt.l}
                type="button"
                onClick={() => setSplitScreen(opt.v)}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold border ${
                  splitScreen === opt.v
                    ? "border-brand-400 bg-brand-900/30 text-brand-300"
                    : "border-slate-700 text-slate-300 hover:border-slate-600"
                }`}
              >
                {opt.l}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Shows the question stem and answer choices side by side instead of stacked.
          </p>
        </div>
      </div>
    </div>
  );
}
