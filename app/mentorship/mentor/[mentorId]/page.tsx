import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { Mentor, MentorSlot, SessionFeedback } from "@/lib/mentors";
import { averageRating, isExistingStudentOf, slotVisibleToStudent } from "@/lib/mentors";
import { getContentPublished } from "@/lib/platformSettings";
import AppShell from "@/components/AppShell";
import MentorProfileClient from "@/components/MentorProfileClient";

export const dynamic = "force-dynamic";

/**
 * Dedicated per-mentor profile page a student lands on after clicking
 * "View Profile" on a directory card. Everything about booking a session
 * with this specific mentor lives here now (see MentorProfileClient) -
 * the directory itself (MentorBrowseClient) only shows summary cards.
 */
export default async function MentorProfilePage({ params }: { params: { mentorId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("is_admin, full_name, mentor_email")
    .eq("id", user.id)
    .single();
  const profile = profileData as Pick<Profile, "is_admin" | "full_name" | "mentor_email"> | null;
  const contentPublished = profile?.is_admin ? true : await getContentPublished(supabase);

  const { data: mentorData } = await supabase
    .from("mentors")
    .select("*")
    .eq("id", params.mentorId)
    .eq("active", true)
    .maybeSingle();
  if (!mentorData) notFound();
  const mentor = mentorData as Mentor;

  const now = new Date().toISOString();

  const { data: slotsData } = await supabase
    .from("mentor_slots")
    .select("*")
    .eq("mentor_id", mentor.id)
    .eq("is_booked", false)
    .gte("end_time", now)
    .order("start_time", { ascending: true });
  const allOpenSlots = (slotsData ?? []) as MentorSlot[];

  // Existing-students-only slots and new-students-only slots are filtered
  // out here, server-side, before anything reaches the client - a slot
  // reserved for this mentor's existing students never even reaches a
  // browsing student who hasn't linked them yet, and vice versa.
  const isExistingStudent = isExistingStudentOf(profile?.mentor_email, mentor.email);
  const openSlots = allOpenSlots.filter((s) => slotVisibleToStudent(s, isExistingStudent));

  // "Helped X students" - distinct students across this mentor's past
  // (already happened) booked sessions. Counted client-side (in this server
  // component) since a plain count-distinct isn't a one-liner via the
  // Supabase JS query builder.
  const { data: pastBookedRows } = await supabase
    .from("mentor_slots")
    .select("booked_by")
    .eq("mentor_id", mentor.id)
    .eq("is_booked", true)
    .lt("end_time", now);
  const helpedCount = new Set((pastBookedRows ?? []).map((r: any) => r.booked_by).filter(Boolean)).size;

  const { data: myBookingsData } = await supabase.from("mentor_slots").select("*").eq("booked_by", user.id);
  const myBookings = (myBookingsData ?? []) as MentorSlot[];

  // This viewer's own permanent meeting link with this specific mentor, if
  // one's been set - never read off the mentor row itself, since different
  // students of the same mentor can have different links (mentor_meeting_links,
  // one row per student, RLS-gated to auth.uid() = student_id). The
  // mentor_id filter guards against showing a stale link left over from a
  // previous mentor if this student ever switches.
  const { data: meetingLinkData } = await supabase
    .from("mentor_meeting_links")
    .select("meeting_link")
    .eq("student_id", user.id)
    .eq("mentor_id", mentor.id)
    .maybeSingle();
  const meetingLink = (meetingLinkData as { meeting_link: string } | null)?.meeting_link ?? null;

  // Public reviews - needs the "Authenticated can view mentor feedback" RLS
  // policy (mentor_feedback_public_read_for_profiles migration), since
  // feedback used to be readable only by the mentor themselves or the
  // student who wrote it. Comments are shown without the student's name -
  // this is a public profile, not a private dashboard.
  const { data: feedbackData } = await supabase
    .from("mentor_session_feedback")
    .select("*")
    .eq("mentor_id", mentor.id)
    .order("created_at", { ascending: false });
  const reviews = (feedbackData ?? []) as SessionFeedback[];
  const avgRating = averageRating(reviews);

  return (
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 px-6 py-8 w-full">
        <MentorProfileClient
          mentor={mentor}
          openSlots={openSlots}
          helpedCount={helpedCount}
          myBookings={myBookings}
          currentUserId={user.id}
          avgRating={avgRating}
          reviews={reviews}
          isExistingStudent={isExistingStudent}
          meetingLink={meetingLink}
        />
      </main>
    </AppShell>
  );
}
