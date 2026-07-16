import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ComingSoonCard from "@/components/ComingSoonCard";

export const dynamic = "force-dynamic";

export default async function ErrorNotesPage() {
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

  return (
    <AppShell isAdmin={profileData?.is_admin} userName={profileData?.full_name}>
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8 w-full">
        <ComingSoonCard
          title="Error Notes"
          description="Every misconception you've hit, saved in one place - pulled from the Error DNA tags on questions you've gotten wrong."
          bullets={[
            "\"Acarbose vs Orlistat - Acarbose blocks carbohydrate digestion, Orlistat blocks fat digestion\"",
            "Linked back to the question it came from, so you can revisit the source",
            "A \"Practice this concept\" button to drill it immediately",
          ]}
        />
      </main>
    </AppShell>
  );
}
