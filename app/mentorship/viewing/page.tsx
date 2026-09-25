import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { Mentor } from "@/lib/mentors";
import { findMentorByEmail } from "@/lib/mentors";
import { findViewerByEmail, type Viewer } from "@/lib/viewers";
import { getContentPublished } from "@/lib/platformSettings";
import AppShell from "@/components/AppShell";

export const dynamic = "force-dynamic";

/**
 * "Students you can view" - every student this mentor is NOT the primary/
 * assigned mentor for, but has read-only access to. Two separate sources
 * feed into this one list, merged together so a mentor only ever has to
 * check one page instead of two:
 *
 * 1. mentor_student_viewers - an admin gave THIS mentor account read-only
 *    access to someone else's student (see ViewerMentorsEditor.tsx).
 * 2. student_viewers - this same email is ALSO on the separate, non-mentor
 *    "viewers" roster (lib/viewers.ts) and was granted access there (see
 *    StudentViewersEditor.tsx / the /viewer portal). A person who's both a
 *    mentor AND was added to the viewers roster under the same email
 *    shouldn't need a second login just to see those students too - they
 *    show up right here alongside the mentor-viewer grants. Someone who is
 *    ONLY a viewer (no mentors row at all) still can't reach this page at
 *    all (see the redirect below) and uses their own /viewer dashboard
 *    instead - this merge only ever helps an account that's already a
 *    mentor.
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

  // Source 1: students an admin granted THIS mentor read-only access to
  // via the mentor-viewer control. "Mentors can see their own viewer
  // grants" RLS scopes this to exactly this mentor's own rows already, but
  // filtering by mentor_id explicitly keeps this query self-documenting
  // (same reasoning as the explicit .ilike on /mentorship/students rather
  // than relying on RLS alone).
  const { data: mentorGrantsData } = await supabase
    .from("mentor_student_viewers")
    .select("student_id")
    .eq("mentor_id", myMentorRecord.id);
  const mentorGrantIds = (mentorGrantsData ?? []).map((g: { student_id: string }) => g.student_id);

  // Source 2: if this same email is ALSO on the separate, non-mentor
  // viewers roster, pull whatever students were granted there too, then
  // merge (deduped) with source 1 above.
  const { data: viewersData } = await supabase.from("viewers").select("*").eq("active", true);
  const myViewerRecord = findViewerByEmail((viewersData ?? []) as Viewer[], user.email);
  let viewerGrantIds: string[] = [];
  if (myViewerRecord) {
    const { data: viewerGrantsData } = await supabase
      .from("student_viewers")
      .select("student_id")
      .eq("viewer_id", myViewerRecord.id);
    viewerGrantIds = (viewerGrantsData ?? []).map((g: { student_id: string }) => g.student_id);
  }

  const studentIds = Array.from(new Set([...mentorGrantIds, ...viewerGrantIds]));

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
