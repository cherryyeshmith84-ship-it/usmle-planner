"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatMessageTime, type MentorMessage } from "@/lib/mentorMessages";

/**
 * Reusable chat thread for one (mentor, student) pair - used both from the
 * student side (MentorBrowseClient, once they've picked a mentor) and the
 * mentor side (MentorAvailabilityClient, once they've picked a student to
 * reply to). One thread per mentor+student pair, not per booked slot, so a
 * mentor can share a meeting link or answer a question any time, not just
 * around a specific session.
 *
 * No websocket/Realtime subscription here on purpose - keeping this to a
 * plain fetch-on-mount + short poll interval is simpler to hand-deliver and
 * debug through manual GitHub pastes than wiring up Supabase Realtime
 * channels, at the cost of messages taking a few seconds to appear instead
 * of being instant.
 */
export default function MentorChatPanel({
  mentorId,
  studentId,
  otherPartyLabel,
}: {
  mentorId: string;
  studentId: string;
  otherPartyLabel: string;
}) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MentorMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadMessages() {
    const supabase = createClient();
    const { data, error: fetchError } = await supabase
      .from("mentor_messages")
      .select("*")
      .eq("mentor_id", mentorId)
      .eq("student_id", studentId)
      .order("created_at", { ascending: true });
    if (!fetchError) setMessages((data ?? []) as MentorMessage[]);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!cancelled) setCurrentUserId(user?.id ?? null);
    })();
    loadMessages();
    const interval = setInterval(loadMessages, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorId, studentId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function send() {
    const body = text.trim();
    if (!body || !currentUserId) return;
    setSending(true);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("mentor_messages").insert({
      mentor_id: mentorId,
      student_id: studentId,
      sender_id: currentUserId,
      body,
    });
    setSending(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setText("");
    loadMessages();

    // Fire-and-forget in-app notification for whoever didn't just send this
    // - same route handles both directions, since the server resolves who
    // the sender/recipient actually are from the caller's own session, not
    // from anything in this request body. A failure here shouldn't block
    // the message itself, which already sent successfully above.
    fetch("/api/notifications/message-sent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mentorId, studentId, preview: body }),
    }).catch(() => {});
  }

  return (
    <div className="card flex flex-col" style={{ height: 420 }}>
      <p className="text-sm font-semibold mb-3">Messages with {otherPartyLabel}</p>

      <div className="flex-1 overflow-y-auto space-y-2 mb-3 pr-1">
        {loading ? (
          <p className="text-xs text-slate-500">Loading...</p>
        ) : messages.length === 0 ? (
          <p className="text-xs text-slate-500">
            No messages yet - say hello or drop a meeting link to get started.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === currentUserId;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    mine ? "bg-brand-600 text-white" : "bg-slate-800 text-slate-200"
                  }`}
                >
                  <p className="whitespace-pre-line break-words">{m.body}</p>
                  <p className={`text-[10px] mt-1 ${mine ? "text-brand-100" : "text-slate-500"}`}>
                    {formatMessageTime(m.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

      <div className="flex gap-2">
        <textarea
          className="input flex-1 min-h-[44px] max-h-24 text-sm"
          placeholder="Type a message or paste a meeting link..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || !text.trim()}
          className="btn-primary text-sm shrink-0"
        >
          {sending ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}
