import Link from "next/link";
import { requireAdmin } from "@/lib/adminGuard";
import type { Profile } from "@/lib/types";
import { getContentPublished } from "@/lib/platformSettings";
import AdminNav from "@/components/AdminNav";
import PublishToggle from "@/components/PublishToggle";
import MentorAssignSelect from "@/components/MentorAssignSelect";
import WaitingVisibilityToggle from "@/components/WaitingVisibilityToggle";
import ViewerMentorsEditor from "@/components/ViewerMentorsEditor";
import StudentViewersEditor from "@/components/StudentViewersEditor";
import { isMentorProfile, mentorEmailSet } from "@/lib/mentors";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  beginning: "Just starting",
  middle: "In the middle",
  end: "Final stretch",
};

// Newest signup first.
const byNewest = (a: Profile, b: Profile) => (b.created_at ?? "").localeCompare(a.created_at ?? "");

export default async function AdminHome() {
  const { supabase, user } = await requireAdmin();

  const [profilesRes, templatesRes, mentorsRes, viewersGrantsRes, viewersRes, contentPublished] = await Promise.all([
    supabase.from("profiles").select("*").neq("id", user.id).order("created_at", { ascending: false }),
    supabase.from("schedule_templates").select("id, name"),
    // Every mentor row, active or not - active-only filtering happens below
    // for the assignment dropdown specifically, but exclusion from the
    // Students list applies to any registered mentor account regardless of
    // active status.
    supabase.from("mentors").select("id, name, email, active").order("name"),
    // Every existing "extra viewer" grant, all students at once.
    supabase.from("mentor_student_viewers").select("student_id, mentor_id"),
    // The non-mentor "viewers" roster (see lib/viewers.ts and /admin/viewers).
    supabase.from("viewers").select("id, name, email, active").order("name"),
    getContentPublished(supabase),
  ]);

  const allMentorRows = (mentorsRes.data ?? []) as { id: string; name: string; email: string; active: boolean }[];
  const excludeMentorEmails = mentorEmailSet(allMentorRows);

  // Mentors sign up through the same public form as students, so their
  // profiles row would otherwise show up mixed into this list - filter them
  // out here.
  const allStudents = ((profilesRes.data ?? []) as Profile[]).filter(
    (s) => !isMentorProfile(s.email, excludeMentorEmails)
  );
  const needsAttentionCheck = (s: Profile) =>
    (s.onboarding_completed && !s.assigned_template_id) || !!s.track_changed_pending;
  const needsPlan = allStudents.filter(needsAttentionCheck);
  const students = allStudents;

  const templateMap = new Map((templatesRes.data ?? []).map((t: any) => [t.id, t.name]));

  const activeMentors = allMentorRows.filter((m) => m.active);
  const mentorNameByEmail = new Map(activeMentors.map((m) => [m.email.toLowerCase(), m.name]));
  const mentorNameFor = (s: Profile) =>
    s.mentor_email ? mentorNameByEmail.get(s.mentor_email.toLowerCase()) ?? s.mentor_email : null;

  // student_id -> [mentor_id, ...] map of who's been granted read-only
  // viewer access to each student.
  const viewerMentorIdsByStudent = new Map<string, string[]>();
  for (const row of (viewersGrantsRes.data ?? []) as { student_id: string; mentor_id: string }[]) {
    const arr = viewerMentorIdsByStudent.get(row.student_id) ?? [];
    arr.push(row.mentor_id);
    viewerMentorIdsByStudent.set(row.student_id, arr);
  }

  const activeViewers = ((viewersRes.data ?? []) as { id: string; name: string; email: string; active: boolean }[]).filter(
    (v) => v.active
  );

  // Non-mentor viewer grants, same student_id -> [id, ...] shape.
  const { data: studentViewerGrants } = await supabase.from("student_viewers").select("student_id, viewer_id");
  const viewerIdsByStudent = new Map<string, string[]>();
  for (const row of (studentViewerGrants ?? []) as { student_id: string; viewer_id: string }[]) {
    const arr = viewerIdsByStudent.get(row.student_id) ?? [];
    arr.push(row.viewer_id);
    viewerIdsByStudent.set(row.student_id, arr);
  }

  // Applicants who haven't been paired with a mentor yet - NEWEST signup
  // first, so someone who just registered is always at the very top. Includes
  // students hidden from the mentor-facing Waiting list (waiting_hidden) -
  // hiding only affects what mentors see, never this admin view.
  const waitingForMentor = allStudents.filter((s) => !s.mentor_email).sort(byNewest);

  // Students list order: everyone still waiting for a mentor first (newest
  // first), then every mentored student grouped under their mentor - one
  // block per mentor (alphabetical by mentor name), newest student first
  // within each block, so e.g. all of one mentor's students sit together.
  const mentoredByKey = new Map<string, { title: string; students: Profile[] }>();
  for (const s of allStudents.filter((st) => st.mentor_email)) {
    const key = (s.mentor_email as string).toLowerCase();
    const entry = mentoredByKey.get(key) ?? { title: mentorNameFor(s) ?? (s.mentor_email as string), students: [] };
    entry.students.push(s);
    mentoredByKey.set(key, entry);
  }
  const studentGroups: { key: string; title: string; students: Profile[]; waiting: boolean }[] = [];
  if (waitingForMentor.length > 0) {
    studentGroups.push({ key: "__waiting", title: "Waiting for a mentor", students: waitingForMentor, waiting: true });
  }
  [...mentoredByKey.entries()]
    .sort((a, b) => a[1].title.localeCompare(b[1].title))
    .forEach(([key, entry]) => {
      studentGroups.push({ key, title: `Mentor: ${entry.title}`, students: [...entry.students].sort(byNewest), waiting: false });
    });

  function renderStudentCard(s: Profile) {
    const needsPlanFlag = s.onboarding_completed && !s.assigned_template_id;
    const needsAttention = needsPlanFlag || !!s.track_changed_pending;
    return (
      // A plain <div>, not a <Link> - only the explicit "View profile" link
      // navigates, so the assign control below never triggers navigation.
      <div key={s.id} className={`card transition ${needsAttention ? "border-amber-700" : ""}`}>
        <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
          <h3 className="font-semibold">{s.full_name || s.email || "Unnamed student"}</h3>
          <div className="flex items-center gap-2">
            {s.track_changed_pending && (
              <span className="text-xs font-semibold bg-amber-900/40 text-amber-400 rounded-full px-2 py-1">
                Track changed
              </span>
            )}
            {needsPlanFlag && (
              <span className="text-xs font-semibold bg-amber-900/40 text-amber-400 rounded-full px-2 py-1">
                Needs a plan
              </span>
            )}
            <span className="text-xs font-semibold bg-slate-800 text-slate-300 rounded-full px-2 py-1">
              {s.exam_track === "subject"
                ? `Subject${s.subject_name ? `: ${s.subject_name}` : ""}`
                : s.prep_stage
                ? STAGE_LABEL[s.prep_stage]
                : "Step 1"}
            </span>
            <Link
              href={`/admin/students/${s.id}`}
              className="text-xs text-brand-400 hover:text-brand-300 whitespace-nowrap"
            >
              View profile &rarr;
            </Link>
          </div>
        </div>
        <p className="text-sm text-slate-400">
          {s.email}
          {s.created_at ? ` · joined ${s.created_at.slice(0, 10)}` : ""}
          {s.exam_date ? ` · exam ${s.exam_date}` : ""}
          {s.daily_hour_goal ? ` · goal ${s.daily_hour_goal}h/day` : ""}
        </p>
        <div className="flex items-center gap-2 flex-wrap mt-1">
          <p className="text-xs">
            {mentorNameFor(s) ? (
              <span className="text-green-400">Mentor: {mentorNameFor(s)}</span>
            ) : (
              <span className="text-amber-400">No mentor yet</span>
            )}
          </p>
          {/* Assign/remove control - picking "No mentor" and clicking Assign
              clears mentor_email, which is how an admin un-assigns someone. */}
          {activeMentors.length > 0 && (
            <MentorAssignSelect studentId={s.id} mentors={activeMentors} currentMentorEmail={s.mentor_email ?? null} />
          )}
        </div>
        {/* Extra mentors who can VIEW (read-only) this student. */}
        {activeMentors.length > 0 && (
          <div className="mt-2">
            <ViewerMentorsEditor
              studentId={s.id}
              mentors={activeMentors}
              primaryMentorEmail={s.mentor_email ?? null}
              initialViewerMentorIds={viewerMentorIdsByStudent.get(s.id) ?? []}
            />
          </div>
        )}
        {/* Non-mentor "viewers" with read-only access to this student. */}
        {activeViewers.length > 0 && (
          <div className="mt-2">
            <StudentViewersEditor
              studentId={s.id}
              viewers={activeViewers}
              initialViewerIds={viewerIdsByStudent.get(s.id) ?? []}
            />
          </div>
        )}
        <p className="text-sm text-brand-300 mt-1">
          {s.assigned_template_id
            ? `Assigned: ${templateMap.get(s.assigned_template_id) ?? "template"}`
            : s.onboarding_completed
            ? "No template assigned yet"
            : "Hasn't finished onboarding yet"}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6 space-y-3">
          <PublishToggle initialPublished={contentPublished} />
        </div>

        {/* Applicants with no mentor yet - newest application first.
            Deliberately NOT wrapped in a <Link>, since each row has its own
            interactive assign control. */}
        <div className="mb-8">
          <h2 className="text-lg font-bold mb-1">
            Waiting for a mentor ({waitingForMentor.length})
          </h2>
          <p className="text-sm text-slate-400 mb-4">
            No mentor assigned yet - newest signup first. "Hide from mentors" pulls someone out of
            every mentor's own self-service Waiting list without assigning them - use it for spam/test
            signups or anyone you'd rather route by hand.
          </p>
          {waitingForMentor.length === 0 ? (
            <p className="text-sm text-slate-500">
              Everyone who&apos;s signed up already has a mentor assigned.
            </p>
          ) : (
            <div className="space-y-3">
              {waitingForMentor.map((s) => (
                <div key={s.id} className="card">
                  <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{s.full_name || s.email || "Unnamed student"}</h3>
                      {s.waiting_hidden && (
                        <span className="text-xs font-semibold bg-slate-800 text-slate-400 rounded-full px-2 py-1">
                          Hidden from mentors
                        </span>
                      )}
                    </div>
                    <Link href={`/admin/students/${s.id}`} className="text-xs text-brand-400 hover:text-brand-300">
                      View profile &rarr;
                    </Link>
                  </div>
                  <p className="text-sm text-slate-400 mb-3">
                    {s.email}
                    {s.created_at ? ` · applied ${s.created_at.slice(0, 10)}` : ""}
                  </p>
                  <div className="flex items-center gap-4 flex-wrap">
                    {activeMentors.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No active mentors to assign yet - add one under Mentors first.
                      </p>
                    ) : (
                      <MentorAssignSelect studentId={s.id} mentors={activeMentors} currentMentorEmail={s.mentor_email ?? null} />
                    )}
                    <WaitingVisibilityToggle studentId={s.id} hidden={!!s.waiting_hidden} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <h1 className="text-xl font-bold mb-1">Students ({students.length})</h1>
        <p className="text-sm text-slate-400 mb-2">
          Waiting students first (newest on top), then students grouped by mentor.
        </p>
        {needsPlan.length > 0 && (
          <p className="text-sm text-amber-400 mb-5">
            {needsPlan.length} student{needsPlan.length === 1 ? "" : "s"} need
            {needsPlan.length === 1 ? "s" : ""} attention - a plan assigned, or a plan
            review after switching exam tracks.
          </p>
        )}
        {needsPlan.length === 0 && <div className="mb-6" />}

        {students.length === 0 && (
          <p className="text-sm text-slate-400">
            No students have signed up yet. Once they do, they&apos;ll show up here.
          </p>
        )}

        <div className="space-y-8">
          {studentGroups.map((group) => (
            <section key={group.key}>
              <h2
                className={`text-sm font-bold uppercase tracking-wide mb-3 ${
                  group.waiting ? "text-amber-400" : "text-brand-300"
                }`}
              >
                {group.title} ({group.students.length})
              </h2>
              <div className="space-y-3">{group.students.map((s) => renderStudentCard(s))}</div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
