import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Assessment, Profile } from "@/lib/types";
import NavBar from "@/components/NavBar";
import AssessmentTake from "@/components/AssessmentTake";

export const dynamic = "force-dynamic";

export default async function TakeAssessmentPage({ params }: { params: { id: string } }) {
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

  return (
    <div className="min-h-screen flex">
      <NavBar isAdmin={profile?.is_admin} />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8">
        <AssessmentTake userId={user.id} assessment={assessment} />
      </main>
    </div>
  );
}
