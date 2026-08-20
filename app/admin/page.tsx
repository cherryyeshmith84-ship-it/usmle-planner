import Link from "next/link";
import { requireAdmin } from "@/lib/adminGuard";
import type { Profile, ScheduleTemplate } from "@/lib/types";
import { getContentPublished, getTutoringPublished } from "@/lib/platformSettings";
import AdminNav from "@/components/AdminNav";
import PublishToggle from "@/components/PublishToggle";
import TutoringPublishToggle from "@/components/TutoringPublishToggle";
import MentorAssignSelect from "@/components/MentorAssignSelect";
import { isMentorProfile, mentorEmailSet } from "@/lib/mentors";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  beginning: "Just starting",
  middle: "In the middle",
  end: "Final stretch",
};

export default async function AdminHome() {
  const { supabase, user } = await requireAdmin();

  const [profilesRes, templatesRes, mentorsRes, contentPublished, tutoringPublished] = await Promise.all([
    supabase.from("profiles").select("*").neq("id", user.id).order("created_at", { ascending: false }),
    supabase.from("schedule_templates").select("id, name"),
    // Every mentor row, active or not - active-only filtering happens below
    // for the assignment dropdown specifically, but exclusion from the
    // Students list applies to any registered mentor account regardless of
    // active status.
    supabase.from("mentors").select("id, name, email, active").order("name"),
    getContentPublished(supabase),
    getTutoringPublished(supabase),
  ]);

  const allMentorRows = (mentorsRes.data ?? []) as { id: string; name: string; email: string; active: boolean }[];
  const excludeMentorEmails = mentorEmailSet(allMentorRows);

  // Mentors sign up through the same public form as students, so their
  // profiles row would otherwise show up mixed into this list - filter them
  // out here, before anything downstream (needsPlan/rest/waitingForMentor)
  // derives from it.
  const allStudents = ((profilesRes.data ?? []) as Profile[]).filter(
    (s) => !isMentorProfile(s.email, excludeMentorEmails)
  );
  // Students who need attention first: no plan yet, or just switched tracks
  // and their existing plan may no longer fit - surface these at the top.
  const needsAttentionCheck = (s: Profile) =>
    (s.onboarding_completed && !s.assigned_template_id) || !!s.track_changed_pending;
  const needsPlan = allStudents.filter(needsAttentionCheck);
  const rest = allStudents.filter((s) => !needsAttentionCheck(s));
  const students = [...needsPlan, ...rest];

  const templateMap = new Map((templatesRes.data ?? []).map((t: any) => [t.id, t.name]));

  const activeMentors = allMentorRows.filter((m) => m.active);
  const mentorNameByEmail = new Map(activeMentors.map((m) => [m.email.toLowerCase(), m.name]));
  const mentorNameFor = (s: Profile) =>
    s.mentor_email ? mentorNameByEmail.get(s.mentor_email.toLowerCase()) ?? s.mentor_email : null;

  // Founding-cohort applicants who haven't been paired with a mentor yet -
  // oldest signup first, since that's the fair order to work through them.
  const waitingForMentor = [...allStudents]
    .filter((s) => !s.mentor_email)
    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6 space-y-3">
          <PublishToggle initialPublished={contentPublished} />
          <TutoringPublishToggle initialPublished={tutoringPublished} />
        </div>

        {/* Founding-cohort applicants with no mentor yet - the whole point is
            to answer "who's still waiting, and who do I put them with" at a
            glance, oldest application first. Deliberately NOT wrapped in a
            <Link> like the cards below, since each row has its own
            interactive assign control. */}
        <div className="mb-8">
          <h2 className="text-lg font-bold mb-1">
            Waiting for a mentor ({waitingForMentor.length})
          </h2>
          <p className="text-sm text-slate-400 mb-4">
            No mentor assigned yet - oldest application first.
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
                    <h3 className="font-semibold">{s.full_name || s.email || "Unnamed student"}</h3>
                    <Link href={`/admin/students/${s.id}`} className="text-xs text-brand-400 hover:text-brand-300">
                      View profile &rarr;
                    </Link>
                  </div>
                  <p className="text-sm text-slate-400 mb-3">
                    {s.email}
                    {s.created_at ? ` · applied ${s.created_at.slice(0, 10)}` : ""}
                  </p>
                  {activeMentors.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No active mentors to assign yet - add one under Mentors first.
                    </p>
                  ) : (
                    <MentorAssignSelect studentId={s.id} mentors={activeMentors} currentMentorEmail={s.mentor_email ?? null} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <h1 className="text-xl font-bold mb-1">Students ({students.length})</h1>
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

        <div className="space-y-3">
          {students.map((s) => {
            const needsPlanFlag = s.onboarding_completed && !s.assigned_template_id;
            const needsAttention = needsPlanFlag || !!s.track_changed_pending;
            return (
              // A plain <div> now, not a <Link> - a Link wrapping the whole
              // card meant a click on the MentorAssignSelect below (even
              // with its own stopPropagation) could still trigger the
              // card's navigation before the mentor update finished, so
              // "Assign" looked like it just refreshed the page and did
              // nothing. Same fix already used one section up for "Waiting
              // for a mentor" - a plain card with its own explicit "View
              // profile" link, so only that link navigates.
              <div
                key={s.id}
                className={`card transition ${
                  needsAttention ? "border-amber-700" : ""
                }`}
              >
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
                  {/* Same assign/remove control as the "Waiting for a mentor"
                      section above, now on every student - picking "No
                      mentor" and clicking Assign clears mentor_email, which
                      is how an admin un-assigns someone. */}
                  {activeMentors.length > 0 && (
                    <MentorAssignSelect studentId={s.id} mentors={activeMentors} currentMentorEmail={s.mentor_email ?? null} />
                  )}
                </div>
                <p className="text-sm text-brand-300 mt-1">
                  {s.assigned_template_id
                    ? `Assigned: ${templateMap.get(s.assigned_template_id) ?? "template"}`
                    : s.onboarding_completed
                    ? "No template assigned yet"
                    : "Hasn't finished onboarding yet"}
                </p>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
