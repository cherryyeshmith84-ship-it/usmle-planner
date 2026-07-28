import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Assessment, Profile } from "@/lib/types";
import { getContentPublished } from "@/lib/platformSettings";
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

  // Hidden from students until the coach publishes content - bounce back to
  // the list page (which shows the "coming soon" placeholder) rather than
  // rendering the test here, since this route has no sidebar of its own.
  if (!profile?.is_admin) {
    const published = await getContentPublished(supabase);
    if (!published) redirect("/qbank");
  }

  if (!assessmentRes.data) notFound();

  const assessment = assessmentRes.data as Assessment;
  // This route is Question Bank only - a Self Assessment item shouldn't be
  // reachable (and retakeable) through this URL.
  if (assessment.kind !== "qbank") notFound();

  // No AppShell here on purpose - the sidebar/top nav is hidden while
  // actually taking or reviewing this, and comes back once the student
  // exits via AssessmentTake's own "Exit" link/buttons back to /qbank.
  return (
    <div className="min-h-screen">
      <main className="px-6 py-8 w-full">
        <AssessmentTake
          userId={user.id}
          assessment={assessment}
          existingAttempt={null}
          allowRetake
          backHref="/qbank"
        />
      </main>
    </div>
  );
}
