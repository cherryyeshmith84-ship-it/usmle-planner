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

function fmt(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
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
  const [assessment, setAssessment] = useState("");
  const [plan, setPlan] = useState(""); // new instruction being typed / dictated
  const [planLog, setPlanLog] = useState(""); // instructions already applied for this date
  const [dirtyA, setDirtyA] = useState(false);
  const [, setDirtyP] = useState(false);
  const [savingA, setSavingA] = useState(false);
  const [, setSavingP] = useState(false);
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
    setPlan((p) => appendText(p, t));
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
      setPlan("");
      setPlanLog(e?.plan ?? "");
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
      p_task_date: null,
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

  // AI step: the instruction (typed or spoken) is interpreted on the server
  // and turned into planner edits (remove existing, add tasks on dates...).
  const [aiBusy, setAiBusy] = useState(false);
  async function applyPlan() {
    const text = plan.trim();
    if (!canWrite || !text || aiBusy) return;
    planDict.stop();
    setAiBusy(true);
    setSavingP(true);
    setError(null);
    setMsgP(null);
    try {
      const res = await fetch("/api/plan-assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentId, instruction: text, entryDate: date, today }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "Could not update the planner.");
        return;
      }
      const bits: string[] = [];
      if (j.removed) bits.push(`removed ${j.removed} task${j.removed === 1 ? "" : "s"}`);
      if (j.added) {
        const range = j.firstDate && j.lastDate && j.firstDate !== j.lastDate ? `${fmt(j.firstDate)} to ${fmt(j.lastDate)}` : j.firstDate ? fmt(j.firstDate) : "";
        bits.push(`added ${j.added} task${j.added === 1 ? "" : "s"}${range ? ` (${range})` : ""}`);
      }
      setMsgP(bits.length ? `Planner updated: ${bits.join(", ")}.` : j.summary || "Nothing to change in the planner.");
      setPlan("");
      setDirtyP(false);
      setPlanLog((l) => (l ? `${l}\n${text}` : text));
      await loadEntries();
      router.refresh();
    } finally {
      setAiBusy(false);
      setSavingP(false);
    }
  }
  const applyRef = useRef(applyPlan);
  applyRef.current = applyPlan;

  // Pressing Stop on the plan mic applies what was dictated straight away.
  function stopPlanMic() {
    planDict.stop();
    setTimeout(() => void applyRef.current(), 900);
  }

  async function removeEntry() {
    if (!canEdit) return;
    if (!confirm(`Delete the entry for ${fmt(date)}? This does not remove tasks already added to the planner.`)) return;
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

  function micButton(d: ReturnType<typeof useDictation>, onStart: () => void, onStop: () => void = d.stop) {
    if (!canWrite) return null;
    return d.listening ? (
      <button
        type="button"
        onClick={onStop}
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
              ? "Write or dictate what you discussed (Assessment) and what the student should do next (Plan). In Plan, just say or type what you want, like you would tell an assistant (for example: \"remove everything from tomorrow and add 40 UWorld questions daily for 20 days\"). It is understood and applied to the study planner; the Assessment has its own Save button."
              : isStudentSelf
              ? studentAccess
                ? "Your mentor lets you write here. Type or dictate what you discussed and your plan; what you say in the plan is applied to your study planner."
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
          Let the student write here too (what they say in the plan also updates their planner)
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
              {micButton(planDict, startPlan, stopPlanMic)}
            </div>
            <p className="text-[11px] text-slate-500 mb-1">
              Say or type it naturally, e.g. &ldquo;remove everything from tomorrow and add 40 UWorld questions daily for 20 days, plus First Aid review&rdquo;.
              Press Stop on the mic or &ldquo;Update planner&rdquo; to apply it.
            </p>
            <textarea
              value={plan}
              onChange={(e) => {
                setPlan(e.target.value);
                setDirtyP(true);
              }}
              readOnly={!canWrite}
              rows={7}
              placeholder={canWrite ? "Tell the planner what to change..." : "Nothing added for this date."}
              className="input w-full text-sm resize-y"
            />
            {planDict.listening && (
              <p className="text-xs text-red-500 font-semibold mt-1">
                Listening... <span className="text-slate-500 font-normal">{planDict.interim}</span>
              </p>
            )}
            {planDict.error && <p className="text-xs text-red-400 mt-1">{planDict.error}</p>}
            {canWrite && (
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => void applyPlan()}
                  disabled={aiBusy || !plan.trim()}
                  className={plan.trim() && !aiBusy ? "btn-primary text-sm animate-pulse" : "btn-primary text-sm"}
                >
                  {aiBusy ? "Updating planner..." : "Update planner"}
                </button>
                {msgP && !aiBusy && <span className="text-xs text-green-600 font-semibold">{msgP}</span>}
              </div>
            )}
            {planLog.trim() && (
              <div className="mt-3">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Already applied on this date</p>
                <p className="text-xs text-slate-400 whitespace-pre-wrap rounded-lg border border-slate-800 px-3 py-2">{planLog}</p>
              </div>
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
