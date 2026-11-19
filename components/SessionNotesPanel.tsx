"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LANG = "en-IN";

type Entry = {
  id: string;
  entry_date: string;
  assessment: string | null;
  plan: string | null;
  plan_task_date: string | null;
};

function isoLocal(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return isoLocal(d);
}

function fmt(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// Same rule the database uses: one task per non-empty line, bullets/numbers removed.
function planLines(plan: string) {
  const out: string[] = [];
  for (const raw of plan.split("\n")) {
    const t = raw.replace(/^\s*([-*•]|\d+[.)])\s*/, "").trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Browser speech-to-text. Finished sentences are appended to the box live;
 *  the grey line shows what is still being heard. */
function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<any>(null);
  const onRef = useRef(false);
  const cbRef = useRef(onText);
  cbRef.current = onText;

  const stop = useCallback(() => {
    onRef.current = false;
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
    setInterim("");
  }, []);

  const start = useCallback(() => {
    setError(null);
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError("Voice typing isn't supported in this browser. Please use Chrome, Edge or Safari.");
      return;
    }
    const rec = new SR();
    rec.lang = LANG;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event: any) => {
      let interimText = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript + " ";
        else interimText += r[0].transcript;
      }
      if (finalText) cbRef.current(finalText);
      setInterim(interimText);
    };
    rec.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Microphone access is blocked. Allow the microphone for this site in your browser, then try again.");
        onRef.current = false;
        setListening(false);
      }
    };
    // Browsers stop listening after a pause - restart until Stop is pressed.
    rec.onend = () => {
      if (onRef.current) {
        try {
          rec.start();
        } catch {
          /* ignore */
        }
      } else {
        setListening(false);
      }
    };
    recRef.current = rec;
    onRef.current = true;
    setListening(true);
    try {
      rec.start();
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { listening, interim, error, start, stop };
}

function appendText(prev: string, add: string) {
  const a = add.trim();
  if (!a) return prev;
  return prev.trim() ? `${prev.replace(/\s+$/, "")} ${a}` : a;
}

/**
 * Two boxes per session date: "Assessment" (what was discussed) and "Plan"
 * (what to do next). Each has its own microphone and its own Save button.
 *
 * The Plan updates the student's study planner automatically: about a second
 * and a half after you stop typing or speaking, every line of the plan is
 * synced as a task on the chosen planner date (the Save plan button does the
 * same immediately). The Assessment is saved with its own Save button.
 *
 * Mentors and admins can always write. A mentor/admin can switch on "Let the
 * student write here too"; then the student can also type or dictate (their
 * plan lines also go into their own planner). Everyone else sees it read-only.
 */
export default function SessionNotesPanel({
  studentId,
  canEdit,
  isStudentSelf = false,
  legacyNote = null,
}: {
  studentId: string;
  canEdit: boolean; // mentor or admin
  isStudentSelf?: boolean;
  legacyNote?: string | null;
}) {
  const router = useRouter();
  const today = isoLocal(new Date());
  const [date, setDate] = useState(today);
  const [taskDate, setTaskDate] = useState(addDays(today, 1));
  const [assessment, setAssessment] = useState("");
  const [plan, setPlan] = useState("");
  const [dirtyA, setDirtyA] = useState(false);
  const [dirtyP, setDirtyP] = useState(false);
  const [savingA, setSavingA] = useState(false);
  const [savingP, setSavingP] = useState(false);
  const [msgA, setMsgA] = useState<string | null>(null);
  const [msgP, setMsgP] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [studentAccess, setStudentAccess] = useState(false);
  const [accessBusy, setAccessBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const canWrite = canEdit || (isStudentSelf && studentAccess);

  const assessDict = useDictation((t) => {
    setAssessment((p) => appendText(p, t));
    setDirtyA(true);
  });
  const planDict = useDictation((t) => {
    setPlan((p) => (p.trim() ? `${p.replace(/\s+$/, "")}\n${t.trim()}` : t.trim()));
    setDirtyP(true);
  });

  // One microphone at a time.
  function startAssess() {
    planDict.stop();
    assessDict.start();
  }
  function startPlan() {
    assessDict.stop();
    planDict.start();
  }

  const loadEntries = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("session_entries")
      .select("id, entry_date, assessment, plan, plan_task_date")
      .eq("student_id", studentId)
      .order("entry_date", { ascending: false })
      .limit(40);
    setEntries((data ?? []) as Entry[]);
  }, [studentId]);

  // access switch + history
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("student_session_note_access")
        .select("allowed")
        .eq("student_id", studentId)
        .maybeSingle();
      setStudentAccess(!!(data as { allowed: boolean } | null)?.allowed);
      await loadEntries();
    })();
  }, [studentId, loadEntries]);

  // load the entry for the chosen date
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      assessDict.stop();
      planDict.stop();
      const supabase = createClient();
      const { data } = await supabase
        .from("session_entries")
        .select("id, entry_date, assessment, plan, plan_task_date")
        .eq("student_id", studentId)
        .eq("entry_date", date)
        .maybeSingle();
      if (cancelled) return;
      const e = data as Entry | null;
      setAssessment(e?.assessment ?? "");
      setPlan(e?.plan ?? "");
      setTaskDate(e?.plan_task_date ?? addDays(date, 1));
      setDirtyA(false);
      setDirtyP(false);
      setMsgA(null);
      setMsgP(null);
      setError(null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, date]);

  async function saveAssessment() {
    if (!canWrite) return;
    assessDict.stop();
    setSavingA(true);
    setError(null);
    setMsgA(null);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("save_session_entry", {
      p_student_id: studentId,
      p_entry_date: date,
      p_assessment: assessment,
      p_plan: null,
      p_task_date: taskDate,
      p_part: "assessment",
    });
    setSavingA(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDirtyA(false);
    setMsgA(`Assessment saved for ${fmt(date)}.`);
    await loadEntries();
  }

  // `auto` = triggered by the debounce timer (keeps the mic running).
  const savePlan = useCallback(
    async (auto = false) => {
      if (!canWrite) return;
      if (!auto) planDict.stop();
      setSavingP(true);
      setError(null);
      if (!auto) setMsgP(null);
      const supabase = createClient();
      const { data, error: err } = await supabase.rpc("save_session_entry", {
        p_student_id: studentId,
        p_entry_date: date,
        p_assessment: null,
        p_plan: plan,
        p_task_date: taskDate,
        p_part: "plan",
      });
      setSavingP(false);
      if (err) {
        setError(err.message);
        return;
      }
      const n = planLines(plan).length;
      setDirtyP(false);
      setMsgP(
        n > 0
          ? `Planner updated: ${n} task${n === 1 ? "" : "s"} on ${fmt(taskDate)}.`
          : "Plan saved (no tasks in the planner for this date)."
      );
      void data;
      await loadEntries();
      router.refresh();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canWrite, studentId, date, plan, taskDate]
  );

  // Auto-update the planner shortly after the plan (or its date) changes.
  const savePlanRef = useRef(savePlan);
  savePlanRef.current = savePlan;
  useEffect(() => {
    if (!dirtyP || !canWrite || loading) return;
    const t = setTimeout(() => {
      void savePlanRef.current(true);
    }, 1500);
    return () => clearTimeout(t);
  }, [plan, taskDate, dirtyP, canWrite, loading]);

  async function removeEntry() {
    if (!canEdit) return;
    if (!confirm(`Delete the entry for ${fmt(date)}? Planner tasks created from its plan are removed too.`)) return;
    const supabase = createClient();
    const { error: err } = await supabase.from("session_entries").delete().eq("student_id", studentId).eq("entry_date", date);
    if (err) {
      setError(err.message);
      return;
    }
    setAssessment("");
    setPlan("");
    setDirtyA(false);
    setDirtyP(false);
    setMsgA(null);
    setMsgP(`Deleted the entry for ${fmt(date)}.`);
    await loadEntries();
    router.refresh();
  }

  async function toggleAccess(next: boolean) {
    setAccessBusy(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: err } = await supabase
      .from("student_session_note_access")
      .upsert(
        { student_id: studentId, allowed: next, updated_by: user?.id ?? null, updated_at: new Date().toISOString() },
        { onConflict: "student_id" }
      );
    setAccessBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setStudentAccess(next);
  }

  const lines = planLines(plan);

  function micButton(d: ReturnType<typeof useDictation>, onStart: () => void) {
    if (!canWrite) return null;
    return d.listening ? (
      <button
        type="button"
        onClick={d.stop}
        className="text-xs font-semibold rounded-lg px-3 py-1.5 bg-red-600 text-white animate-pulse"
      >
        ■ Stop
      </button>
    ) : (
      <button type="button" onClick={onStart} className="btn-secondary text-xs py-1.5 px-3">
        🎙 Speak
      </button>
    );
  }

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div>
          <p className="text-sm font-semibold">Assessment and plan</p>
          <p className="text-xs text-slate-500 mt-1">
            {canEdit
              ? "Write or dictate what you discussed (Assessment) and what the student should do next (Plan). The Plan goes into the student's study planner automatically, one task per line; the Assessment has its own Save button."
              : isStudentSelf
              ? studentAccess
                ? "Your mentor lets you write here. Type or dictate what you discussed and your plan; each line of the plan is added to your study planner automatically."
                : "What you and your mentor discussed and the plan. You can read this; your mentor can give you access to write here."
              : "Read-only view of the assessment and plan for each date."}
          </p>
        </div>
        <label className="text-xs text-slate-400 flex items-center gap-2">
          Date
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="input py-1 text-sm" />
        </label>
      </div>

      {canEdit && (
        <label className="flex items-center gap-2 text-xs text-slate-400 mb-3 cursor-pointer">
          <input
            type="checkbox"
            checked={studentAccess}
            disabled={accessBusy}
            onChange={(e) => toggleAccess(e.target.checked)}
            className="w-4 h-4"
          />
          Let the student write here too (their plan lines also go into their planner)
        </label>
      )}

      {loading ? (
        <p className="text-sm text-slate-500 py-6">Loading...</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Assessment */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Assessment</p>
              {micButton(assessDict, startAssess)}
            </div>
            <p className="text-[11px] text-slate-500 mb-1">What was discussed: concerns, strengths, weaknesses.</p>
            <textarea
              value={assessment}
              onChange={(e) => {
                setAssessment(e.target.value);
                setDirtyA(true);
              }}
              readOnly={!canWrite}
              rows={12}
              placeholder={canWrite ? "What the student is struggling with, what you discussed..." : "Nothing added for this date."}
              className="input w-full text-sm resize-y"
            />
            {assessDict.listening && (
              <p className="text-xs text-red-500 font-semibold mt-1">
                Listening... <span className="text-slate-500 font-normal">{assessDict.interim}</span>
              </p>
            )}
            {assessDict.error && <p className="text-xs text-red-400 mt-1">{assessDict.error}</p>}
            {canWrite && (
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={saveAssessment}
                  disabled={savingA || !dirtyA}
                  className={dirtyA && !savingA ? "btn-primary text-sm animate-pulse" : "btn-primary text-sm"}
                >
                  {savingA ? "Saving..." : "Save assessment"}
                </button>
                {dirtyA && !savingA && <span className="text-xs text-amber-400 font-semibold">Unsaved - click Save.</span>}
                {msgA && !dirtyA && <span className="text-xs text-green-600 font-semibold">{msgA}</span>}
              </div>
            )}
          </div>

          {/* Plan */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Plan</p>
              {micButton(planDict, startPlan)}
            </div>
            <p className="text-[11px] text-slate-500 mb-1">
              One task per line, for example &ldquo;Renal 40 questions&rdquo; or &ldquo;Review acid-base notes&rdquo;.
              These go into the study planner automatically.
            </p>
            <textarea
              value={plan}
              onChange={(e) => {
                setPlan(e.target.value);
                setDirtyP(true);
              }}
              readOnly={!canWrite}
              rows={12}
              placeholder={canWrite ? "Renal 40 questions\nReview acid-base notes\nFA pages 55-60" : "Nothing added for this date."}
              className="input w-full text-sm resize-y"
            />
            {planDict.listening && (
              <p className="text-xs text-red-500 font-semibold mt-1">
                Listening... <span className="text-slate-500 font-normal">{planDict.interim}</span>
              </p>
            )}
            {planDict.error && <p className="text-xs text-red-400 mt-1">{planDict.error}</p>}
            {canWrite && (
              <>
                <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-slate-400">
                  <span>
                    Planner tasks ({lines.length}) go on
                  </span>
                  <input
                    type="date"
                    value={taskDate}
                    onChange={(e) => {
                      if (e.target.value) {
                        setTaskDate(e.target.value);
                        setDirtyP(true);
                      }
                    }}
                    className="input py-1 text-sm"
                  />
                </div>
                <div className="mt-2 flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => savePlan(false)}
                    disabled={savingP || !dirtyP}
                    className={dirtyP && !savingP ? "btn-primary text-sm animate-pulse" : "btn-primary text-sm"}
                  >
                    {savingP ? "Updating planner..." : "Save plan"}
                  </button>
                  {dirtyP && !savingP && (
                    <span className="text-xs text-amber-400 font-semibold">Updating the planner in a moment...</span>
                  )}
                  {msgP && !dirtyP && !savingP && <span className="text-xs text-green-600 font-semibold">{msgP}</span>}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400 mt-3">{error}</p>}

      {canEdit && entries.some((e) => e.entry_date === date) && (
        <div className="mt-3">
          <button type="button" onClick={removeEntry} className="text-xs text-red-400 hover:text-red-300">
            Delete this date&apos;s entry
          </button>
        </div>
      )}

      {entries.length > 0 && (
        <div className="mt-6 pt-4 border-t border-slate-800">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Previous entries</p>
          <div className="space-y-1.5">
            {entries.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setDate(e.entry_date)}
                className={`w-full text-left rounded-lg border px-3 py-2 text-xs transition ${
                  e.entry_date === date ? "border-brand-400 bg-brand-900/20" : "border-slate-800 hover:border-slate-600"
                }`}
              >
                <span className="font-semibold text-slate-300">{fmt(e.entry_date)}</span>
                <span className="text-slate-500 line-clamp-1 block">
                  {(e.assessment || e.plan || "").replace(/\s+/g, " ")}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {legacyNote && legacyNote.trim() && (
        <details className="mt-4 text-xs">
          <summary className="cursor-pointer text-slate-500">Earlier standing note</summary>
          <p className="text-slate-400 whitespace-pre-wrap mt-2">{legacyNote}</p>
        </details>
      )}
    </div>
  );
}
