import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { Mentor, MentorSlot } from "@/lib/mentors";
import { findMentorByEmail } from "@/lib/mentors";
import { getContentPublished } from "@/lib/platformSettings";
import AppShell from "@/components/AppShell";
import MentorAvailabilityClient from "@/components/MentorAvailabilityClient";
import MentorBrowseClient from "@/components/MentorBrowseClient";

export const dynamic = "force-dynamic";

/**
 * Single "Mentorship" nav destination for everyone - which view renders
 * depends on whether the signed-in user's email matches a mentors row:
 *   - Matches -> MentorAvailabilityClient (their own slot manager).
 *   - Doesn't match (students, admin) -> MentorBrowseClient (directory +
 *     booking + "my upcoming sessions").
 * A mentor never needs a separate account type/invite flow - they just
 * sign up at the normal /signup page with the email the admin entered for
 * them in /admin/mentors.
 */
export default async function MentorshipPage() {
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

  const { data: mentorsData } = await supabase
    .from("mentors")
    .select("*")
    .eq("active", true)
    .order("name", { ascending: true });
  const mentors = (mentorsData ?? []) as Mentor[];

  const myMentorRecord = findMentorByEmail(mentors, user.email);

  if (myMentorRecord) {
    // Join the booking student's profile so the mentor can see who booked
    // each slot and when, not just an "Open/Booked" badge.
    const { data: slotsData } = await supabase
      .from("mentor_slots")
      .select("*, booked_by_profile:booked_by(full_name, email)")
      .eq("mentor_id", myMentorRecord.id)
      .order("start_time", { ascending: true });
    const slots = (slotsData ?? []) as MentorSlot[];

    // Conversation partners = anyone who's either booked a slot with this
    // mentor or already messaged them - a student can start a thread before
    // ever booking (e.g. asking a question first), so messages alone aren't
    // enough to find everyone the mentor should be able to reply to.
    const { data: bookedByRows } = await supabase
      .from("mentor_slots")
      .select("booked_by")
      .eq("mentor_id", myMentorRecord.id)
      .not("booked_by", "is", null);
    const { data: messageStudentRows } = await supabase
      .from("mentor_messages")
      .select("student_id")
      .eq("mentor_id", myMentorRecord.id);
    const partnerIds = Array.from(
      new Set([
        ...(bookedByRows ?? []).map((r: any) => r.booked_by as string),
        ...(messageStudentRows ?? []).map((r: any) => r.student_id as string),
      ])
    );
    let conversationPartners: { id: string; full_name: string | null; email: string | null }[] = [];
    if (partnerIds.length > 0) {
      const { data: partnerProfiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", partnerIds);
      conversationPartners = (partnerProfiles ?? []) as any[];
    }

    return (
      <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
        <main className="flex-1 max-w-3xl mx-auto px-6 py-8 w-full">
          <h1 className="text-xl font-bold mb-1">Your mentorship availability</h1>
          <p className="text-sm text-slate-400 mb-6">
            Add times you're free to meet. Students book straight from what you add here, and a slot
            disappears from their view the moment someone books it.
          </p>
          <MentorAvailabilityClient
            mentor={myMentorRecord}
            initialSlots={slots}
            conversationPartners={conversationPartners}
          />
        </main>
      </AppShell>
    );
  }

  // Not a mentor - browse the directory. Also fetch this user's own booked
  // sessions across every mentor so they can see "my upcoming sessions" up
  // top regardless of which mentor they booked with.
  const { data: myBookingsData } = await supabase
    .from("mentor_slots")
    .select("*, mentors(name, photo_path)")
    .eq("booked_by", user.id)
    .order("start_time", { ascending: true });

  return (
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8 w-full">
        <h1 className="text-xl font-bold mb-1">Mentorship</h1>
        <p className="text-sm text-slate-400 mb-1">
          Pick a mentor to see their open availability and book a slot.
        </p>
        <p className="text-xs text-slate-500 mb-6">
          All times shown are Eastern Time (ET) - EST or EDT depending on the time of year.
        </p>
        <MentorBrowseClient mentors={mentors} myBookings={(myBookingsData ?? []) as any[]} />
      </main>
    </AppShell>
  );
}
