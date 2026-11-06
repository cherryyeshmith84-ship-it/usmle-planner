"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LANGUAGES = [
  { code: "en-IN", label: "English (India)" },
  { code: "en-US", label: "English (US)" },
  { code: "hi-IN", label: "Hindi" },
  { code: "te-IN", label: "Telugu" },
];

/**
 * "Analysis and plan" - one standing note per student (table
 * mentor_student_notes). The mentor can type it, or record the session with
 * the browser's built-in speech-to-text and have Claude turn the transcript
 * into: Student's concerns / What the mentor advised / Plan until the next
 * meeting. The summary is added to the top of the note for the mentor to
 * review and edit, then saved. Students see the note read-only on their own
 * Analysis page (readOnly = true).
 */
export default function StudentNotesEditor({
  studentId,
  mentorId,
  currentUserId,
  initialNote,
  initialUpdatedAt,
  readOnly = false,
}: {
  studentId: string;
  mentorId?: string;
  currentUserId?: string;
  initialNote: string | null;
  initialUpdatedAt: string | null;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState(initialNote ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(initialUpdatedAt);
  const [dirty, setDirty] = useState(false);

  // Voice recording state
  const [lang, setLang] = useState("en-IN");
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const recordingRef = useRef(false);

  useEffect(() => {
    return () => {
      recordingRef.current = false;
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  function startRecording() {
    setVoiceError(null);
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setVoiceError("Voice recording isn't supported in this browser. Please use Chrome, Edge or Safari.");
      return;
    }
    const rec = new SR();
    rec.lang = lang;
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
      if (finalText) setTranscript((prev) => prev + finalText);
      setInterim(interimText);
    };
    rec.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setVoiceError("Microphone access is blocked. Allow the microphone for this site in your browser, then try again.");
        recordingRef.current = false;
        setRecording(false);
      }
    };
    // Browsers stop listening after a pause - restart automatically until the mentor presses Stop.
    rec.onend = () => {
      if (recordingRef.current) {
        try {
          rec.start();
        } catch {
          /* ignore */
        }
      } else {
        setRecording(false);
      }
    };
    recognitionRef.current = rec;
    recordingRef.current = true;
    setRecording(true);
    try {
      rec.start();
    } catch {
      /* ignore */
    }
  }

  function stopRecording() {
    recordingRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    setRecording(false);
    setInterim("");
  }

  async function summarize() {
    if (recording) stopRecording();
    const text = transcript.trim();
    if (text.length < 40) {
      setVoiceError("Record a bit more of the conversation first.");
      return;
    }
    setSummarizing(true);
    setVoiceError(null);
    try {
      const res = await fetch("/api/mentorship/summarize-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, transcript: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create the summary.");
      const stamp = new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
      const block = `=== Session on ${stamp} ===\n${String(data.summary).trim()}`;
      setNote((prev) => (prev.trim() ? `${block}\n\n${prev}` : block));
      setDirty(true);
      setTranscript("");
      setInterim("");
    } catch (e) {
      setVoiceError(e instanceof Error ? e.message : "Could not create the summary.");
    }
    setSummarizing(false);
  }

  async function save() {
    if (readOnly || !mentorId || !currentUserId) return;
    const trimmed = note.trim();
    setSaving(true);
    setError(null);
    const supabase = createClient();

    if (!trimmed) {
      const { error: deleteError } = await supabase.from("mentor_student_notes").delete().eq("student_id", studentId);
      setSaving(false);
      if (deleteError) {
        setError(deleteError.message);
        return;
      }
      setSavedAt(null);
      setDirty(false);
      router.refresh();
      return;
    }

    const nowIso = new Date().toISOString();
    const { error: saveError } = await supabase.from("mentor_student_notes").upsert(
      {
        student_id: studentId,
        mentor_id: mentorId,
        created_by: currentUserId,
        note: trimmed,
        updated_at: nowIso,
      },
      { onConflict: "student_id" }
    );
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setSavedAt(nowIso);
    setDirty(false);
    router.refresh();
  }

  if (readOnly) {
    return (
      <div className="card">
        <p className="text-sm font-semibold mb-2">Analysis and plan from your mentor</p>
        <p className="text-xs text-slate-500 mb-2">
          What you and your mentor discussed and the plan until your next meeting. You can see this, but only
          your mentor can edit it.
        </p>
        {note.trim() ? (
          <p className="text-sm text-slate-300 whitespace-pre-wrap">{note}</p>
        ) : (
          <p className="text-sm text-slate-500 italic">Your mentor hasn&apos;t added anything yet.</p>
        )}
        {savedAt && <p className="text-xs text-slate-500 mt-2">Last updated {new Date(savedAt).toLocaleDateString()}</p>}
      </div>
    );
  }

  return (
    <div className="card">
      <p className="text-sm font-semibold mb-2">Analysis and plan</p>
      <p className="text-xs text-slate-500 mb-3">
        What the student is struggling with, what you advised, and the plan until your next meeting. The
        student can see this (read-only) on their own Analysis page; only you can edit it. Type it yourself, or
        record the session below and let it be written up for you.
      </p>

      <div className="rounded-lg border border-slate-800 p-3 mb-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {!recording ? (
            <button type="button" onClick={startRecording} className="btn-secondary text-xs">
              🎙 Record session
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="text-xs font-semibold rounded-lg px-3 py-2 bg-red-600 text-white animate-pulse"
            >
              ■ Stop recording
            </button>
          )}
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            disabled={recording}
            className="input text-xs py-1 px-2"
            title="Language being spoken"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          {recording && <span className="text-xs text-red-500 font-semibold">Listening...</span>}
        </div>

        {(transcript || interim) && (
          <>
            <textarea
              value={transcript + interim}
              onChange={(e) => {
                setTranscript(e.target.value);
                setInterim("");
              }}
              rows={5}
              className="input w-full text-xs resize-y"
              placeholder="Live transcript appears here..."
            />
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={summarize}
                disabled={summarizing}
                className="btn-primary text-xs"
              >
                {summarizing ? "Writing summary..." : "Create summary from recording"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTranscript("");
                  setInterim("");
                }}
                disabled={recording || summarizing}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Discard recording
              </button>
            </div>
          </>
        )}
        <p className="text-[11px] text-slate-500">
          Audio is not saved. Only the typed-out transcript is sent for summarising. It hears your microphone, so
          use it for in-person sessions or with the call on speaker.
        </p>
        {voiceError && <p className="text-xs text-red-400">{voiceError}</p>}
      </div>

      <textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setDirty(true);
        }}
        rows={12}
        placeholder="Student's concerns, what you advised, and the plan until the next meeting..."
        className="input w-full text-sm resize-y"
      />
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      <div className="flex items-center gap-3 mt-2">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className={dirty && !saving ? "btn-primary text-xs animate-pulse" : "btn-primary text-xs"}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {dirty && !saving && <p className="text-xs text-amber-400 font-semibold">Unsaved - click Save.</p>}
        {savedAt && !dirty && (
          <p className="text-xs text-slate-500">Last updated {new Date(savedAt).toLocaleDateString()}</p>
        )}
      </div>
    </div>
  );
}
