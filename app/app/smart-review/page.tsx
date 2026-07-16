import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ComingSoonCard from "@/components/ComingSoonCard";

export const dynamic = "force-dynamic";

export default async function SmartReviewPage() {
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
          title="Smart Review"
          description="A short, prioritized review queue of concepts you're due to revisit, ranked by how much you're likely to have forgotten and how weak you were on them."
          bullets={[
            "\"You have 18 concepts due for review - 7 high priority, 8 medium, 3 low\"",
            "A focused 15-20 minute session instead of a full random block",
            "Pulled straight from concepts you've gotten wrong or flagged before",
          ]}
        />
      </main>
    </AppShell>
  );
}
