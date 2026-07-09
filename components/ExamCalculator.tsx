"use client";

import { useState } from "react";

const BUTTONS: Array<{ label: string; type: "digit" | "op" | "action" }> = [
  { label: "C", type: "action" },
  { label: "+/-", type: "action" },
  { label: "%", type: "op" },
  { label: "/", type: "op" },
  { label: "7", type: "digit" },
  { label: "8", type: "digit" },
  { label: "9", type: "digit" },
  { label: "*", type: "op" },
  { label: "4", type: "digit" },
  { label: "5", type: "digit" },
  { label: "6", type: "digit" },
  { label: "-", type: "op" },
  { label: "1", type: "digit" },
  { label: "2", type: "digit" },
  { label: "3", type: "digit" },
  { label: "+", type: "op" },
  { label: "0", type: "digit" },
  { label: ".", type: "digit" },
  { label: "√", type: "op" },
  { label: "=", type: "action" },
];

function compute(a: number, b: number, op: string): number {
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "*":
      return a * b;
    case "/":
      return b === 0 ? NaN : a / b;
    case "%":
      return a % b;
    default:
      return b;
  }
}

/** Simple in-exam calculator, styled to match UWorld's basic calculator. */
export default function ExamCalculator({ onClose }: { onClose: () => void }) {
  const [display, setDisplay] = useState("0");
  const [stored, setStored] = useState<number | null>(null);
  const [pendingOp, setPendingOp] = useState<string | null>(null);
  const [overwrite, setOverwrite] = useState(true);

  function pressDigit(d: string) {
    if (d === "." && display.includes(".")) return;
    if (overwrite) {
      setDisplay(d === "." ? "0." : d);
      setOverwrite(false);
    } else {
      setDisplay((prev) => (prev === "0" && d !== "." ? d : prev + d));
    }
  }

  function pressOp(op: string) {
    if (op === "√") {
      const val = Math.sqrt(parseFloat(display));
      setDisplay(Number.isFinite(val) ? String(val) : "Error");
      setOverwrite(true);
      return;
    }
    const current = parseFloat(display);
    if (stored !== null && pendingOp) {
      const result = compute(stored, current, pendingOp);
      setStored(result);
      setDisplay(String(result));
    } else {
      setStored(current);
    }
    setPendingOp(op);
    setOverwrite(true);
  }

  function pressEquals() {
    if (stored === null || !pendingOp) return;
    const current = parseFloat(display);
    const result = compute(stored, current, pendingOp);
    setDisplay(Number.isFinite(result) ? String(result) : "Error");
    setStored(null);
    setPendingOp(null);
    setOverwrite(true);
  }

  function pressClear() {
    setDisplay("0");
    setStored(null);
    setPendingOp(null);
    setOverwrite(true);
  }

  function pressSign() {
    setDisplay((prev) =>
      prev.startsWith("-") ? prev.slice(1) : prev === "0" ? prev : `-${prev}`
    );
  }

  function handlePress(btn: { label: string; type: string }) {
    if (btn.type === "digit") pressDigit(btn.label);
    else if (btn.label === "C") pressClear();
    else if (btn.label === "+/-") pressSign();
    else if (btn.label === "=") pressEquals();
    else pressOp(btn.label);
  }

  return (
    <div
      className="fixed inset-0 z-30 bg-black/70 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div className="card w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Calculator</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-sm"
          >
            Close
          </button>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-3 text-right text-2xl font-mono mb-3 truncate">
          {display}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {BUTTONS.map((btn) => (
            <button
              key={btn.label}
              type="button"
              onClick={() => handlePress(btn)}
              className={`rounded-lg py-3 text-sm font-semibold transition ${
                btn.label === "="
                  ? "bg-brand-900/40 text-brand-300 hover:bg-brand-900/60 border border-brand-700"
                  : btn.label === "C"
                  ? "bg-red-900/40 text-red-400 hover:bg-red-900/60"
                  : btn.type === "op"
                  ? "bg-slate-800 text-brand-300 hover:bg-slate-700"
                  : "bg-slate-800 text-slate-200 hover:bg-slate-700"
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
