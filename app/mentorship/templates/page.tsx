import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { Mentor } from "@/lib/mentors";
import { findMentorByEmail } from "@/lib/mentors";
import { getContentPublished } from "@/lib/platformSettings";
import AppShell from "@/components/AppShell";
import MentorTemplatesManager from "@/components/MentorTemplatesManager";

export const dynamic = "force-dynamic";

/**
 * Standalone "Planner Templates" page (/mentorship/templates) - a mentor's
 * own home for building reusable, day-by-day assignment plans per system
 * (see MentorTemplatesManager.tsx's own doc comment for why this moved out
 * of MentorAssignmentsEditor.tsx's "+ Use Template" popup). Mentor-only,
 * same as /mentorship/students - templates are scoped to mentor_id, not to
 * any one student, so there's nothing here for a plain student account or
 * a read-only viewer to see.
 */
export default async function MentorTemplatesPage() {
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

  if (!myMentorRecord) redirect("/mentorship");

  return (
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 px-6 py-8 w-full">
        <MentorTemplatesManager mentorId={myMentorRecord.id} />
      </main>
    </AppShell>
  );
}
