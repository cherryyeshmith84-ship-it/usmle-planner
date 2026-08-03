"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Wires up the bell in TopHeader.tsx (previously a decorative placeholder)
 * to the notifications table - new mentor<->student chat messages, either
 * direction, and audience-filtered "mentor added new availability" pings
 * both land here (see app/api/notifications/*). No Realtime subscription on
 * purpose, same tradeoff as MentorChatPanel.tsx: a plain poll is simpler to
 * hand-deliver and debug through manual GitHub pastes than a Realtime
 * channel, at the cost of up to ~20s delay before a new one shows up.
 *
 * Resolves its own current user client-side (like MentorChatPanel does)
 * rather than taking a userId prop, so wiring this in didn't require
 * touching every page that renders AppShell/TopHeader.
 */
export default function NotificationsBell() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);

  async function load() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifications((data ?? []) as Notification[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  async function markRead(id: string) {
    const supabase = createClient();
    const now = new Date().toISOString();
    await supabase.from("notifications").update({ read_at: now }).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: now } : n)));
  }

  async function markAllRead() {
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;
    const supabase = createClient();
    const now = new Date().toISOString();
    await supabase.from("notifications").update({ read_at: now }).in("id", unreadIds);
    setNotifications((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
  }

  function openNotification(n: Notification) {
    if (!n.read_at) markRead(n.id);
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        title="Notifications"
        onClick={() => setOpen((v) => !v)}
        className="relative text-base w-8 h-8 rounded-full text-slate-400 hover:text-slate-200 hover:bg-slate-800 flex items-center justify-center transition"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 font-semibold text-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-lg border border-slate-800 bg-white shadow-lg py-1 z-30">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
            <p className="text-xs font-semibold text-slate-300">Notifications</p>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllRead} className="text-xs text-brand-400 hover:text-brand-300">
                Mark all read
              </button>
            )}
          </div>
          {loading ? (
            <p className="px-3 py-4 text-xs text-slate-500">Loading...</p>
          ) : notifications.length === 0 ? (
            <p className="px-3 py-4 text-xs text-slate-500">No notifications yet.</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => openNotification(n)}
                className={`w-full text-left px-3 py-2.5 border-b border-slate-900 last:border-0 hover:bg-slate-800/60 transition ${
                  n.read_at ? "" : "bg-brand-900/10"
                }`}
              >
                <div className="flex items-start gap-2">
                  {!n.read_at && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-200 leading-snug">{n.title}</p>
                    {n.body && <p className="text-xs text-slate-400 mt-0.5 leading-snug">{n.body}</p>}
                    <p className="text-[10px] text-slate-600 mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
