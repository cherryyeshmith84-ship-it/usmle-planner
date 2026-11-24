import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Demo team members never fill in the student intake - send them straight to
 * the Demo team page (/demo). Admins are left alone.
 */
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
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
