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
 * "Students you can view" - students this mentor is NOT the primary/
 * assigned mentor for, but an admin has granted them read-only "viewer"
 * access to (mentor_student_viewers, see migration
 * create_mentor_student_viewers). Deliberately a separate page from
 * /mentorship/students ("Your students") rather than merged into it, so
 * it's always obvious at a glance that everyone here is someone else's
 * student - the profile page itself also hides every edit control
 * (planner editor, notes editor, meeting link editor) for anyone who only
 * has viewer access, on top of the RLS layer already making writes
 * impossible.
 */
export default async function MentorViewingPage() {
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
  if (!myMentorRecord) redirect("/mentorship");

  // Which students an admin has granted this mentor viewer access to -
  // "Mentors can see their own viewer grants" RLS scopes this to exactly
  // this mentor's own rows already, but filtering by mentor_id explicitly
  // keeps this query self-documenting (same reasoning as the explicit
  // .ilike on /mentorship/students rather than relying on RLS alone).
  const { data: grantsData } = await supabase
    .from("mentor_student_viewers")
    .select("student_id")
    .eq("mentor_id", myMentorRecord.id);
  const studentIds = (grantsData ?? []).map((g: { student_id: string }) => g.student_id);

  let viewableStudents: Pick<
    Profile,
    "id" | "full_name" | "email" | "status_update" | "status_updated_at" | "exam_date" | "mentor_email"
  >[] = [];
  if (studentIds.length > 0) {
    const { data: studentsData } = await supabase
      .from("profiles")
      .select("id, full_name, email, status_update, status_updated_at, exam_date, mentor_email")
      .in("id", studentIds)
      .order("full_name", { ascending: true });
    viewableStudents = (studentsData ?? []) as typeof viewableStudents;
  }

  const mentorNameByEmail = new Map(mentors.map((m) => [m.email.toLowerCase(), m.name]));

  return (
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 px-6 py-8 w-full">
        <h1 className="text-xl font-bold mb-1">Students you can view</h1>
        <p className="text-sm text-slate-400 mb-6">
          Read-only access an admin has given you to someone else's student. You can see their sessions,
          study planner, and analysis, but only their own mentor can edit anything.
        </p>
        {viewableStudents.length === 0 ? (
          <p className="text-sm text-slate-500">
            No one yet - an admin can give you view access to a student under Admin &rarr; Students.
          </p>
        ) : (
          <div className="space-y-2">
            {viewableStudents.map((s) => (
              <Link
                key={s.id}
                href={`/mentorship/student/${s.id}`}
                className="card py-3 flex items-start justify-between gap-3 text-sm hover:border-brand-400 transition block"
              >
                <div className="min-w-0">
                  <p>
                    <span className="font-semibold">{s.full_name || "A student"}</span>{" "}
                    <span className="text-slate-500">&middot; {s.email}</span>
                    <span className="ml-2 text-xs font-semibold bg-slate-800 text-slate-400 rounded-full px-2 py-0.5">
                      View only
                    </span>
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {s.exam_date ? `Exam ${s.exam_date}` : "No exam date set"}
                    {s.mentor_email && mentorNameByEmail.get(s.mentor_email.toLowerCase())
                      ? ` · mentor: ${mentorNameByEmail.get(s.mentor_email.toLowerCase())}`
                      : ""}
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
