import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { formatSlotDate, formatSlotTime } from "@/lib/mentors";
import { getContentPublished } from "@/lib/platformSettings";
import AppShell from "@/components/AppShell";
import StudentNotesEditor from "@/components/StudentNotesEditor";
import StudentTopicChecklist, { type TopicChecklistRow } from "@/components/StudentTopicChecklist";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  beginning: "Just starting",
  middle: "In the middle",
  end: "Final stretch",
};

/**
 * "My Overview" - the student's own copy of the Overview tab their mentor
 * sees on their progress page: status, prep details, intake answers, the
 * mentor's standing note, the meeting link, and the full Systems &
 * Disciplines + Self Assessments checklist. Everything here is read-only;
 * RLS already lets a student SELECT their own rows in profiles,
 * mentor_student_notes, mentor_meeting_links and student_topic_checklist.
 */
export default async function StudentOverviewPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: adminRow } = await supabase
    .from("profiles")
    .select("is_admin, full_name")
    .eq("id", user.id)
    .single();
  const contentPublished = adminRow?.is_admin ? true : await getContentPublished(supabase);

  const [studentRes, noteRes, linkRes, checklistRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, email, avatar_url, status_update, status_updated_at, exam_track, subject_name, prep_stage, exam_date, daily_hour_goal, resources, completed_so_far, weak_areas, strong_areas, goals_notes, mentor_email"
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("mentor_student_notes").select("note, updated_at").eq("student_id", user.id).maybeSingle(),
    supabase.from("mentor_meeting_links").select("meeting_link, updated_at").eq("student_id", user.id).maybeSingle(),
    supabase.from("student_topic_checklist").select("resource, category, topic, completed").eq("student_id", user.id),
  ]);

  const student = studentRes.data as
    | (Pick<
        Profile,
        | "id"
        | "full_name"
        | "email"
        | "avatar_url"
        | "status_update"
        | "status_updated_at"
        | "exam_track"
        | "subject_name"
        | "prep_stage"
        | "exam_date"
        | "daily_hour_goal"
        | "resources"
        | "completed_so_far"
        | "weak_areas"
        | "strong_areas"
        | "goals_notes"
      > & { mentor_email?: string | null })
    | null;
  if (!student) redirect("/dashboard");

  const mentorNote = noteRes.data as { note: string | null; updated_at: string | null } | null;
  // Only show the link set by the student's CURRENT mentor.
  let meetingLink: { meeting_link: string; updated_at: string } | null = null;
  let mentorName: string | null = null;
  if (student.mentor_email) {
    const { data: m } = await supabase
      .from("mentors")
      .select("id, name")
      .ilike("email", student.mentor_email)
      .maybeSingle();
    mentorName = (m as { name: string } | null)?.name ?? null;
  }
  meetingLink = (linkRes.data as { meeting_link: string; updated_at: string } | null) ?? null;
  const topicChecklistRows = (checklistRes.data ?? []) as TopicChecklistRow[];

  return (
    <AppShell isAdmin={adminRow?.is_admin} userName={adminRow?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 px-6 py-8 w-full">
        <h1 className="text-xl font-bold mb-1">My Overview</h1>
        <p className="text-sm text-slate-400 mb-6">
          Your prep details, your mentor&apos;s notes, and the systems, disciplines and self-assessments you have
          covered. Your mentor keeps the checklist up to date.
        </p>

        <div className="space-y-8">
          {mentorName && (
            <div className="card">
              <p className="label">Your mentor</p>
              <p className="text-sm">{mentorName}</p>
            </div>
          )}

          {student.status_update && (
            <div className="card">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Status</p>
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{student.status_update}</p>
              {student.status_updated_at && (
                <p className="text-xs text-slate-600 mt-1">
                  Updated {formatSlotDate(student.status_updated_at)} at {formatSlotTime(student.status_updated_at)}
                </p>
              )}
            </div>
          )}

          <div className="card grid sm:grid-cols-2 gap-4">
            <div>
              <p className="label">Track</p>
              <p className="text-sm">
                {student.exam_track === "subject"
                  ? `Subject exams${student.subject_name ? ` - ${student.subject_name}` : ""}`
                  : student.exam_track === "step1"
                  ? "Step 1 (CBSE)"
                  : "Not set"}
              </p>
            </div>
            <div>
              <p className="label">Prep stage</p>
              <p className="text-sm">{student.prep_stage ? STAGE_LABEL[student.prep_stage] : "Not set"}</p>
            </div>
            <div>
              <p className="label">Exam date</p>
              <p className="text-sm">{student.exam_date || "Not set"}</p>
            </div>
            <div>
              <p className="label">Daily hour goal</p>
              <p className="text-sm">{student.daily_hour_goal ? `${student.daily_hour_goal}h` : "Not set"}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="label">Resources</p>
              <p className="text-sm">{student.resources?.length ? student.resources.join(", ") : "Not set"}</p>
            </div>
          </div>

          {(student.completed_so_far || student.strong_areas || student.weak_areas || student.goals_notes) && (
            <div className="card space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Intake details</p>
              {student.completed_so_far && (
                <div>
                  <p className="label">Completed so far</p>
                  <p className="text-sm text-slate-300">{student.completed_so_far}</p>
                </div>
              )}
              {student.strong_areas && (
                <div>
                  <p className="label">Strong in</p>
                  <p className="text-sm text-slate-300">{student.strong_areas}</p>
                </div>
              )}
              {student.weak_areas && (
                <div>
                  <p className="label">Struggling with</p>
                  <p className="text-sm text-slate-300">{student.weak_areas}</p>
                </div>
              )}
              {student.goals_notes && (
                <div>
                  <p className="label">Goals / wants</p>
                  <p className="text-sm text-slate-300">{student.goals_notes}</p>
                </div>
              )}
            </div>
          )}

          <StudentTopicChecklist studentId={user.id} initialRows={topicChecklistRows} readOnly />

          <StudentNotesEditor
            studentId={user.id}
            initialNote={mentorNote?.note ?? null}
            initialUpdatedAt={mentorNote?.updated_at ?? null}
            readOnly
          />

          {meetingLink?.meeting_link && (
            <div className="card">
              <p className="text-sm font-semibold mb-1">Meeting link</p>
              <p className="text-xs text-slate-500 mb-2">Your permanent session room with your mentor.</p>
              <a
                href={meetingLink.meeting_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-brand-400 hover:text-brand-300 font-semibold break-all"
              >
                {meetingLink.meeting_link}
              </a>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}
