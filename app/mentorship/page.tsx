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

  // Not a mentor - browse the directory. Compute two per-mentor summary
  // stats up front with two batch queries (rather than one query per
  // mentor): how many distinct students each mentor has already had a
  // completed session with ("helped X students"), and whether each mentor
  // has at least one open slot in the next 7 days ("Available this week").
  const now = new Date().toISOString();
  const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const mentorIds = mentors.map((m) => m.id);

  const helpedCountByMentor = new Map<string, Set<string>>();
  if (mentorIds.length > 0) {
    const { data: pastBookedRows } = await supabase
      .from("mentor_slots")
      .select("mentor_id, booked_by")
      .in("mentor_id", mentorIds)
      .eq("is_booked", true)
      .lt("end_time", now);
    for (const row of (pastBookedRows ?? []) as any[]) {
      if (!row.booked_by) continue;
      const set = helpedCountByMentor.get(row.mentor_id) ?? new Set<string>();
      set.add(row.booked_by);
      helpedCountByMentor.set(row.mentor_id, set);
    }
  }

  const availableThisWeekMentorIds = new Set<string>();
  if (mentorIds.length > 0) {
    const { data: upcomingOpenRows } = await supabase
      .from("mentor_slots")
      .select("mentor_id")
      .in("mentor_id", mentorIds)
      .eq("is_booked", false)
      .gte("end_time", now)
      .lt("start_time", weekFromNow);
    for (const row of (upcomingOpenRows ?? []) as any[]) {
      availableThisWeekMentorIds.add(row.mentor_id);
    }
  }

  const mentorCards = mentors.map((m) => ({
    ...m,
    helpedCount: helpedCountByMentor.get(m.id)?.size ?? 0,
    availableThisWeek: availableThisWeekMentorIds.has(m.id),
  }));

  return (
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 max-w-5xl mx-auto px-6 py-8 w-full">
        <h1 className="text-xl font-bold mb-1">Mentorship</h1>
        <p className="text-sm text-slate-400 mb-6">
          Pick a mentor to view their profile and book a session.
        </p>
        <MentorBrowseClient mentors={mentorCards} />
      </main>
    </AppShell>
  );
}
