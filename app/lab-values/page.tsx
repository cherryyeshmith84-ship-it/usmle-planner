import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContentPublished } from "@/lib/platformSettings";
import AppShell from "@/components/AppShell";
import LabValuesSearch from "@/components/LabValuesSearch";

export const dynamic = "force-dynamic";

export default async function LabValuesPage() {
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

  const contentPublished = profileData?.is_admin ? true : await getContentPublished(supabase);

  return (
    <AppShell isAdmin={profileData?.is_admin} userName={profileData?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8 w-full">
        <h1 className="text-xl font-bold mb-1">Lab values</h1>
        <p className="text-sm text-slate-400 mb-6">
          Standard adult reference ranges. Search by test name, category, or unit.
        </p>
        <LabValuesSearch />
      </main>
    </AppShell>
  );
}
