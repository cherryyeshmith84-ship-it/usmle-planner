import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ComingSoonCard from "@/components/ComingSoonCard";

export const dynamic = "force-dynamic";

export default async function MasterGridPage() {
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
          title="Master Grid"
          description="Your complete performance map, built from every question you've answered - drill down from System, into Discipline, into Topic, into Concept."
          bullets={[
            "Endocrine 62% -> Thyroid 78%, Adrenal 53%, Diabetes 71%, Reproductive endocrine 46%",
            "Click any system to see the disciplines and topics underneath it",
            "Mastery percentages and trend arrows update as you take more questions",
          ]}
        />
      </main>
    </AppShell>
  );
}
