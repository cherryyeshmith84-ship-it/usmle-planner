import type { ReactNode } from "react";
import NavBar from "./NavBar";
import TopHeader from "./TopHeader";
import TimezoneSync from "./TimezoneSync";
import Planner9pmPopup from "./Planner9pmPopup";
import TermsGate from "./TermsGate";
import RoleGuard, { type ViewerRole } from "./RoleGuard";
import { createClient } from "@/lib/supabase/server";
import { TERMS_VERSION } from "@/lib/terms";

/**
 * Shared page shell: sidebar (NavBar) + persistent top header, wrapping
 * whatever the page renders as its main content.
 *
 * TimezoneSync and Planner9pmPopup are mounted here so they work sitewide.
 * contentPublished is forwarded to NavBar (gates Learn/Improve nav groups).
 *
 * ROLES: the viewer is classified once here as admin, mentor or student.
 *  - admin  -> sees only admin pages (plus mentor pages if also a mentor)
 *  - mentor -> sees only mentor pages (Mentorship, Students, Planner
 *              Templates, Waiting, Viewing) - none of the student features
 *  - student-> unchanged
 * NavBar hides the student links for admins/mentors and <RoleGuard>
 * redirects them away from student-only URLs.
 *
 * TERMS GATE: a student who has not accepted the current TERMS_VERSION sees
 * only the blocking <TermsGate />. Admins, mentors and viewers are exempt.
 * If the checks error, the page loads normally (fail-open).
 */
async function resolveViewer(isAdminProp?: boolean): Promise<{
  role: ViewerRole;
  isMentor: boolean;
  mustAcceptTerms: boolean;
  name: string | null;
}> {
  const fallback = { role: (isAdminProp ? "admin" : "student") as ViewerRole, isMentor: false, mustAcceptTerms: false, name: null };
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fallback;

    const email = user.email ?? "";
    const [profileRes, mentorRes, viewerRes, acceptedRes] = await Promise.all([
      supabase.from("profiles").select("is_admin, full_name").eq("id", user.id).maybeSingle(),
      email
        ? supabase.from("mentors").select("id").ilike("email", email).eq("active", true).maybeSingle()
        : Promise.resolve({ data: null }),
      email
        ? supabase.from("viewers").select("id").ilike("email", email).eq("active", true).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("terms_acceptances")
        .select("id")
        .eq("user_id", user.id)
        .eq("terms_version", TERMS_VERSION)
        .maybeSingle(),
    ]);

    const isAdmin = !!isAdminProp || !!profileRes.data?.is_admin;
    const isMentor = !!mentorRes.data;
    const isViewer = !!viewerRes.data;
    const role: ViewerRole = isAdmin ? "admin" : isMentor ? "mentor" : "student";
    const mustAcceptTerms = role === "student" && !isViewer && !acceptedRes.data;

    return {
      role,
      isMentor,
      mustAcceptTerms,
      name: (profileRes.data?.full_name as string | null) ?? null,
    };
  } catch {
    return fallback;
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
  const viewer = await resolveViewer(isAdmin);

  if (viewer.mustAcceptTerms) {
    return <TermsGate userName={viewer.name ?? userName} />;
  }

  return (
    <RoleGuard role={viewer.role} isMentor={viewer.isMentor}>
      <div className="min-h-screen flex">
        <TimezoneSync />
        <Planner9pmPopup />
        <NavBar
          isAdmin={viewer.role === "admin"}
          isMentor={viewer.isMentor}
          userName={userName}
          streak={streak}
          contentPublished={contentPublished}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <TopHeader userName={userName} streak={streak} />
          {children}
        </div>
      </div>
    </RoleGuard>
  );
}
