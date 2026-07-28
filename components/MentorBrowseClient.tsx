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
    const { data: slotsData } = await supabase
      .from("mentor_slots")
      .select("*")
      .eq("mentor_id", myMentorRecord.id)
      .order("start_time", { ascending: true });
    const slots = (slotsData ?? []) as MentorSlot[];

    return (
      <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
        <main className="flex-1 max-w-3xl mx-auto px-6 py-8 w-full">
          <h1 className="text-xl font-bold mb-1">Your mentorship availability</h1>
          <p className="text-sm text-slate-400 mb-6">
            Add times you're free to meet. Students book straight from what you add here, and a slot
            disappears from their view the moment someone books it.
          </p>
          <MentorAvailabilityClient mentor={myMentorRecord} initialSlots={slots} />
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
        <p className="text-sm text-slate-400 mb-6">
          Pick a mentor to see their open availability and book a slot.
        </p>
        <MentorBrowseClient mentors={mentors} myBookings={(myBookingsData ?? []) as any[]} />
      </main>
    </AppShell>
  );
}
