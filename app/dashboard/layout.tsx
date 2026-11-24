import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Anyone an admin added under Admin -> Leads -> Demo team lands on the Demo
 * team page (/demo: all new students, WhatsApp buttons, notes, suggest a
 * mentor) instead of the student dashboard or the student onboarding form.
 * Admins are left alone, so an admin who is also on the demo team can still
 * open the student pages.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: isDemo } = await supabase.rpc("is_demo_team");
    if (isDemo === true) {
      const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
      if (!(profile as { is_admin: boolean } | null)?.is_admin) redirect("/demo");
    }
  }

  return <>{children}</>;
}
