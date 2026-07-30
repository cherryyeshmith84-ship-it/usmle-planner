"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatSlotDate, formatSlotTime, getSlotStatus, type MentorSlot } from "@/lib/mentors";

/**
 * One row's worth of display data, pre-computed server-side so this
 * component doesn't need to know whether it's rendering a mentor's list
 * (of students who booked them) or a student's list (of mentors they
 * booked) - both shapes get flattened into this before reaching here.
 */
export type SessionRow = {
  slot: MentorSlot;
  title: string;
  subtitle?: string | null;
  note?: string | null;
  photoUrl?: string | null;
  meetingLink?: string | null;
  // Only student rows get a reschedule option, pointed at that specific
  // mentor's profile page to pick a new slot.
  rescheduleMentorId?: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  upcoming: "bg-brand-900/40 text-brand-300",
  completed: "bg-green-900/40 text-green-400",
  cancelled: "bg-red-900/40 text-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  upcoming: "Upcoming",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function SessionsListClient({ rows }: { rows: SessionRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<{ id: string; message: string } | null>(null);

  async function cancelSession(slotId: string) {
    if (!confirm("Cancel this session? This can't be undone.")) return;
    setBusyId(slotId);
    setErrorId(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("mentor_slots")
      .update({ cancelled_at: new Date().toISOString(), cancelled_by: user?.id ?? null })
      .eq("id", slotId);
    setBusyId(null);
    if (error) {
      setErrorId({ id: slotId, message: error.message });
      return;
    }
    router.refresh();
  }

  const upcoming = rows.filter((r) => getSlotStatus(r.slot) === "upcoming");
  const past = rows
    .filter((r) => getSlotStatus(r.slot) !== "upcoming")
    .sort((a, b) => b.slot.start_time.localeCompare(a.slot.start_time));

  function renderRow(row: SessionRow) {
    const status = getSlotStatus(row.slot);
    return (
      <div key={row.slot.id} className="card py-3">
        <div className="flex items-center gap-3">
          {row.photoUrl ? (
            <img src={row.photoUrl} alt={row.title} className="w-9 h-9 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-brand-900/40 text-brand-300 text-xs font-bold flex items-center justify-center shrink-0">
              {row.title.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span className="font-semibold">{row.title}</span>
              {row.subtitle && <span className="text-slate-500"> ({row.subtitle})</span>}
              {" "}&middot;{" "}
              {formatSlotDate(row.slot.start_time)}, {formatSlotTime(row.slot.start_time)}&ndash;
              {formatSlotTime(row.slot.end_time)}
            </p>
            {row.note && <p className="text-xs text-slate-400 mt-1 italic">&ldquo;{row.note}&rdquo;</p>}
          </div>
          <span className={`text-xs font-semibold rounded-full px-2.5 py-1 shrink-0 ${STATUS_STYLES[status]}`}>
            {STATUS_LABELS[status]}
          </span>
        </div>

        {status === "upcoming" && (
          <div className="flex items-center gap-3 mt-3 pl-12">
            {row.meetingLink && (
              <a
                href={row.meetingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary text-xs"
              >
                Join Meeting
              </a>
            )}
            {row.rescheduleMentorId && (
              <a href={`/mentorship/mentor/${row.rescheduleMentorId}`} className="btn-secondary text-xs">
                Reschedule
              </a>
            )}
            <button
              type="button"
              onClick={() => cancelSession(row.slot.id)}
              disabled={busyId === row.slot.id}
              className="text-xs text-red-400 hover:text-red-300"
            >
              {busyId === row.slot.id ? "Cancelling..." : "Cancel"}
            </button>
          </div>
        )}
        {errorId?.id === row.slot.id && (
          <p className="text-xs text-red-400 mt-2 pl-12">{errorId.message}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-400">No upcoming sessions.</p>
        ) : (
          upcoming.map(renderRow)
        )}
      </div>

      {past.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Past</p>
          <div className="space-y-2">{past.map(renderRow)}</div>
        </div>
      )}
    </div>
  );
}
