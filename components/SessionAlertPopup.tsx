"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface AlertNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
}

const ICON: Record<string, string> = {
  session_rescheduled: "🔁",
  session_cancelled: "🚫",
};

/**
 * On-screen popup for session reschedule/cancellation - separate from the
 * quiet bell dropdown (NotificationsBell.tsx), which someone can easily
 * never notice until they happen to click it. A rescheduled or cancelled
 * session is time-sensitive enough that it should interrupt whatever page
 * the person is already on, not wait to be discovered.
 *
 * Mounted once in AppShell.tsx (like OnboardingTour) so it's active on
 * every page for both mentors and students. Same tradeoff as
 * NotificationsBell/MentorChatPanel: a plain poll instead of a Realtime
 * subscription, simpler to hand-deliver and debug through manual GitHub
 * pastes, at the cost of up to ~20s delay before a fresh one pops up.
 *
 * Only ever surfaces the two session-change types (session_rescheduled,
 * session_cancelled) - every other notification type (chat messages, new
 * availability, task updates, bookings) still only shows up in the bell,
 * unchanged. Shows one at a time, oldest first; dismissing marks it read
 * (so it won't pop up again) and reveals the next one if there is one.
 */
export default function SessionAlertPopup() {
  const router = useRouter();
  const [queue, setQueue] = useState<AlertNotification[]>([]);

  async function load() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("id, type, title, body, link")
      .eq("user_id", user.id)
      .is("read_at", null)
      .in("type", ["session_rescheduled", "session_cancelled"])
      .order("created_at", { ascending: true })
      .limit(10);
    setQueue((data ?? []) as AlertNotification[]);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = queue[0] ?? null;

  async function dismiss(n: AlertNotification) {
    const supabase = createClient();
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    setQueue((prev) => prev.filter((q) => q.id !== n.id));
  }

  async function viewSession(n: AlertNotification) {
    await dismiss(n);
    if (n.link) router.push(n.link);
  }

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4">
      <div className="card max-w-sm w-full text-center py-6">
        <p className="text-4xl mb-3">{ICON[current.type] ?? "🔔"}</p>
        <p className="font-bold mb-1">{current.title}</p>
        {current.body && <p className="text-sm text-slate-400 mb-5">{current.body}</p>}
        <div className="flex items-center justify-center gap-3">
          <button type="button" onClick={() => dismiss(current)} className="btn-secondary text-sm">
            Dismiss
          </button>
          {current.link && (
            <button type="button" onClick={() => viewSession(current)} className="btn-primary text-sm">
              View session
            </button>
          )}
        </div>
        {queue.length > 1 && (
          <p className="text-[11px] text-slate-500 mt-4">{queue.length - 1} more waiting</p>
        )}
      </div>
    </div>
  );
}
