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
  // card. Used to also fall back to "have they ever sent this mentor a
  // message" - that turned out to be too weak a signal (a student who'd
  // only ever sent one message, never linked a mentor in Settings and never
  // booked a session, was still permanently shown "Discuss With <name>").
  // Now this only considers the two things that actually mean a student
  // picked a mentor: an explicit link (Settings -> "Your mentor's email",
  // the same profiles.mentor_email source of truth used everywhere else in
  // the app) or an actual booked session. Either one is a real commitment;
  // just messaging someone isn't.
  let mentorId: string | null = null;
  const { data: myProfileForMentor } = await supabase
    .from("profiles")
    .select("mentor_email")
    .eq("id", user.id)
    .maybeSingle();
  const linkedMentorEmail = (myProfileForMentor as { mentor_email: string | null } | null)?.mentor_email;
  if (linkedMentorEmail) {
    const { data: linkedMentorRow } = await supabase
      .from("mentors")
      .select("id")
      .ilike("email", linkedMentorEmail)
      .maybeSingle();
    mentorId = (linkedMentorRow as { id: string } | null)?.id ?? null;
  }
  if (!mentorId) {
    const { data: mySlots } = await supabase
      .from("mentor_slots")
      .select("mentor_id")
      .eq("booked_by", user.id)
      .order("start_time", { ascending: false })
      .limit(1);
    mentorId = mySlots?.[0]?.mentor_id ?? null;
  }
  let myMentor: { id: string; name: string | null } | null = null;
  if (mentorId) {
    const { data: mentorRow } = await supabase.from("mentors").select("name").eq("id", mentorId).maybeSingle();
    myMentor = { id: mentorId, name: mentorRow?.name ?? null };
  }

  // Mentor-authored study plan, if this student's mentor has written one -
  // see mentor_study_plans_table migration + StudyPlanEditor.tsx. When this
  // is null, PerformanceClient falls back to computing a default plan from
  // the AI Exam Review's priorityAreas/estimatedHours instead.
  const { data: studyPlanRow } = await supabase
    .from("mentor_study_plans")
    .select("content, updated_at")
    .eq("student_id", user.id)
    .maybeSingle();
  const mentorStudyPlan = studyPlanRow
    ? { content: studyPlanRow.content as string, updatedAt: studyPlanRow.updated_at as string, mentorName: myMentor?.name ?? null }
    : null;

  return (
    <AppShell isAdmin={profileData?.is_admin} userName={profileData?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 px-6 py-8 w-full">
        <h1 className="text-xl font-bold mb-1">Analysis</h1>
        <p className="text-sm text-slate-400 mb-6">
          Upload your NBME, UWSA, Free 120, and UWorld self-assessment results to track your weak and
          strong systems over time.
        </p>
        <PerformanceClient
          userId={user.id}
          initialReports={reports}
          myMentor={myMentor}
          mentorStudyPlan={mentorStudyPlan}
        />
      </main>
    </AppShell>
  );
}
