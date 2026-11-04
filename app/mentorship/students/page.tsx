import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { Mentor } from "@/lib/mentors";
import { findMentorByEmail } from "@/lib/mentors";
import { getContentPublished } from "@/lib/platformSettings";
import AppShell from "@/components/AppShell";

export const dynamic = "force-dynamic";

type StudentRow = Pick<
  Profile,
  "id" | "full_name" | "email" | "avatar_url" | "status_update" | "status_updated_at" | "exam_date"
>;

/**
 * "Your students" for a mentor: students who linked this mentor's email,
 * PLUS students the admin added this mentor to as a co-mentor
 * (student_co_mentors table).
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
  if (!myMentorRecord) redirect("/mentorship");

  const columns = "id, full_name, email, avatar_url, status_update, status_updated_at, exam_date";

  // Main-mentor students (explicit email filter - see RLS note: admins match
  // broader policies, so never rely on RLS alone here).
  const { data: linkedStudentsData } = await supabase
    .from("profiles")
    .select(columns)
    .ilike("mentor_email", myMentorRecord.email)
    .order("full_name", { ascending: true });
  const linkedStudents = (linkedStudentsData ?? []) as StudentRow[];

  // Co-mentored students.
  const { data: coRows } = await supabase
    .from("student_co_mentors")
    .select("student_id")
    .eq("mentor_id", myMentorRecord.id);
  const coIds = ((coRows ?? []) as { student_id: string }[]).map((r) => r.student_id);
  let coStudents: StudentRow[] = [];
  if (coIds.length > 0) {
    const { data: coData } = await supabase.from("profiles").select(columns).in("id", coIds);
    coStudents = (coData ?? []) as StudentRow[];
  }

  const mainIds = new Set(linkedStudents.map((s) => s.id));
  const students: (StudentRow & { co: boolean })[] = [
    ...linkedStudents.map((s) => ({ ...s, co: false })),
    ...coStudents.filter((s) => !mainIds.has(s.id)).map((s) => ({ ...s, co: true })),
  ].sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));

  return (
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 px-6 py-8 w-full">
        <h1 className="text-xl font-bold mb-1">Your students</h1>
        <p className="text-sm text-slate-400 mb-6">
          Everyone who has linked your email as their mentor, plus students you were added to as a co-mentor.
          Open a student to see their sessions, study planner, analysis, and messages.
        </p>
        {students.length === 0 ? (
          <p className="text-sm text-slate-500">
            No students have linked your email yet - once a student adds your email under their Settings,
            they&apos;ll show up here.
          </p>
        ) : (
          <div className="space-y-2">
            {students.map((s) => (
              <Link
                key={s.id}
                href={`/mentorship/student/${s.id}`}
                className="card py-3 flex items-center gap-3 text-sm hover:border-brand-400 transition"
              >
                {s.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.avatar_url}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover border border-slate-700 shrink-0"
                  />
                ) : (
                  <span className="w-10 h-10 rounded-full bg-brand-900/50 text-brand-300 text-sm font-bold flex items-center justify-center shrink-0">
                    {(s.full_name || "?").trim().charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p>
                      <span className="font-semibold">{s.full_name || "A student"}</span>{" "}
                      <span className="text-slate-500">&middot; {s.email}</span>
                      {s.co && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-brand-400">Co-mentor</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {s.exam_date ? `Exam ${s.exam_date}` : "No exam date set"}
                    </p>
                    {s.status_update && (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">&ldquo;{s.status_update}&rdquo;</p>
                    )}
                  </div>
                  <span className="text-xs text-brand-400 shrink-0">Open →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
