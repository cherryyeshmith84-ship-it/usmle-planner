import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { getContentPublished } from "@/lib/platformSettings";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

/**
 * Home/dashboard page - deliberately minimal. Everything that used to live
 * here (recommended session, mastery stats, Master Grid preview, biggest
 * opportunity, daily task checklist, hours/block scores, end-of-day
 * reflection, AI coach, coach messages) was removed at the coach's request
 * on 2026-07-28 so the page could be rebuilt from scratch with new content.
 * See DashboardClient.tsx for the current (bare) layout.
 */
export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const profile = profileData as Profile | null;

  if (!profile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const contentPublished = profile.is_admin ? true : await getContentPublished(supabase);

  return <DashboardClient profile={profile} contentPublished={contentPublished} />;
}
