import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ComingSoonCard from "@/components/ComingSoonCard";

export const dynamic = "force-dynamic";

export default async function VisualLabPage() {
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
          title="Visual Lab"
          description="A dedicated space for image-heavy study material - histology slides, EKGs, X-rays, and other visual recognition practice pulled from your question images."
        />
      </main>
    </AppShell>
  );
}
