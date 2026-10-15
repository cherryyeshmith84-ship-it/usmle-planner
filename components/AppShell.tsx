import type { ReactNode } from "react";
import NavBar from "./NavBar";
import TopHeader from "./TopHeader";
import TimezoneSync from "./TimezoneSync";
import Planner9pmPopup from "./Planner9pmPopup";
import TermsGate from "./TermsGate";
import { createClient } from "@/lib/supabase/server";
import { TERMS_VERSION } from "@/lib/terms";

/**
 * Shared page shell: sidebar (NavBar) + persistent top header, wrapping
 * whatever the page renders as its main content.
 *
 * TimezoneSync and Planner9pmPopup are mounted here so they work sitewide.
 * contentPublished is forwarded to NavBar (gates Learn/Improve nav groups).
 *
 * TERMS GATE: before rendering anything, checks that the signed-in STUDENT
 * has accepted the current TERMS_VERSION (table terms_acceptances); if not,
 * renders ONLY the blocking <TermsGate /> instead of the page. Admins,
 * mentors and viewers are exempt. If the check errors, the page loads
 * normally (fail-open) so a hiccup never locks everyone out.
 */
async function studentMustAcceptTerms(): Promise<{ must: boolean; name: string | null }> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { must: false, name: null };

    const { data: accepted } = await supabase
      .from("terms_acceptances")
      .select("id")
      .eq("user_id", user.id)
      .eq("terms_version", TERMS_VERSION)
      .maybeSingle();
    if (accepted) return { must: false, name: null };

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin, full_name")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.is_admin) return { must: false, name: null };

    if (user.email) {
      const [mentorRes, viewerRes] = await Promise.all([
        supabase.from("mentors").select("id").ilike("email", user.email).eq("active", true).maybeSingle(),
        supabase.from("viewers").select("id").ilike("email", user.email).eq("active", true).maybeSingle(),
      ]);
      if (mentorRes.data || viewerRes.data) return { must: false, name: null };
    }

    return { must: true, name: (profile?.full_name as string | null) ?? null };
  } catch {
    return { must: false, name: null };
  }
}

export default async function AppShell({
  isAdmin,
  userName,
  streak,
  contentPublished,
  children,
}: {
  isAdmin?: boolean;
  userName?: string | null;
  streak?: number;
  contentPublished?: boolean;
  children: ReactNode;
}) {
  const gate = isAdmin ? { must: false, name: null } : await studentMustAcceptTerms();
  if (gate.must) {
    return <TermsGate userName={gate.name ?? userName} />;
  }

  return (
    <div className="min-h-screen flex">
      <TimezoneSync />
      <Planner9pmPopup />
      <NavBar isAdmin={isAdmin} userName={userName} streak={streak} contentPublished={contentPublished} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader userName={userName} streak={streak} />
        {children}
      </div>
    </div>
  );
}
