import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ScoreReport } from "@/lib/scoreReports";
import { getContentPublished } from "@/lib/platformSettings";
import AppShell from "@/components/AppShell";
import PerformanceClient from "@/components/PerformanceClient";

export const dynamic = "force-dynamic";

/**
 * Performance page - now built entirely from uploaded score reports
 * (NBME/UWSA/Free120/UWorld self-assessments) instead of the old plain
 * daily-log list: weak/strong systems, progress-over-time comparison, and
 * AI suggestions. See components/PerformanceClient.tsx and
 * lib/scoreReports.ts.
 */
export default async function HistoryPage() {
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

  const contentPublished = profileData?.is_admin ? true : await getContentPublished(supabase);

  const { data } = await supabase
    .from("score_reports")
    .select("*")
    .eq("user_id", user.id)
    .order("taken_date", { ascending: false });
  const reports = (data ?? []) as ScoreReport[];

  // Resolve the student's own mentor (if any) for the "Mentor Recommendation"
  // card - checked the same two ways is_mentor_of_student does server-side
  // (a booked session, or a message thread), so a student who's only ever
  // messaged a mentor without booking yet still gets routed to that same
  // mentor instead of the empty directory. A booked session wins if both
  // exist, since that's the firmer relationship.
  let mentorId: string | null = null;
  const { data: mySlots } = await supabase
    .from("mentor_slots")
    .select("mentor_id")
    .eq("booked_by", user.id)
    .order("start_time", { ascending: false })
    .limit(1);
  mentorId = mySlots?.[0]?.mentor_id ?? null;
  if (!mentorId) {
    const { data: myMessages } = await supabase
      .from("mentor_messages")
      .select("mentor_id")
      .eq("student_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);
    mentorId = myMessages?.[0]?.mentor_id ?? null;
  }
  let myMentor: { id: string; name: string | null } | null = null;
  if (mentorId) {
    const { data: mentorRow } = await supabase.from("mentors").select("name").eq("id", mentorId).maybeSingle();
    myMentor = { id: mentorId, name: mentorRow?.name ?? null };
  }

  return (
    <AppShell isAdmin={profileData?.is_admin} userName={profileData?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8 w-full">
        <h1 className="text-xl font-bold mb-1">Analysis</h1>
        <p className="text-sm text-slate-400 mb-6">
          Upload your NBME, UWSA, Free 120, and UWorld self-assessment results to track your weak and
          strong systems over time.
        </p>
        <PerformanceClient userId={user.id} initialReports={reports} myMentor={myMentor} />
      </main>
    </AppShell>
  );
}
