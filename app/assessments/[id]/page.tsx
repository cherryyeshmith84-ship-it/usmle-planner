import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Assessment, AssessmentAttempt, Profile } from "@/lib/types";
import AssessmentTake from "@/components/AssessmentTake";

export const dynamic = "force-dynamic";

export default async function TakeAssessmentPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profileRes, assessmentRes, attemptRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("assessments").select("*").eq("id", params.id).single(),
    supabase
      .from("assessment_attempts")
      .select("*")
      .eq("assessment_id", params.id)
      .eq("user_id", user.id)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const profile = profileRes.data as Profile | null;
  if (!profile?.onboarding_completed) redirect("/onboarding");
  if (!assessmentRes.data) notFound();
  const assessment = assessmentRes.data as Assessment;
  const existingAttempt = (attemptRes.data as AssessmentAttempt) ?? null;

  // No AppShell here on purpose - the sidebar/top nav is hidden while
  // actually taking or reviewing this assessment, and comes back once the
  // student exits via AssessmentTake's own "Exit" link/buttons.
  return (
    <div className="min-h-screen">
      <main className="px-6 py-8 w-full">
        <AssessmentTake userId={user.id} assessment={assessment} existingAttempt={existingAttempt} />
      </main>
    </div>
  );
}
