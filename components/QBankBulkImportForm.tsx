"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { blankQBankChoice, parseFullQBankQuestionTemplate, type ParsedQBankTemplate } from "@/lib/qbank";

interface ConceptOption {
  id: string;
  system: string;
  topic: string;
  subtopic: string | null;
  concept: string;
}

interface ParsedItem {
  key: string;
  raw: string;
  parsed: ParsedQBankTemplate | null;
  parseError: string | null;
  primaryConceptId: string | null;
  conceptSearch: string;
  conceptDropdownOpen: boolean;
  excluded: boolean;
}

/**
 * Splits one big paste into separate question templates wherever a line
 * contains nothing but three or more dashes - a delimiter that's very
 * unlikely to show up naturally inside an authored question (the parser
 * itself only ever uses a dash inline, e.g. "A - Close distractor", never
 * alone on its own line).
 */
function splitTemplates(raw: string): string[] {
  return raw
    .split(/^[ \t]*-{3,}[ \t]*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Bulk-import flow for adding many questions to the pool at once, built on
 * top of the exact same parseFullQBankQuestionTemplate() the single-question
 * editor's "paste to autofill" uses - so anything that already parses
 * correctly there parses the same way here, just once per question instead
 * of once per page load.
 *
 * Every imported question is saved as "under_review" (not draft, not
 * published) so it lands directly in the existing Review queue
 * (/admin/qbank/review) for a final one-by-one pass - reusing that page's
 * quality checklist and Publish / Send back to draft actions instead of
 * building a second review UI here. Nothing bulk-imported ever becomes
 * visible to students without an admin explicitly publishing it.
 */
export default function QBankBulkImportForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [bulkText, setBulkText] = useState("");
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [conceptOptions, setConceptOptions] = useState<ConceptOption[]>([]);
  const [conceptsLoaded, setConceptsLoaded] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number } | null>(null);

  async function loadConcepts(): Promise<ConceptOption[]> {
    if (conceptsLoaded) return conceptOptions;
    const supabase = createClient();
    const { data } = await supabase
      .from("concept_library")
      .select("id, system, topic, subtopic, concept");
    const loaded = data ?? [];
    setConceptOptions(loaded);
    setConceptsLoaded(true);
    return loaded;
  }

  async function handleParse() {
    setError(null);
    setResult(null);
    setParsing(true);
    const concepts = await loadConcepts();
    const chunks = splitTemplates(bulkText);
    setParsing(false);
    if (chunks.length === 0) {
      setError(
        "Paste at least one question template first, and separate multiple questions with a line containing just: ---"
      );
      return;
    }

    const nextItems: ParsedItem[] = chunks.map((raw, i) => {
      const parsed = parseFullQBankQuestionTemplate(raw);
      const parseError = parsed
        ? null
        : 'Couldn\'t find at least 2 lettered/numbered options (like "A. ..." or "1. ...") in this block - it was skipped.';

      let primaryConceptId: string | null = null;
      if (parsed?.primaryConcept) {
        const match = concepts.find(
          (c) => c.concept.toLowerCase() === parsed.primaryConcept.toLowerCase()
        );
        if (match) primaryConceptId = match.id;
      }

      return {
        key: `item-${i}-${Math.random().toString(36).slice(2, 8)}`,
        raw,
        parsed,
        parseError,
        primaryConceptId,
        conceptSearch: "",
        conceptDropdownOpen: false,
        excluded: false,
      };
    });
    setItems(nextItems);
  }

  function updateItem(key: string, patch: Partial<ParsedItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  function filteredConceptsFor(search: string) {
    const q = search.trim().toLowerCase();
    const sorted = [...conceptOptions].sort((a, b) => a.concept.localeCompare(b.concept));
    if (!q) return sorted.slice(0, 30);
    return sorted
      .filter(
        (c) =>
          c.concept.toLowerCase().includes(q) ||
          c.topic.toLowerCase().includes(q) ||
          c.system.toLowerCase().includes(q)
      )
      .slice(0, 30);
  }

  const importable = items.filter((it) => !it.excluded && it.parsed);

  async function handleImport() {
    if (importable.length === 0) {
      setError("No valid questions to import.");
      return;
    }
    setSaving(true);
    setError(null);

    const payloadRows = importable.map((it) => {
      const parsed = it.parsed!;
      const choices = parsed.choices.map((c) => ({
        ...blankQBankChoice(),
        text: c.text,
        distance: c.distance,
        rationale: c.rationale,
        error_note: c.error_note,
        error_type: c.error_type,
        confused_with: c.confused_with,
        weak_concept: c.weak_concept,
        key_concept: c.key_concept,
      }));
      const correctChoiceId = parsed.correctIndex >= 0 ? choices[parsed.correctIndex].id : "";
      const secondaryConcepts = parsed.secondaryConcepts;

      return {
        question: parsed.question,
        question_image_url: null,
        choices,
        correct_choice_id: correctChoiceId,
        explanation: parsed.explanation,
        explanation_image_url: null,
        subjects: parsed.subjects,
        systems: parsed.systems,
        meta: {
          educational_objective: parsed.educationalObjective || undefined,
          key_takeaway: parsed.keyTakeaway || undefined,
          exam_trap: parsed.examTrap || undefined,
          topic: parsed.topic || undefined,
          subtopic: parsed.subtopic || undefined,
          primary_concept: parsed.primaryConcept || undefined,
          primary_concept_id: it.primaryConceptId ?? undefined,
          secondary_concepts: secondaryConcepts.length > 0 ? secondaryConcepts : undefined,
          difficulty: parsed.difficulty || undefined,
          question_type: parsed.questionType || undefined,
          status: "under_review" as const,
        },
        created_by: userId,
      };
    });

    const supabase = createClient();
    const { error: insertError } = await supabase.from("qbank_questions").insert(payloadRows);
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setResult({ imported: payloadRows.length });
    setItems([]);
    setBulkText("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="font-semibold mb-1">1. Paste your questions</h2>
        <p className="text-sm text-slate-400 mb-3">
          Paste one or more full question templates - same format the single question editor
          accepts (vignette, lettered choices, correct answer, explanations, classification
          block). Separate each question with a line containing just three dashes:
        </p>
        <pre className="text-xs text-brand-300 bg-slate-900 rounded px-3 py-2 mb-3 inline-block">---</pre>
        <textarea
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          rows={14}
          placeholder={"Question 1 template here...\n\n---\n\nQuestion 2 template here..."}
          className="input font-mono text-xs"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={handleParse}
            disabled={parsing || !bulkText.trim()}
            className="btn-primary"
          >
            {parsing ? "Parsing…" : "Parse questions"}
          </button>
          {items.length > 0 && (
            <span className="text-sm text-slate-400">
              {items.filter((i) => i.parsed).length} of {items.length} parsed successfully
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="card border-red-900/50 bg-red-950/20">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {result && (
        <div className="card border-green-900/50 bg-green-950/20">
          <p className="text-sm text-green-300 mb-1">
            Imported {result.imported} question{result.imported === 1 ? "" : "s"} as &quot;Under
            review&quot;.
          </p>
          <p className="text-xs text-slate-400">
            Nothing is visible to students yet. Finish tagging Primary Concept where needed and
            publish each one from the{" "}
            <Link href="/admin/qbank/review" className="text-brand-400 hover:text-brand-300">
              Review queue
            </Link>
            .
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-semibold">2. Review before importing</h2>
          {items.map((it, idx) => (
            <div
              key={it.key}
              className={`card ${it.excluded ? "opacity-40" : ""} ${
                it.parseError ? "border-amber-900/50" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <span className="text-xs font-semibold text-slate-500">#{idx + 1}</span>
                <button
                  type="button"
                  onClick={() => updateItem(it.key, { excluded: !it.excluded })}
                  className="text-xs font-medium text-slate-400 hover:text-slate-200"
                >
                  {it.excluded ? "Include" : "Exclude"}
                </button>
              </div>

              {it.parseError ? (
                <div>
                  <p className="text-sm text-amber-400 mb-2">{it.parseError}</p>
                  <pre className="text-xs text-slate-500 bg-slate-900 rounded px-3 py-2 max-h-24 overflow-y-auto whitespace-pre-wrap">
                    {it.raw.slice(0, 300)}
                    {it.raw.length > 300 ? "…" : ""}
                  </pre>
                </div>
              ) : (
                it.parsed && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-slate-200 line-clamp-2">
                      {it.parsed.question || "(no question stem found)"}
                    </p>

                    <div className="flex flex-wrap gap-1.5">
                      {it.parsed.subjects.map((s) => (
                        <span
                          key={s}
                          className="text-xs font-medium bg-brand-900/30 text-brand-300 rounded-full px-2 py-0.5"
                        >
                          {s}
                        </span>
                      ))}
                      {it.parsed.systems.map((s) => (
                        <span
                          key={s}
                          className="text-xs font-medium bg-slate-800 text-slate-300 rounded-full px-2 py-0.5"
                        >
                          {s}
                        </span>
                      ))}
                      {it.parsed.subjects.length === 0 && it.parsed.systems.length === 0 && (
                        <span className="text-xs text-amber-400">No subject/system detected</span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-4 text-xs text-slate-400">
                      <span>{it.parsed.choices.length} choices</span>
                      <span>
                        Correct answer:{" "}
                        {it.parsed.correctIndex >= 0 ? (
                          <span className="text-green-400">
                            {String.fromCharCode(65 + it.parsed.correctIndex)}
                          </span>
                        ) : (
                          <span className="text-amber-400">not detected</span>
                        )}
                      </span>
                      {it.parsed.difficulty && <span>Difficulty: {it.parsed.difficulty}</span>}
                    </div>

                    <div className="relative">
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Primary concept
                      </label>
                      {it.primaryConceptId ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-200 bg-slate-800 rounded-full px-3 py-1">
                            {conceptOptions.find((c) => c.id === it.primaryConceptId)?.concept ??
                              it.parsed.primaryConcept}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateItem(it.key, { primaryConceptId: null })}
                            className="text-xs text-slate-500 hover:text-slate-300"
                          >
                            Change
                          </button>
                        </div>
                      ) : (
                        <>
                          <input
                            type="text"
                            value={it.conceptSearch}
                            onChange={(e) =>
                              updateItem(it.key, { conceptSearch: e.target.value, conceptDropdownOpen: true })
                            }
                            onFocus={() => updateItem(it.key, { conceptDropdownOpen: true })}
                            onBlur={() => updateItem(it.key, { conceptDropdownOpen: false })}
                            placeholder={
                              it.parsed.primaryConcept
                                ? `"${it.parsed.primaryConcept}" not in Concept Library - search to link`
                                : "Search Concept Library…"
                            }
                            className="input text-sm"
                          />
                          {it.conceptDropdownOpen && (
                            <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-slate-900 border border-slate-700 rounded-lg shadow-lg">
                              {filteredConceptsFor(it.conceptSearch).map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    updateItem(it.key, { primaryConceptId: c.id, conceptDropdownOpen: false });
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
                                >
                                  {c.concept}
                                  <span className="text-xs text-slate-500 ml-2">
                                    {c.topic}
                                  </span>
                                </button>
                              ))}
                              {filteredConceptsFor(it.conceptSearch).length === 0 && (
                                <p className="px-3 py-2 text-xs text-slate-500">
                                  No matching concept. You can leave this blank and set it later
                                  from the question editor.
                                </p>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          ))}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleImport}
              disabled={saving || importable.length === 0}
              className="btn-primary"
            >
              {saving
                ? "Importing…"
                : `Import ${importable.length} question${importable.length === 1 ? "" : "s"}`}
            </button>
            <span className="text-sm text-slate-400">Saved as &quot;Under review&quot;, not visible to students.</span>
          </div>
        </div>
      )}
    </div>
  );
}
