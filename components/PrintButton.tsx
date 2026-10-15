"use client";

export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-secondary text-sm">
      Print / Save as PDF
    </button>
  );
}
