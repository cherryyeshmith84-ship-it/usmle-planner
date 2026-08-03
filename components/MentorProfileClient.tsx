"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  formatSlotDate,
  formatSlotTime,
  groupSlotsByDate,
  mentorPhotoUrl,
  type Mentor,
  type MentorSlot,
  type SessionFeedback,
} from "@/lib/mentors";
import { easternWeekStart } from "@/lib/timezone";
import MentorChatPanel from "./MentorChatPanel";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

/**
 * Dedicated profile page for one mentor - About / What they'll help with /
 * Languages / Availability, plus the booking flow (previously all crammed
 * into MentorBrowseClient's right-hand column). MentorBrowseClient now only
 * renders cards that link here; all the "pick a slot, answer the
 * questionnaire, book" logic lives in this one place instead.
 */
export default function MentorProfileClient({
  mentor,
  openSlots,
  helpedCount,
  myBookings,
  currentUserId,
  avgRating,
  reviews,
  isExistingStudent,
  meetingLink,
}: {
  mentor: Mentor;
  openSlots: MentorSlot[];
  helpedCount: number;
  myBookings: MentorSlot[];
  currentUserId: string;
  avgRating: number | null;
  reviews: SessionFeedback[];
  // Whether the viewer already links this mentor's email under their own
  // Settings - openSlots has already been filtered server-side based on
  // this, but the availability card uses it too to explain why the list
  // might look different than expected.
  isExistingStudent: boolean;
  // This viewer's own permanent meeting link with this mentor, if the
  // mentor has set one for them specifically (see mentor_meeting_links -
  // different students of the same mentor can have different links, so
  // this is never read off the Mentor object itself).
  meetingLink: string | null;
}) {
  const router = useRouter();
  const [slots, setSlots] = useState(openSlots);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);
  const [bookedMsg, setBookedMsg] = useState<string | null>(null);

  const photoUrl = mentorPhotoUrl(mentor.photo_path, SUPABASE_URL);
  const languages = mentor.languages || [];
  const helpAreas = mentor.help_areas || [];

  function hasBookingInWeekOf(startTime: string): boolean {
    const week = easternWeekStart(startTime);
    return myBookings.some((b) => easternWeekStart(b.start_time) === week);
  }

  async function book(slotId: string) {
    const targetSlot = slots.find((s) => s.id === slotId);
    if (targetSlot && hasBookingInWeekOf(targetSlot.start_time)) {
      setBookError(
        "You already have a mentor session booked this week (Mon-Sun, Eastern Time). Only one booking per week is allowed."
      );
      return;
    }
    setBookingId(slotId);
    setBookError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("mentor_slots")
      .update({
        is_booked: true,
        booked_by: currentUserId,
        booked_at: new Date().toISOString(),
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
    setBookedMsg('Booked! You\'ll see it under "Upcoming Sessions" in the sidebar.');

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
      <a href="/mentorship" className="text-xs text-brand-400 hover:text-brand-300">
        &larr; Back to all mentors
      </a>

      <div className="card flex items-start gap-4">
        {photoUrl ? (
          <img src={photoUrl} alt={mentor.name} className="w-20 h-20 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-20 h-20 rounded-full bg-brand-900/40 text-brand-300 text-2xl font-bold flex items-center justify-center shrink-0">
            {mentor.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-lg font-bold">{mentor.name}</p>
            <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-green-900/40 text-green-400">
              ✓ Passed USMLE Step 1
            </span>
            {reviews.length > 0 && (
              <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-yellow-900/30 text-yellow-400">
                ★ {avgRating} ({reviews.length} review{reviews.length === 1 ? "" : "s"})
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Helped {helpedCount} student{helpedCount === 1 ? "" : "s"}
            {mentor.response_time_note && <> &middot; Typically responds {mentor.response_time_note}</>}
          </p>
          {languages.length > 0 && (
            <p className="text-xs text-slate-500 mt-1">Speaks {languages.join(", ")}</p>
          )}
        </div>
      </div>

      <div className="card">
        <p className="text-sm font-semibold mb-2">About</p>
        {mentor.bio && <p className="text-sm text-slate-300 mb-2">{mentor.bio}</p>}
        {mentor.med_school && (
          <p className="text-xs text-slate-400 mb-1">
            <span className="text-slate-500">Medical school:</span> {mentor.med_school}
          </p>
        )}
        {mentor.step1_experience && (
          <p className="text-xs text-slate-400 mb-1">
            <span className="text-slate-500">Step 1 experience:</span> {mentor.step1_experience}
          </p>
        )}
        {mentor.why_mentor && (
          <p className="text-xs text-slate-400">
            <span className="text-slate-500">Why they mentor:</span> {mentor.why_mentor}
          </p>
        )}
        {!mentor.bio && !mentor.med_school && !mentor.step1_experience && !mentor.why_mentor && (
          <p className="text-sm text-slate-500">This mentor hasn&apos;t filled in their About section yet.</p>
        )}
      </div>

      {helpAreas.length > 0 && (
        <div className="card">
          <p className="text-sm font-semibold mb-2">What they&apos;ll help with</p>
          <div className="grid sm:grid-cols-2 gap-1.5">
            {helpAreas.map((area) => (
              <p key={area} className="text-sm text-slate-300">
                <span className="text-green-400">✓</span> {area}
              </p>
            ))}
          </div>
        </div>
      )}

      {reviews.length > 0 && (
        <div className="card">
          <p className="text-sm font-semibold mb-2">
            Reviews <span className="text-slate-500 font-normal">&middot; ★ {avgRating} average from {reviews.length} student{reviews.length === 1 ? "" : "s"}</span>
          </p>
          {reviews.filter((r) => r.comment).length === 0 ? (
            <p className="text-sm text-slate-500">No written reviews yet - just star ratings so far.</p>
          ) : (
            <div className="space-y-3">
              {reviews
                .filter((r) => r.comment)
                .slice(0, 10)
                .map((r) => (
                  <div key={r.id} className="border-t border-slate-800 pt-3 first:border-0 first:pt-0">
                    <p className="text-xs text-yellow-400 mb-1">
                      {"★".repeat(r.rating)}
                      {"☆".repeat(5 - r.rating)}
                    </p>
                    <p className="text-sm text-slate-300">&ldquo;{r.comment}&rdquo;</p>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Meeting link - this viewer's own link, set by the mentor
          specifically for them (mentor_meeting_links), not a link shared
          across every one of the mentor's students. Always visible here,
          independent of whether they currently have a slot booked - it's a
          permanent room, not tied to one session. */}
      {meetingLink && (
        <div className="card">
          <p className="text-sm font-semibold mb-2">Meeting link</p>
          <a
            href={meetingLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-brand-400 hover:text-brand-300 break-all"
          >
            {meetingLink}
          </a>
        </div>
      )}

      <div className="card">
        <p className="text-sm font-semibold mb-3">Availability</p>
        <p className="text-xs text-slate-500 mb-3">
          All times shown are Eastern Time (ET) - EST or EDT depending on the time of year.
        </p>
        {isExistingStudent && (
          <p className="text-xs text-brand-400 mb-3">
            You&apos;re one of {mentor.name}&apos;s students, so this includes any slots they&apos;ve set
            aside just for their existing students.
          </p>
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
                  {slots.map((s) => {
                    const weekClash = hasBookingInWeekOf(s.start_time);
                    return (
                      <div key={s.id} className="card flex items-center justify-between gap-3 py-3">
                        <p className="text-sm">
                          {formatSlotTime(s.start_time)} &ndash; {formatSlotTime(s.end_time)}
                        </p>
                        {weekClash ? (
                          <span className="text-xs text-slate-500">Already booked this week</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => book(s.id)}
                            disabled={bookingId === s.id}
                            className="btn-primary text-xs"
                          >
                            {bookingId === s.id ? "Booking..." : "Book Session"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <MentorChatPanel mentorId={mentor.id} studentId={currentUserId} otherPartyLabel={mentor.name} />
    </div>
  );
}
