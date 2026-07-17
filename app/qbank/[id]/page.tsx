import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Assessment, Profile } from "@/lib/types";
import AppShell from "@/components/AppShell";
import AssessmentTake from "@/components/AssessmentTake";

export const dynamic = "force-dynamic";

export default async function TakeQuestionBankPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profileRes, assessmentRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("assessments").select("*").eq("id", params.id).single(),
  ]);

  const profile = profileRes.data as Profile | null;
  if (!profile?.onboarding_completed) redirect("/onboarding");
  if (!assessmentRes.data) notFound();

  const assessment = assessmentRes.data as Assessment;
  // This route is Question Bank only - a Self Assessment item shouldn't be
  // reachable (and retakeable) through this URL.
  if (assessment.kind !== "qbank") notFound();

  return (
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name}>
      <main className="flex-1 px-6 py-8 w-full">
        <AssessmentTake
          userId={user.id}
          assessment={assessment}
          existingAttempt={null}
          allowRetake
          backHref="/qbank"
        />
      </main>
    </AppShell>
  );
}
