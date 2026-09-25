import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { findViewerByEmail, type Viewer } from "@/lib/viewers";
import { formatSlotDate } from "@/lib/mentors";

export const dynamic = "force-dynamic";

/**
 * A pure viewer's entire dashboard - deliberately NOT wrapped in the shared
 * AppShell/NavBar every student and mentor page uses (see AppShell.tsx),
 * since that nav is built around Home/Learn/Improve/Mentorship, none of
 * which apply to someone who is neither a student nor a mentor. This is
 * the "separated dashboard" for viewership members: a minimal header (logo
 * + sign out) plus a flat list of whatever students an admin has granted
 * them (student_viewers, see migration
 * create_viewers_and_student_viewers), each opening the same read-only
 * student profile view a viewer-mentor sees today
 * (app/mentorship/student/[studentId]/page.tsx) - nothing else is reachable
 * from here.
 */
export default async function ViewerDashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/viewer/login");

  const { data: viewersData } = await supabase.from("viewers").select("*").eq("active", true);
  const viewers = (viewersData ?? []) as Viewer[];
  const myViewerRecord = findViewerByEmail(viewers, user.email);
  // Not a registered (or no longer active) viewer - nothing for them here.
  if (!myViewerRecord) redirect("/viewer/login?error=not_viewer");

  const { data: grantsData } = await supabase
    .from("student_viewers")
    .select("student_id")
    .eq("viewer_id", myViewerRecord.id);
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

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-800 bg-white px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="" className="w-7 h-7 rounded-md" />
          <span className="font-bold text-brand-300">
            Master Grid <span className="text-slate-500 font-normal">&middot; Viewer</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400 hidden sm:inline">{myViewerRecord.name}</span>
          <form action="/auth/signout" method="post">
            <button className="text-sm font-medium text-slate-500 hover:text-slate-300">Sign out</button>
          </form>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-xl font-bold mb-1">Your students</h1>
          <p className="text-sm text-slate-400 mb-6">
            Read-only access an admin has given you. You can see each student's sessions, study planner,
            and analysis, but nothing here can be edited - only the student's own mentor can do that.
          </p>
          {viewableStudents.length === 0 ? (
            <p className="text-sm text-slate-500">
              No students yet - an admin can grant you access under Admin &rarr; Students.
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
                    </p>
                    {s.status_update && (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">&ldquo;{s.status_update}&rdquo;</p>
                    )}
                    {s.status_updated_at && (
                      <p className="text-[11px] text-slate-600 mt-0.5">Updated {formatSlotDate(s.status_updated_at)}</p>
                    )}
                  </div>
                  <span className="text-xs text-brand-400 shrink-0">Open &rarr;</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
