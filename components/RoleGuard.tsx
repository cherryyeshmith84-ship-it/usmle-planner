"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

export type ViewerRole = "student" | "mentor" | "admin";

// Pages that only make sense for a student (their own planner, question
// bank, analysis, sessions list, settings, student dashboard...).
const STUDENT_ONLY = [
  "/dashboard",
  "/qbank",
  "/assessments",
  "/master-grid",
  "/anki",
  "/error-notes",
  "/visual-lab",
  "/planner",
  "/history",
  "/settings",
  "/mentorship/sessions",
  "/lab-values",
];

function matches(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * Keeps mentors and admins out of student-only pages. Mentors are sent to
 * /mentorship, admins to /admin. An admin who is NOT also a mentor is
 * additionally kept off /mentorship (that route is the student mentor
 * directory for non-mentors). Renders nothing while a blocked page would be
 * showing, so there is no flash of student content before the redirect.
 */
export default function RoleGuard({
  role,
  isMentor,
  children,
}: {
  role: ViewerRole;
  isMentor: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();

  let blocked = false;
  if (role !== "student") {
    blocked = STUDENT_ONLY.some((p) => matches(pathname, p));
    if (role === "admin" && !isMentor && matches(pathname, "/mentorship")) blocked = true;
  }

  // A plain admin goes to /admin; a mentor (or an admin who is also a
  // mentor) goes to the mentor home.
  const target = role === "admin" && !isMentor ? "/admin" : "/mentorship";

  useEffect(() => {
    if (blocked) router.replace(target);
  }, [blocked, target, router]);

  if (blocked) return null;
  return <>{children}</>;
}
