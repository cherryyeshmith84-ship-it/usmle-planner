import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import AppShell from "@/components/AppShell";
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
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

  const profile: Profile = (profileData as Profile | null) ?? {
    id: user.id,
    full_name: null,
    exam_date: null,
    prep_stage: null,
    daily_hour_goal: null,
    resources: [],
    ai_instructions: null,
  };

  return (
    <AppShell isAdmin={profile.is_admin} userName={profile.full_name}>
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8 w-full">
        <h1 className="text-xl font-bold mb-6">Settings</h1>
        <SettingsForm profile={profile} userId={user.id} email={user.email ?? ""} />
      </main>
    </AppShell>
  );
}
