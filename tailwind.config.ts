import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Light-cyan theme (see app/globals.css for the base body/.card/.btn/
      // .input styles that go with this). The app was originally built
      // dark-mode-first, with every page/component using plain Tailwind
      // utility classes (bg-slate-900, text-slate-300, bg-brand-400, etc.)
      // rather than semantic tokens - so instead of hand-editing every one
      // of those classes across 50+ files, these color scales are
      // redefined here so the SAME class names now render light-theme
      // colors everywhere automatically.
      //
      // For slate/green/red/amber/yellow/orange this is a straight
      // reversal of Tailwind's own official scale (new[50]=old[950],
      // new[100]=old[900], ... new[500]=old[500], ... new[950]=old[50]).
      // That preserves every class's RELATIVE meaning - "text-slate-700
      // is more muted than text-slate-300" was true against the old black
      // background and stays true against the new white one, since both
      // ends of the scale just swap which absolute color they point to.
      //
      // `brand` is different: it's a bespoke token (not a real Tailwind
      // scale), so instead of a mechanical reversal it's tuned directly to
      // how this app actually uses it - text-brand-100..400 for links/
      // accent text (needs to be dark enough to read on white, so those
      // numbers intentionally break from "low number = light" convention)
      // and bg-brand-900/NN for translucent highlight-chip washes (which
      // still reads fine as a pale tint over white at low opacity, no
      // change needed there).
      colors: {
        brand: {
          50: "#ecfeff",
          100: "#0e7490",
          200: "#0e7490",
          300: "#0e7490",
          400: "#0891b2",
          500: "#06b6d4",
          600: "#0e7490",
          700: "#155e75",
          800: "#164e63",
          900: "#164e63",
        },
        slate: {
          50: "#020617",
          100: "#0f172a",
          200: "#1e293b",
          300: "#334155",
          400: "#475569",
          500: "#64748b",
          600: "#94a3b8",
          700: "#cbd5e1",
          800: "#e2e8f0",
          900: "#f1f5f9",
          950: "#f8fafc",
        },
        green: {
          50: "#052e16",
          100: "#14532d",
          200: "#166534",
          300: "#15803d",
          400: "#16a34a",
          500: "#22c55e",
          600: "#4ade80",
          700: "#86efac",
          800: "#bbf7d0",
          900: "#dcfce7",
          950: "#f0fdf4",
        },
        red: {
          50: "#450a0a",
          100: "#7f1d1d",
          200: "#991b1b",
          300: "#b91c1c",
          400: "#dc2626",
          500: "#ef4444",
          600: "#f87171",
          700: "#fca5a5",
          800: "#fecaca",
          900: "#fee2e2",
          950: "#fef2f2",
        },
        amber: {
          50: "#451a03",
          100: "#78350f",
          200: "#92400e",
          300: "#b45309",
          400: "#d97706",
          500: "#f59e0b",
          600: "#fbbf24",
          700: "#fcd34d",
          800: "#fde68a",
          900: "#fef3c7",
          950: "#fffbeb",
        },
        // NOT reversed as thoroughly as the others in one spot: the quiz
        // text-highlighter mark (QBankTake.tsx / AssessmentTake.tsx) uses
        // bg-yellow-300/70 + text-black on purpose - a pale highlighter
        // color behind dark text is correct in any theme, so those two
        // spots use a locked arbitrary hex instead of this scale. Every
        // other yellow usage in the app (score badges, ratings) is the
        // normal dark-bg-wash pattern and benefits from the same reversal
        // as green/red/amber.
        yellow: {
          50: "#422006",
          100: "#713f12",
          200: "#854d0e",
          300: "#a16207",
          400: "#ca8a04",
          500: "#eab308",
          600: "#facc15",
          700: "#fde047",
          800: "#fef08a",
          900: "#fef9c3",
          950: "#fefce8",
        },
        orange: {
          50: "#431407",
          100: "#7c2d12",
          200: "#9a3412",
          300: "#c2410c",
          400: "#ea580c",
          500: "#f97316",
          600: "#fb923c",
          700: "#fdba74",
          800: "#fed7aa",
          900: "#ffedd5",
          950: "#fff7ed",
        },
      },
    },
  },
  plugins: [],
};
export default config;
