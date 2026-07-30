import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { Mentor, MentorSlot } from "@/lib/mentors";
import { findMentorByEmail } from "@/lib/mentors";
import { getContentPublished } from "@/lib/platformSettings";
import AppShell from "@/components/AppShell";
import MentorAvailabilityClient from "@/components/MentorAvailabilityClient";

export const dynamic = "force-dynamic";

/**
 * The mentor's slot manager + profile editor + chat - this used to be the
 * entire content of app/mentorship/page.tsx for a mentor, but /mentorship
 * is now a proper dashboard (today's/this week's sessions, stats, feedback,
 * "needs attention"). This page holds the actual day-to-day slot
 * management work, one click away via the dashboard's "Manage availability
 * & profile" link. Everything below (queries, component, props) is
 * unchanged from what used to live in the mentor branch of
 * app/mentorship/page.tsx - only its location moved.
 */
export default async function MentorAvailabilityPage() {
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

  // Not a mentor - nothing to manage here, send them to the directory.
  if (!myMentorRecord) redirect("/mentorship");

  const { data: slotsData } = await supabase
    .from("mentor_slots")
    .select("*, booked_by_profile:booked_by(full_name, email)")
    .eq("mentor_id", myMentorRecord.id)
    .order("start_time", { ascending: true });
  const slots = (slotsData ?? []) as MentorSlot[];

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
        <a href="/mentorship" className="text-xs text-brand-400 hover:text-brand-300">
          ← Back to dashboard
        </a>
        <h1 className="text-xl font-bold mt-2 mb-1">Your mentorship availability</h1>
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
