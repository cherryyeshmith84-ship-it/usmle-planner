import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { findMentorByEmail } from "@/lib/mentors";
import { findViewerByEmail } from "@/lib/viewers";
import OnboardingForm from "./OnboardingForm";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Mentors sign up through the same public /signup form as students - if
  // this email matches a mentors row, skip the USMLE-prep onboarding wizard
  // entirely (it's meaningless for them) and go straight to their
  // availability page.
  const { data: mentorRows } = await supabase.from("mentors").select("*").eq("active", true);
  if (findMentorByEmail(mentorRows ?? [], user.email)) {
    redirect("/mentorship");
  }

  // Same defensive redirect for the separate non-mentor "viewer" role (see
  // lib/viewers.ts) - a viewer's /viewer/signup goes through this exact
  // same /auth/callback -> /onboarding default path, and this wizard is
  // just as meaningless for them as it is for a mentor.
  const { data: viewerRows } = await supabase.from("viewers").select("*").eq("active", true);
  if (findViewerByEmail(viewerRows ?? [], user.email)) {
    redirect("/viewer");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-10">
      <OnboardingForm initialProfile={profile ?? null} userId={user.id} />
    </main>
  );
}
