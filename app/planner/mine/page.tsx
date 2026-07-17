import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PersonalTemplate, Profile } from "@/lib/types";
import AppShell from "@/components/AppShell";
import PersonalPlanForm from "@/components/PersonalPlanForm";

export const dynamic = "force-dynamic";

export default async function MyPlanPage() {
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
  if (!profile?.onboarding_completed) redirect("/onboarding");

  const { data: personalData } = await supabase
    .from("personal_templates")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name}>
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8 w-full">
        <h1 className="text-xl font-bold mb-1">My own plan</h1>
        <p className="text-sm text-slate-400 mb-6">
          Build your own day-by-day schedule. Saving this will make it your
          active plan on the Planner and Home pages instead of the one your
          coach assigned - you can switch back any time from the Planner page.
        </p>
        <PersonalPlanForm userId={user.id} initial={(personalData as PersonalTemplate) ?? null} />
      </main>
    </AppShell>
  );
}
