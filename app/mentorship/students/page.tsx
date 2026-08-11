import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { Mentor } from "@/lib/mentors";
import { findMentorByEmail } from "@/lib/mentors";
import { getContentPublished } from "@/lib/platformSettings";
import AppShell from "@/components/AppShell";

export const dynamic = "force-dynamic";

/**
 * Dedicated "Students" page for a mentor - every student who has linked this
 * mentor's email (Settings/onboarding "Your mentor's email" field), reached
 * via its own sidebar link (see NavBar.tsx) instead of being buried partway
 * down the mentor dashboard's scroll. Opening a student now lands on their
 * tabbed profile (Overview / Sessions / Study Planner / Analysis /
 * Messages) at /mentorship/student/[id] instead of one long page.
 */
export default async function MentorStudentsPage() {
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
  const profile = profileData as Pick<Profile, "is_admin" | "full_name"> | null;
  const contentPublished = profile?.is_admin ? true : await getContentPublished(supabase);

  const { data: mentorsData } = await supabase.from("mentors").select("*").eq("active", true);
  const mentors = (mentorsData ?? []) as Mentor[];
  const myMentorRecord = findMentorByEmail(mentors, user.email);
  // Only mentors have any reason to land here - a student (or an admin, who
  // has their own /admin/students list) hitting this URL just gets sent back.
  if (!myMentorRecord) redirect("/mentorship");

  // Same query/RLS pattern as the "My students" section on the mentor
  // dashboard (app/mentorship/page.tsx) - "Mentors can view profiles of
  // students who linked their email" already restricts the returned rows to
  // exactly this mentor's matches, no client-side filtering needed.
  const { data: linkedStudentsData } = await supabase
    .from("profiles")
    .select("id, full_name, email, status_update, status_updated_at, exam_date")
    .not("mentor_email", "is", null)
    .order("full_name", { ascending: true });
  const linkedStudents = (linkedStudentsData ?? []) as Pick<
    Profile,
    "id" | "full_name" | "email" | "status_update" | "status_updated_at" | "exam_date"
  >[];

  return (
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 px-6 py-8 w-full">
        <h1 className="text-xl font-bold mb-1">Your students</h1>
        <p className="text-sm text-slate-400 mb-6">
          Everyone who has linked your email as their mentor. Open a student to see their sessions, study
          planner, analysis, and messages.
        </p>
        {linkedStudents.length === 0 ? (
          <p className="text-sm text-slate-500">
            No students have linked your email yet - once a student adds your email under their Settings,
            they&apos;ll show up here.
          </p>
        ) : (
          <div className="space-y-2">
            {linkedStudents.map((s) => (
              <Link
                key={s.id}
                href={`/mentorship/student/${s.id}`}
                className="card py-3 flex items-start justify-between gap-3 text-sm hover:border-brand-400 transition block"
              >
                <div className="min-w-0">
                  <p>
                    <span className="font-semibold">{s.full_name || "A student"}</span>{" "}
                    <span className="text-slate-500">&middot; {s.email}</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {s.exam_date ? `Exam ${s.exam_date}` : "No exam date set"}
                  </p>
                  {s.status_update && (
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">&ldquo;{s.status_update}&rdquo;</p>
                  )}
                </div>
                <span className="text-xs text-brand-400 shrink-0">Open →</span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
