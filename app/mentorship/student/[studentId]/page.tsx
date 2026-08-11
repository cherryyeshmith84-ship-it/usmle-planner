import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { Mentor, MentorSlot, SessionNote } from "@/lib/mentors";
import { findMentorByEmail, formatSlotDate, formatSlotTime, getSlotStatus } from "@/lib/mentors";
import { getContentPublished } from "@/lib/platformSettings";
import { computeDisciplineStrengths, computeSystemStrengths, type ScoreReport } from "@/lib/scoreReports";
import type { PlannerColumn, PlannerEntry, StudyResource } from "@/lib/plannerColumns";
import { resolvePlannerColumns, mainPlannerColumns } from "@/lib/plannerColumns";
import type { MentorDailyNote } from "@/lib/mentorDailyNotes";
import type { PlanTask } from "@/lib/planTasks";
import type { UWorldBlock } from "@/lib/uworldBlocks";
import { easternDateStringNow } from "@/lib/timezone";
import AppShell from "@/components/AppShell";
import StudyPlanEditor from "@/components/StudyPlanEditor";
import MeetingLinkEditor from "@/components/MeetingLinkEditor";
import MentorScoreReportRow from "@/components/MentorScoreReportRow";
import AssignToPlanButton from "@/components/AssignToPlanButton";
import MentorPlannerColumnsEditor from "@/components/MentorPlannerColumnsEditor";
import PlannerStartDateControl from "@/components/PlannerStartDateControl";
import PlannerCalendar from "@/components/PlannerCalendar";
import MentorChatPanel from "@/components/MentorChatPanel";
import MentorStudentTabs, { type StudentTabDef } from "@/components/MentorStudentTabs";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  beginning: "Just starting",
  middle: "In the middle",
  end: "Final stretch",
};

const TREND_LABEL: Record<string, string> = {
  improving: "↑ Improving",
  declining: "↓ Declining",
  flat: "→ Flat",
  unknown: "",
};
const TREND_STYLE: Record<string, string> = {
  improving: "text-green-400",
  declining: "text-red-400",
  flat: "text-slate-400",
  unknown: "text-slate-500",
};

function scoreBadgeClass(pct: number | null) {
  if (pct === null) return "bg-slate-800 text-slate-300";
  if (pct >= 75) return "bg-green-900/40 text-green-400";
  if (pct >= 60) return "bg-yellow-900/40 text-yellow-400";
  if (pct >= 45) return "bg-orange-900/40 text-orange-400";
  return "bg-red-900/40 text-red-400";
}

/**
 * "Student progress" view a mentor can open for a specific student. Score
 * reports stay upload-only by the student - a mentor can only view and
 * review those. Day-to-day planning happens entirely through the same
 * calendar the student sees on their own /planner (PlannerCalendar.tsx,
 * with canEdit + mentorId passed in so it becomes a full add/edit/remove
 * Assignments editor instead of a read-only checklist).
 *
 * Split into tabs (Overview / Sessions / Study Planner / Analysis /
 * Messages) via MentorStudentTabs.tsx instead of one long scrolling page -
 * mirrors the same grouping a student sees for themselves in the sidebar
 * (Mentorship / Upcoming Sessions / Study Planner / Analysis), just scoped
 * to this one student and reached as in-page tabs since a mentor is
 * switching between sections for the SAME student rather than navigating
 * their own account. Sessions and Messages only make sense for this
 * student's actual mentor, so those two tabs are omitted entirely for an
 * admin browsing without a mentor relationship.
 *
 * RLS (is_mentor_of_student - see migrations mentor_read_student_progress
 * and mentor_write_student_planner_entries) is what actually enforces that
 * a mentor can only load/write a student they have a real relationship
 * with - this page's own not-a-mentor / no-relationship checks below are
 * just a friendlier 404 on top of that.
 */
export default async function StudentProgressPage({ params }: { params: { studentId: string } }) {
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

  // Only mentors (or admins, who can see everything anyway) have any reason
  // to land here - a student hitting this URL just gets sent back.
  if (!myMentorRecord && !profile?.is_admin) redirect("/mentorship");

  const { data: studentData } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, status_update, status_updated_at, exam_track, subject_name, prep_stage, exam_date, daily_hour_goal, resources, completed_so_far, weak_areas, strong_areas, goals_notes"
    )
    .eq("id", params.studentId)
    .maybeSingle();
  // RLS on profiles only returns a row here if this mentor actually has a
  // relationship with this student (or the viewer is an admin) - no row
  // means either the student doesn't exist or there's no real relationship,
  // and either way a 404 is the right, non-leaky response.
  if (!studentData) notFound();
  const student = studentData as Pick<
    Profile,
    | "id"
    | "full_name"
    | "email"
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
  >;

  const [
    scoreReportsRes,
    plannerColumnsRes,
    plannerEntriesRes,
    slotsRes,
    notesRes,
    studyPlanRes,
    meetingLinkRes,
    dailyNotesRes,
    planTasksRes,
    plannerSettingsRes,
    blocksRes,
    resourcesRes,
  ] = await Promise.all([
    supabase
      .from("score_reports")
      .select("*")
      .eq("user_id", params.studentId)
      .order("taken_date", { ascending: false }),
    // Both the shared global defaults (student_id null) AND this student's
    // own customized columns (if their mentor has set any up) - not
    // filtered to active=true here since MentorPlannerColumnsEditor also
    // needs to manage hidden ones. resolvePlannerColumns below picks which
    // set actually applies, then it's filtered to active for display.
    supabase.from("planner_columns").select("*").or(`student_id.is.null,student_id.eq.${params.studentId}`),
    // No date limit here (unlike the old read-only summary table) - the
    // editable grid below computes its own visible date range and needs
    // the full history to know what's actually been logged.
    supabase.from("planner_entries").select("*").eq("user_id", params.studentId),
    myMentorRecord
      ? supabase
          .from("mentor_slots")
          .select("*")
          .eq("mentor_id", myMentorRecord.id)
          .eq("booked_by", params.studentId)
          .eq("is_booked", true)
          .order("start_time", { ascending: false })
      : Promise.resolve({ data: [] as MentorSlot[] }),
    myMentorRecord
      ? supabase
          .from("mentor_session_notes")
          .select("*")
          .eq("mentor_id", myMentorRecord.id)
          .eq("student_id", params.studentId)
      : Promise.resolve({ data: [] as SessionNote[] }),
    myMentorRecord
      ? supabase.from("mentor_study_plans").select("*").eq("student_id", params.studentId).maybeSingle()
      : Promise.resolve({ data: null }),
    // Scoped to THIS mentor specifically, not just the student - the table
    // only ever holds one row per student (student_id is the primary key),
    // so if this student previously had a different mentor who set a link,
    // that row is still sitting there with the old mentor_id until
    // overwritten. Without the mentor_id filter here, a new mentor opening
    // this page would see the old mentor's stale link as if it were their
    // own. Filtering it out entirely (rather than showing it) means the new
    // mentor sees no link yet and adds their own, which then correctly
    // overwrites the row via MeetingLinkEditor's upsert.
    myMentorRecord
      ? supabase
          .from("mentor_meeting_links")
          .select("*")
          .eq("student_id", params.studentId)
          .eq("mentor_id", myMentorRecord.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("mentor_daily_notes").select("*").eq("student_id", params.studentId),
    supabase.from("mentor_plan_tasks").select("*").eq("student_id", params.studentId),
    supabase.from("student_planner_settings").select("start_date").eq("student_id", params.studentId).maybeSingle(),
    supabase.from("uworld_blocks").select("*").eq("user_id", params.studentId),
    supabase.from("study_resources").select("*").eq("active", true).order("sort_order", { ascending: true }),
  ]);

  const scoreReports = (scoreReportsRes.data ?? []) as ScoreReport[];
  const allPlannerColumnRows = (plannerColumnsRes.data ?? []) as PlannerColumn[];
  const defaultPlannerColumns = allPlannerColumnRows.filter((c) => !c.student_id);
  const ownPlannerColumns = allPlannerColumnRows.filter((c) => c.student_id === params.studentId);
  const plannerColumns = resolvePlannerColumns(allPlannerColumnRows, params.studentId).filter((c) => c.active);
  const plannerEntries = (plannerEntriesRes.data ?? []) as PlannerEntry[];
  const sessions = (slotsRes.data ?? []) as MentorSlot[];
  const notesBySlotId = new Map<string, SessionNote>((notesRes.data ?? []).map((n: any) => [n.slot_id, n]));
  const studyPlan = studyPlanRes.data as { content: string; updated_at: string } | null;
  const meetingLink = meetingLinkRes.data as { meeting_link: string; updated_at: string } | null;
  const dailyNotes = (dailyNotesRes.data ?? []) as MentorDailyNote[];
  const planTasks = (planTasksRes.data ?? []) as PlanTask[];
  const plannerStartDate = (plannerSettingsRes.data as { start_date: string } | null)?.start_date ?? null;
  const uworldBlocks = (blocksRes.data ?? []) as UWorldBlock[];
  const studyResources = (resourcesRes.data ?? []) as StudyResource[];

  const systemStrengths = computeSystemStrengths(scoreReports).slice(0, 5);
  const disciplineStrengths = computeDisciplineStrengths(scoreReports).slice(0, 5);

  // Full comparison tables (not just the top-5 weakest above) - a mentor
  // planning a session needs to see every system/discipline across every
  // report, the same depth the student themselves sees on their own
  // Analysis page, not just a quick-glance summary.
  const regularReports = scoreReports.filter((r) => r.exam_type !== "question_level");
  const comparisonReports = [...regularReports].sort((a, b) => (a.taken_date ?? "").localeCompare(b.taken_date ?? ""));
  const allSystemStrengths = computeSystemStrengths(regularReports);
  const allDisciplineStrengths = computeDisciplineStrengths(regularReports);

  // --- Tab contents -------------------------------------------------------

  const overviewContent = (
    <div className="space-y-8">
      {/* Status - the student's own free-text update, from Settings or
          their Home dashboard (components/StatusUpdateCard.tsx). Not shown
          at all if they've never set one, rather than an empty card. */}
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

      {/* Intake - what this student filled in on "Tell us about your prep"
          during onboarding (app/onboarding/OnboardingForm.tsx). */}
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

      {/* Meeting link - permanent per-(mentor, student) room, different
          students of the same mentor can have different links. */}
      {myMentorRecord && (
        <MeetingLinkEditor
          studentId={params.studentId}
          mentorId={myMentorRecord.id}
          currentUserId={user.id}
          initialLink={meetingLink?.meeting_link ?? null}
          initialUpdatedAt={meetingLink?.updated_at ?? null}
        />
      )}
    </div>
  );

  const sessionsContent = (
    <div>
      {sessions.length === 0 ? (
        <p className="text-sm text-slate-500">No sessions with this student yet.</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const status = getSlotStatus(s);
            const note = notesBySlotId.get(s.id);
            return (
              <div key={s.id} className="card py-3">
                <p className="text-sm">
                  {formatSlotDate(s.start_time)}, {formatSlotTime(s.start_time)}&ndash;
                  {formatSlotTime(s.end_time)}{" "}
                  <span className="text-slate-500">
                    ({status === "upcoming" ? "Upcoming" : status === "cancelled" ? "Cancelled" : "Completed"})
                  </span>
                </p>
                {note && (
                  <div className="mt-2 pl-1 space-y-1 text-sm text-slate-300">
                    {note.discussion && <p><span className="text-slate-500">Discussion:</span> {note.discussion}</p>}
                    {note.strengths && <p><span className="text-slate-500">Strengths:</span> {note.strengths}</p>}
                    {note.weaknesses && <p><span className="text-slate-500">Weaknesses:</span> {note.weaknesses}</p>}
                    {note.study_plan && <p><span className="text-slate-500">Study plan:</span> {note.study_plan}</p>}
                    {note.goals && <p><span className="text-slate-500">Goals:</span> {note.goals}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const studyPlannerContent = (
    <div className="space-y-8">
      {/* Planner schedule - where this student's plan starts. */}
      {myMentorRecord && (
        <div>
          <h2 className="text-lg font-bold mb-3">Planner schedule</h2>
          <PlannerStartDateControl studentId={params.studentId} initialStartDate={plannerStartDate} />
        </div>
      )}

      {/* Planner layout - lets a mentor add/edit/delete this specific
          student's planner columns without touching any other student's
          layout. */}
      {myMentorRecord && (
        <div>
          <h2 className="text-lg font-bold mb-3">Planner layout</h2>
          <MentorPlannerColumnsEditor
            studentId={params.studentId}
            defaultColumns={defaultPlannerColumns}
            initialOwnColumns={ownPlannerColumns}
          />
        </div>
      )}

      {/* Study planner - the same calendar the student sees on their own
          /planner. Click a day to add/edit Assignments, log UWorld blocks,
          and read/write Mentor Notes - editable when the viewer is this
          student's mentor. */}
      <div>
        <PlannerCalendar
          targetUserId={params.studentId}
          initialTasks={planTasks}
          initialEntries={plannerEntries}
          initialBlocks={uworldBlocks}
          initialMentorNotes={dailyNotes}
          studyResources={studyResources}
          mainColumns={mainPlannerColumns(plannerColumns)}
          columns={plannerColumns}
          canEdit={!!myMentorRecord}
          mentorId={myMentorRecord?.id ?? null}
          startDate={plannerStartDate}
          todayIso={easternDateStringNow()}
        />
      </div>
    </div>
  );

  const analysisContent = (
    <div className="space-y-8">
      <div>
        {scoreReports.length === 0 ? (
          <p className="text-sm text-slate-500">No score reports uploaded yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="card">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Weakest systems</p>
              <div className="space-y-1.5">
                {systemStrengths.map((s) => (
                  <div key={s.system} className="flex items-start justify-between gap-3 text-sm">
                    <span className="flex-1 min-w-0 leading-snug">{s.system}</span>
                    <span className="flex items-center gap-2 shrink-0 whitespace-nowrap">
                      <span className="text-slate-400">
                        {s.averagePercent}% <span className={TREND_STYLE[s.trend]}>{TREND_LABEL[s.trend]}</span>
                      </span>
                      {myMentorRecord && (
                        <AssignToPlanButton
                          studentId={params.studentId}
                          mentorId={myMentorRecord.id}
                          title={`Review ${s.system}`}
                          detail={`Weak system - ${s.averagePercent}% average${
                            s.trend !== "unknown" ? `, ${TREND_LABEL[s.trend].toLowerCase()}` : ""
                          }`}
                        />
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Weakest disciplines
              </p>
              <div className="space-y-1.5">
                {disciplineStrengths.length === 0 ? (
                  <p className="text-sm text-slate-500">No discipline breakdown available.</p>
                ) : (
                  disciplineStrengths.map((s) => (
                    <div key={s.system} className="flex items-start justify-between gap-3 text-sm">
                      <span className="flex-1 min-w-0 leading-snug">{s.system}</span>
                      <span className="flex items-center gap-2 shrink-0 whitespace-nowrap">
                        <span className="text-slate-400">
                          {s.averagePercent}% <span className={TREND_STYLE[s.trend]}>{TREND_LABEL[s.trend]}</span>
                        </span>
                        {myMentorRecord && (
                          <AssignToPlanButton
                            studentId={params.studentId}
                            mentorId={myMentorRecord.id}
                            title={`Review ${s.system}`}
                            detail={`Weak discipline - ${s.averagePercent}% average${
                              s.trend !== "unknown" ? `, ${TREND_LABEL[s.trend].toLowerCase()}` : ""
                            }`}
                          />
                        )}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {comparisonReports.length > 1 && (
          <div className="card overflow-x-auto mt-4">
            <p className="text-sm font-semibold mb-3">Progress by system</p>
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pr-3 py-1">System</th>
                  {comparisonReports.map((r) => (
                    <th key={r.id} className="px-2 py-1 whitespace-nowrap">
                      {r.taken_date ?? "?"}
                      <br />
                      <span className="text-slate-600">{r.exam_name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allSystemStrengths.map((s) => (
                  <tr key={s.system} className="border-t border-slate-800">
                    <td className="pr-3 py-1.5 text-slate-300 whitespace-nowrap">{s.system}</td>
                    {comparisonReports.map((r) => {
                      const pct = r.system_breakdown?.[s.system];
                      return (
                        <td key={r.id} className="px-2 py-1.5 text-center">
                          {typeof pct === "number" ? (
                            <span className={`rounded-full px-1.5 py-0.5 ${scoreBadgeClass(pct)}`}>{pct}</span>
                          ) : (
                            <span className="text-slate-700">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {comparisonReports.length > 1 && allDisciplineStrengths.length > 0 && (
          <div className="card overflow-x-auto mt-4">
            <p className="text-sm font-semibold mb-3">Progress by discipline</p>
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pr-3 py-1">Discipline</th>
                  {comparisonReports.map((r) => (
                    <th key={r.id} className="px-2 py-1 whitespace-nowrap">
                      {r.taken_date ?? "?"}
                      <br />
                      <span className="text-slate-600">{r.exam_name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allDisciplineStrengths.map((s) => (
                  <tr key={s.system} className="border-t border-slate-800">
                    <td className="pr-3 py-1.5 text-slate-300 whitespace-nowrap">{s.system}</td>
                    {comparisonReports.map((r) => {
                      const pct = r.discipline_breakdown?.[s.system];
                      return (
                        <td key={r.id} className="px-2 py-1.5 text-center">
                          {typeof pct === "number" ? (
                            <span className={`rounded-full px-1.5 py-0.5 ${scoreBadgeClass(pct)}`}>{pct}</span>
                          ) : (
                            <span className="text-slate-700">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Study plan - only the signed-in mentor's own relationship can write
          here; overrides the default AI-generated study plan the student
          otherwise sees on their own Analysis page. */}
      {myMentorRecord && (
        <div>
          <h2 className="text-lg font-bold mb-3">Study plan</h2>
          <StudyPlanEditor
            studentId={params.studentId}
            mentorId={myMentorRecord.id}
            currentUserId={user.id}
            initialContent={studyPlan?.content ?? null}
            initialUpdatedAt={studyPlan?.updated_at ?? null}
          />
        </div>
      )}

      {/* Score reports */}
      {scoreReports.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-3">Score reports</h2>
          <div className="space-y-2">
            {scoreReports.map((r) => (
              <MentorScoreReportRow key={r.id} report={r} canReview={!!myMentorRecord} />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const messagesContent = myMentorRecord ? (
    <MentorChatPanel
      mentorId={myMentorRecord.id}
      studentId={params.studentId}
      otherPartyLabel={student.full_name || "this student"}
    />
  ) : null;

  const tabs: StudentTabDef[] = [
    { id: "overview", label: "Overview", content: overviewContent },
    ...(myMentorRecord ? [{ id: "sessions", label: "Sessions", content: sessionsContent }] : []),
    { id: "planner", label: "Study Planner", content: studyPlannerContent },
    { id: "analysis", label: "Analysis", content: analysisContent },
    ...(myMentorRecord ? [{ id: "messages", label: "Messages", content: messagesContent }] : []),
  ];

  return (
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 px-6 py-8 w-full">
        <Link href="/mentorship/students" className="text-xs text-brand-400 hover:text-brand-300">
          ← Back to students
        </Link>
        <h1 className="text-xl font-bold mt-2 mb-1">{student.full_name || "Student"}</h1>
        <p className="text-sm text-slate-400 mb-6">
          {myMentorRecord
            ? "Click a tab to switch sections, or click any day on the Study Planner calendar to add or edit Assignments, log UWorld blocks, and leave Mentor Notes. Score reports are still upload-only by the student."
            : "Read-only view - only this student's mentor can edit their planner, and only they can upload score reports."}
        </p>

        <MentorStudentTabs tabs={tabs} defaultTab="overview" />
      </main>
    </AppShell>
  );
}
