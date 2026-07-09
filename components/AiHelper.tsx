"use client";

import { useState } from "react";

interface ChatEntry {
  role: "student" | "ai";
  text: string;
}

/**
 * In-exam "Ask AI" chat button. Explains concepts/terms without revealing
 * which lettered choice is correct (see lib/examAiPrompt.ts for the rules
 * given to the model).
 */
export default function AiHelper({ onClose }: { onClose: () => void }) {
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || loading) return;
    setHistory((prev) => [...prev, { role: "student", text: trimmed }]);
    setMessage("");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/exam-ai-help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Something went wrong.");
      } else {
        setHistory((prev) => [...prev, { role: "ai", text: json.reply }]);
      }
    } catch {
      setError("Couldn't reach the AI helper. Check your connection.");
    }
    setLoading(false);
  }

  return (
    <div
      className="fixed inset-0 z-30 bg-black/70 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="card max-w-lg w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Ask AI</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-sm"
          >
            Close
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Ask about a term, lab value, or concept - paste the relevant part of the question if
          needed. It won&apos;t just hand you the answer letter.
        </p>

        <div className="flex-1 overflow-y-auto space-y-3 mb-3 pr-1">
          {history.length === 0 && (
            <p className="text-sm text-slate-500 italic">
              e.g. &quot;what does an elevated troponin I usually indicate?&quot;
            </p>
          )}
          {history.map((entry, i) => (
            <div
              key={i}
              className={`text-sm rounded-xl px-3 py-2 ${
                entry.role === "student"
                  ? "bg-brand-900/30 text-brand-100 ml-8"
                  : "bg-slate-800 text-slate-200 mr-8"
              }`}
            >
              {entry.text}
            </div>
          ))}
          {loading && <p className="text-xs text-slate-500">Thinking...</p>}
        </div>

        {error && <p className="text-sm text-red-400 mb-2">{error}</p>}

        <form onSubmit={handleAsk} className="flex gap-2">
          <input
            type="text"
            className="input"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask a question..."
          />
          <button type="submit" className="btn-primary shrink-0" disabled={loading}>
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
