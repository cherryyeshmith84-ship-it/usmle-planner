import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { Mentor, MentorSlot } from "@/lib/mentors";
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
    .select("is_admin, full_name")
    .eq("id", user.id)
    .single();
  const profile = profileData as Pick<Profile, "is_admin" | "full_name"> | null;
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
  const openSlots = (slotsData ?? []) as MentorSlot[];

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

  return (
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8 w-full">
        <MentorProfileClient
          mentor={mentor}
          openSlots={openSlots}
          helpedCount={helpedCount}
          myBookings={myBookings}
          currentUserId={user.id}
        />
      </main>
    </AppShell>
  );
}
