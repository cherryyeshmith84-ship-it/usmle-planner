import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { Mentor, MentorSlot } from "@/lib/mentors";
import { findMentorByEmail, formatSlotDate, formatSlotTime, mentorPhotoUrl } from "@/lib/mentors";
import { getContentPublished } from "@/lib/platformSettings";
import AppShell from "@/components/AppShell";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

type MyBooking = MentorSlot & { mentors?: { name: string; photo_path: string | null } | null };
type BookedByMe = MentorSlot & {
  booked_by_profile?: { full_name: string | null; email: string | null } | null;
};

/**
 * Dedicated "Upcoming sessions" page under the Mentorship nav group - pulled
 * out of the student browse view (MentorBrowseClient) so it has its own
 * sub-nav entry instead of only living inline at the top of the mentor
 * directory. Same mentor-vs-student branching as app/mentorship/page.tsx:
 * a mentor sees who's booked time with them, a student sees every session
 * they've booked across every mentor.
 */
export default async function UpcomingSessionsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("is_admin, full_name")
    .eq("id", user.id)
    .single();
  const profile = profileData as Pick<Profile, "is_admin" | "full_name"> | null;
  const contentPublished = profile?.is_admin ? true : await getContentPublished(supabase);

  const { data: mentorsData } = await supabase.from("mentors").select("*").eq("active", true);
  const mentors = (mentorsData ?? []) as Mentor[];
  const myMentorRecord = findMentorByEmail(mentors, user.email);

  const now = new Date().toISOString();

  if (myMentorRecord) {
    const { data } = await supabase
      .from("mentor_slots")
      .select("*, booked_by_profile:booked_by(full_name, email)")
      .eq("mentor_id", myMentorRecord.id)
      .eq("is_booked", true)
      .gte("end_time", now)
      .order("start_time", { ascending: true });
    const sessions = (data ?? []) as BookedByMe[];

    return (
      <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
        <main className="flex-1 max-w-3xl mx-auto px-6 py-8 w-full">
          <h1 className="text-xl font-bold mb-1">Upcoming sessions</h1>
          <p className="text-sm text-slate-400 mb-6">
            Students who've booked a slot with you, soonest first.
          </p>
          {sessions.length === 0 ? (
            <p className="text-sm text-slate-400">No upcoming booked sessions yet.</p>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => (
                <div key={s.id} className="card py-3">
                  <p className="text-sm">
                    <span className="font-semibold">{s.booked_by_profile?.full_name || "A student"}</span>
                    {s.booked_by_profile?.email && (
                      <span className="text-slate-500"> ({s.booked_by_profile.email})</span>
                    )}
                    {" "}&middot;{" "}
                    {formatSlotDate(s.start_time)}, {formatSlotTime(s.start_time)}&ndash;{formatSlotTime(s.end_time)}
                  </p>
                  {s.student_note && (
                    <p className="text-xs text-slate-400 mt-1 italic">&ldquo;{s.student_note}&rdquo;</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </main>
      </AppShell>
    );
  }

  const { data: myBookingsData } = await supabase
    .from("mentor_slots")
    .select("*, mentors(name, photo_path)")
    .eq("booked_by", user.id)
    .gte("end_time", now)
    .order("start_time", { ascending: true });
  const myBookings = (myBookingsData ?? []) as MyBooking[];

  return (
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8 w-full">
        <h1 className="text-xl font-bold mb-1">Upcoming sessions</h1>
        <p className="text-sm text-slate-400 mb-6">
          Every mentorship session you've booked, soonest first.
        </p>
        {myBookings.length === 0 ? (
          <p className="text-sm text-slate-400">
            No upcoming sessions yet - book one from the Mentorship page.
          </p>
        ) : (
          <div className="space-y-2">
            {myBookings.map((b) => (
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
        )}
      </main>
    </AppShell>
  );
}
