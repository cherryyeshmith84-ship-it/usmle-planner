"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { STEP1_SYSTEMS } from "@/lib/qbankTypes";

export interface ConceptLibraryRow {
  id: string;
  system: string;
  topic: string;
  subtopic: string | null;
  concept: string;
  aliases: string[];
}

/**
 * The canonical System -> Topic -> Concept list, kept separate from the
 * question pool itself. The whole point is to fix typos/near-duplicates
 * (e.g. "VIPoma" vs "Vipoma" vs "VIP-oma") BEFORE they get typed into a
 * question's topic/subtopic/primary concept fields, since Smart Review and
 * Master Grid group everything by exact string match on those fields - a
 * single inconsistent concept name silently splinters into two "different"
 * cards/rows instead of one accurate one.
 */
export default function ConceptLibraryClient({
  initialRows,
  userId,
}: {
  initialRows: ConceptLibraryRow[];
  userId: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ConceptLibraryRow[]>(initialRows);
  const [system, setSystem] = useState<string>(STEP1_SYSTEMS[0] ?? "");
  const [topic, setTopic] = useState("");
  const [subtopic, setSubtopic] = useState("");
  const [concept, setConcept] = useState("");
  const [aliasesText, setAliasesText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim() || !concept.trim()) {
      setError("Topic and concept are both required.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const aliases = aliasesText
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a.length > 0);

    const { data, error: insertError } = await supabase
      .from("concept_library")
      .insert({
        system,
        topic: topic.trim(),
        subtopic: subtopic.trim() || null,
        concept: concept.trim(),
        aliases,
        created_by: userId,
      })
      .select()
      .single();

    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setRows((prev) => [...prev, data as ConceptLibraryRow]);
    setTopic("");
    setSubtopic("");
    setConcept("");
    setAliasesText("");
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this concept from the library?")) return;
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("concept_library").delete().eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
    router.refresh();
  }

  const grouped = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? rows.filter(
          (r) =>
            r.system.toLowerCase().includes(q) ||
            r.topic.toLowerCase().includes(q) ||
            r.concept.toLowerCase().includes(q) ||
            (r.subtopic ?? "").toLowerCase().includes(q) ||
            r.aliases.some((a) => a.toLowerCase().includes(q))
        )
      : rows;

    const bySystem = new Map<string, Map<string, ConceptLibraryRow[]>>();
    for (const r of filtered) {
      if (!bySystem.has(r.system)) bySystem.set(r.system, new Map());
      const byTopic = bySystem.get(r.system)!;
      if (!byTopic.has(r.topic)) byTopic.set(r.topic, []);
      byTopic.get(r.topic)!.push(r);
    }
    return bySystem;
  }, [rows, filter]);

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="font-semibold mb-3">Add a concept</h2>
        <form onSubmit={handleAdd} className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">System</label>
            <select className="input" value={system} onChange={(e) => setSystem(e.target.value)}>
              {STEP1_SYSTEMS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Topic</label>
            <input
              className="input"
              placeholder="e.g. Pancreatic neuroendocrine tumors"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Subtopic (optional)</label>
            <input
              className="input"
              placeholder="e.g. VIPoma / WDHA syndrome"
              value={subtopic}
              onChange={(e) => setSubtopic(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Concept</label>
            <input
              className="input"
              placeholder="e.g. VIPoma"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Aliases (optional, comma-separated)</label>
            <input
              className="input"
              placeholder="e.g. VIP-oma, Vipoma, WDHA syndrome"
              value={aliasesText}
              onChange={(e) => setAliasesText(e.target.value)}
            />
            <p className="text-xs text-slate-500 mt-1">
              Alternate spellings that should count as this same concept - not used for grouping
              yet, but kept here so it&apos;s ready once question tagging pulls from this list.
            </p>
          </div>
          {error && <p className="text-sm text-red-400 sm:col-span-2">{error}</p>}
          <div className="sm:col-span-2">
            <button className="btn-primary" disabled={saving}>
              {saving ? "Adding..." : "Add to library"}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold">
            {rows.length} concept{rows.length === 1 ? "" : "s"} in the library
          </h2>
          <input
            className="input w-56"
            placeholder="Filter..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        {grouped.size === 0 ? (
          <p className="text-sm text-slate-400">
            Nothing here yet - add your first concept above before tagging questions in bulk.
          </p>
        ) : (
          <div className="space-y-5">
            {Array.from(grouped.entries()).map(([sys, byTopic]) => (
              <div key={sys}>
                <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-2">
                  {sys}
                </p>
                <div className="space-y-3">
                  {Array.from(byTopic.entries()).map(([top, items]) => (
                    <div key={top}>
                      <p className="text-sm font-semibold text-slate-200 mb-1">{top}</p>
                      <div className="space-y-1">
                        {items.map((r) => (
                          <div
                            key={r.id}
                            className="flex items-start justify-between gap-2 text-sm text-slate-300 bg-slate-900/60 rounded-lg px-3 py-2"
                          >
                            <div>
                              <span>{r.concept}</span>
                              {r.subtopic && (
                                <span className="text-slate-500"> &middot; {r.subtopic}</span>
                              )}
                              {r.aliases.length > 0 && (
                                <span className="text-xs text-slate-500 block">
                                  aka {r.aliases.join(", ")}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDelete(r.id)}
                              className="text-slate-500 hover:text-red-400 text-xs shrink-0"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
