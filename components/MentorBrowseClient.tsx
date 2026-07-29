"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  formatSlotDate,
  formatSlotTime,
  groupSlotsByDate,
  mentorPhotoUrl,
  type Mentor,
  type MentorSlot,
} from "@/lib/mentors";
import MentorChatPanel from "./MentorChatPanel";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

type MyBooking = MentorSlot & { mentors?: { name: string; photo_path: string | null } | null };

/**
 * Student-facing mentor directory: pick a mentor to load their open,
 * upcoming slots, then book one. Booking is a conditional update
 * (`is_booked=false -> true` in the same statement) so if two students
 * click at the same moment, only one write actually matches a row -
 * the loser just gets refreshed with that slot already gone.
 */
export default function MentorBrowseClient({
  mentors,
  myBookings,
}: {
  mentors: Mentor[];
  myBookings: MyBooking[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Mentor | null>(null);
  const [slots, setSlots] = useState<MentorSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);
  const [bookedMsg, setBookedMsg] = useState<string | null>(null);
  // Free-text note the student can leave when booking - e.g. where they are
  // in their prep or what they want to talk about - so the mentor isn't
  // walking in blind. One shared field, applied to whichever slot they book.
  const [note, setNote] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const now = new Date().toISOString();
  const upcomingBookings = myBookings.filter((b) => b.end_time >= now);

  async function selectMentor(m: Mentor) {
    setSelected(m);
    setBookError(null);
    setBookedMsg(null);
    setLoadingSlots(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("mentor_slots")
      .select("*")
      .eq("mentor_id", m.id)
      .eq("is_booked", false)
      .gte("end_time", now)
      .order("start_time", { ascending: true });
    setSlots((data ?? []) as MentorSlot[]);
    setLoadingSlots(false);
  }

  async function book(slotId: string) {
    setBookingId(slotId);
    setBookError(null);
    const supabase = createClient();
    // Conditional update: only succeeds if the slot is still unbooked at the
    // moment this statement runs - the WHERE clause is checked and applied
    // atomically by Postgres, so a slot can't be double-booked by two
    // students clicking at nearly the same time.
    const { data, error } = await supabase
      .from("mentor_slots")
      .update({
        is_booked: true,
        booked_by: (await supabase.auth.getUser()).data.user?.id,
        booked_at: new Date().toISOString(),
        student_note: note.trim() || null,
      })
      .eq("id", slotId)
      .eq("is_booked", false)
      .select();
    setBookingId(null);
    if (error) {
      setBookError(error.message);
      return;
    }
    if (!data || data.length === 0) {
      setBookError("Someone just booked that slot - pick another.");
      setSlots((prev) => prev.filter((s) => s.id !== slotId));
      return;
    }
    setSlots((prev) => prev.filter((s) => s.id !== slotId));
    setBookedMsg("Booked! You'll see it under \"My upcoming sessions\" after the page refreshes.");
    setNote("");

    // Let the mentor know by email - best-effort, doesn't block the UI and
    // a failure here shouldn't make it look like the booking itself failed.
    const bookedSlot = slots.find((s) => s.id === slotId);
    if (bookedSlot) {
      fetch("/api/mentorship/notify-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId,
          dateLabel: formatSlotDate(bookedSlot.start_time),
          timeLabel: `${formatSlotTime(bookedSlot.start_time)} - ${formatSlotTime(bookedSlot.end_time)}`,
        }),
      }).catch(() => {});
    }

    router.refresh();
  }

  return (
    <div className="space-y-6">
      {upcomingBookings.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2">My upcoming sessions</p>
          <div className="space-y-2">
            {upcomingBookings.map((b) => (
              <div key={b.id} className="card flex items-center gap-3 py-3">
                {b.mentors?.photo_path ? (
                  <img
                    src={mentorPhotoUrl(b.mentors.photo_path, SUPABASE_URL) ?? ""}
                    alt={b.mentors.name}
                    className="w-9 h-9 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-brand-900/40 text-brand-300 text-xs font-bold flex items-center justify-center shrink-0">
                    {(b.mentors?.name ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <p className="text-sm">
                  <span className="font-semibold">{b.mentors?.name ?? "Mentor"}</span> &middot;{" "}
                  {formatSlotDate(b.start_time)}, {formatSlotTime(b.start_time)}&ndash;{formatSlotTime(b.end_time)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-3">
          <p className="text-sm font-semibold">Mentors</p>
          {mentors.length === 0 && <p className="text-sm text-slate-400">No mentors are listed yet.</p>}
          {mentors.map((m) => {
            const photoUrl = mentorPhotoUrl(m.photo_path, SUPABASE_URL);
            const active = selected?.id === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => selectMentor(m)}
                className={`card w-full text-left flex items-center gap-3 transition ${
                  active ? "border-brand-500" : "hover:border-brand-500/50"
                }`}
              >
                {photoUrl ? (
                  <img src={photoUrl} alt={m.name} className="w-12 h-12 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-brand-900/40 text-brand-300 font-bold flex items-center justify-center shrink-0">
                    {m.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{m.name}</p>
                  {m.bio && <p className="text-xs text-slate-400 line-clamp-2">{m.bio}</p>}
                </div>
              </button>
            );
          })}
        </div>

        <div>
          <p className="text-sm font-semibold mb-3">
            {selected ? `${selected.name}'s availability` : "Pick a mentor to see availability"}
          </p>
          {!selected && (
            <p className="text-sm text-slate-400">Click a mentor on the left to see their open slots.</p>
          )}
          {selected && loadingSlots && <p className="text-sm text-slate-400">Loading...</p>}
          {selected && !loadingSlots && (
            <>
              {selected.bio && <p className="text-sm text-slate-300 mb-4">{selected.bio}</p>}
              {slots.length > 0 && (
                <div className="mb-4">
                  <label className="label">Your status / what you'd like to discuss (optional)</label>
                  <textarea
                    className="input min-h-[70px]"
                    placeholder="e.g. Mid-dedicated, struggling with Cardio and Renal - want to talk study plan."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <p className="text-xs text-slate-500 mt-1">Applied to whichever slot you book below.</p>
                </div>
              )}
              {bookError && <p className="text-xs text-red-400 mb-2">{bookError}</p>}
              {bookedMsg && <p className="text-xs text-green-400 mb-2">{bookedMsg}</p>}
              {slots.length === 0 ? (
                <p className="text-sm text-slate-400">No open slots right now - check back later.</p>
              ) : (
                <div className="space-y-4">
                  {groupSlotsByDate(slots).map(({ date, slots }) => (
                    <div key={date}>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{date}</p>
                      <div className="space-y-2">
                        {slots.map((s) => (
                          <div key={s.id} className="card flex items-center justify-between gap-3 py-3">
                            <p className="text-sm">
                              {formatSlotTime(s.start_time)} &ndash; {formatSlotTime(s.end_time)}
                            </p>
                            <button
                              type="button"
                              onClick={() => book(s.id)}
                              disabled={bookingId === s.id}
                              className="btn-primary text-xs"
                            >
                              {bookingId === s.id ? "Booking..." : "Book"}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {selected && currentUserId && (
        <MentorChatPanel mentorId={selected.id} studentId={currentUserId} otherPartyLabel={selected.name} />
      )}
    </div>
  );
}
