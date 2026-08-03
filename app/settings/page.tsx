import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { getContentPublished } from "@/lib/platformSettings";
import AppShell from "@/components/AppShell";
import StatusUpdateCard from "@/components/StatusUpdateCard";
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

  const contentPublished = profile.is_admin ? true : await getContentPublished(supabase);

  return (
    <AppShell isAdmin={profile.is_admin} userName={profile.full_name} contentPublished={contentPublished}>
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8 w-full space-y-6">
        <h1 className="text-xl font-bold">Settings</h1>
        <StatusUpdateCard
          userId={user.id}
          initialStatus={profile.status_update ?? null}
          initialUpdatedAt={profile.status_updated_at ?? null}
        />
        <SettingsForm profile={profile} userId={user.id} email={user.email ?? ""} />
      </main>
    </AppShell>
  );
}
