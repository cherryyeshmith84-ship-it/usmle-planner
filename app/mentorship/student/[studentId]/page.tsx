import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { Mentor, MentorSlot, SessionNote } from "@/lib/mentors";
import { findMentorByEmail, formatSlotDate, formatSlotTime, getSlotStatus } from "@/lib/mentors";
import { findViewerByEmail, type Viewer } from "@/lib/viewers";
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
import StudentNotesEditor from "@/components/StudentNotesEditor";
import MentorScoreReportRow from "@/components/MentorScoreReportRow";
import PlannerStartDateControl from "@/components/PlannerStartDateControl";
import SelfAssignedTasksToggle from "@/components/SelfAssignedTasksToggle";
import PlannerCalendar from "@/components/PlannerCalendar";
import MentorChatPanel from "@/components/MentorChatPanel";
import MentorStudentTabs, { type StudentTabDef } from "@/components/MentorStudentTabs";
import QBankSystemBreakdown from "@/components/QBankSystemBreakdown";
import StudentProgressGraphs, { type GraphBlock, type GraphReport } from "@/components/StudentProgressGraphs";
import { computeQBankSystemBreakdown } from "@/lib/qbankBlockStats";
import StudentTopicChecklist, { type TopicChecklistRow } from "@/components/StudentTopicChecklist";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  beginning: "Just starting",
  middle: "In the middle",
  end: "Final stretch",
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
 * ADMINS can plan too: an admin who is not the student's mentor gets the
 * same planner editing (start date, self-assign toggle, Assignments,
 * templates, repeat) - the tasks are filed under the student's linked
 * mentor (profiles.mentor_email -> mentors). If the student has no mentor
 * linked yet, the planner stays read-only with a note. The mentor-private
 * tabs (Sessions, Messages, meeting link, personal notes, study plan) stay
 * mentor-only. RLS already allows admins to write mentor_plan_tasks,
 * mentor_daily_notes and student_planner_settings.
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
  const isAdmin = !!profile?.is_admin;
  const contentPublished = isAdmin ? true : await getContentPublished(supabase);

  const { data: mentorsData } = await supabase.from("mentors").select("*").eq("active", true);
  const mentors = (mentorsData ?? []) as Mentor[];
  const myMentorRecord = findMentorByEmail(mentors, user.email);

  let myViewerRecord: Viewer | null = null;
  if (!myMentorRecord && !isAdmin) {
    const { data: viewersData } = await supabase.from("viewers").select("*").eq("active", true);
    myViewerRecord = findViewerByEmail((viewersData ?? []) as Viewer[], user.email);
  }

  let isPureViewer = false;
  if (myViewerRecord) {
    const { data: grantRow } = await supabase
      .from("student_viewers")
      .select("id")
      .eq("student_id", params.studentId)
      .eq("viewer_id", myViewerRecord.id)
      .maybeSingle();
    isPureViewer = !!grantRow;
  }

  if (!myMentorRecord && !isAdmin && !isPureViewer) {
    redirect(myViewerRecord ? "/viewer" : "/mentorship");
  }

  const { data: isRealMentorData } = myMentorRecord
    ? await supabase.rpc("is_mentor_of_student", { target_student_id: params.studentId })
    : { data: false };
  const canEdit = !!myMentorRecord && !!isRealMentorData;

  const { data: studentData } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, avatar_url, status_update, status_updated_at, exam_track, subject_name, prep_stage, exam_date, daily_hour_goal, resources, completed_so_far, weak_areas, strong_areas, goals_notes, mentor_email"
    )
    .eq("id", params.studentId)
    .maybeSingle();
  if (!studentData) notFound();
  const student = studentData as Pick<
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
  > & { mentor_email?: string | null };

  // Admin planner editing: file the tasks under the student's linked mentor.
  let adminMentorId: string | null = null;
  if (isAdmin && !canEdit && student.mentor_email) {
    const { data: linked } = await supabase.from("mentors").select("id, email").ilike("email", student.mentor_email);
    adminMentorId = ((linked ?? []) as { id: string; email: string }[])[0]?.id ?? null;
  }
  // No mentor linked: use the inactive "Admin (planner)" placeholder mentor so
  // admins can still assign tasks.
  if (isAdmin && !canEdit && !adminMentorId) {
    const { data: ph } = await supabase
      .from("mentors")
      .select("id")
      .eq("email", "admin-planner@mastergrid.invalid")
      .maybeSingle();
    adminMentorId = (ph as { id: string } | null)?.id ?? null;
  }
  const adminPlannerEdit = isAdmin && !canEdit && !!adminMentorId;
  const plannerCanEdit = canEdit || adminPlannerEdit;
  const plannerMentorId: string | null = canEdit ? myMentorRecord!.id : adminPlannerEdit ? adminMentorId : null;

  const [
    scoreReportsRes,
    plannerColumnsRes,
    plannerEntriesRes,
    slotsRes,
    notesRes,
    studyPlanRes,
    meetingLinkRes,
    studentNoteRes,
    dailyNotesRes,
    planTasksRes,
    plannerSettingsRes,
    blocksRes,
    resourcesRes,
    topicChecklistRes,
  ] = await Promise.all([
    supabase
      .from("score_reports")
      .select("*")
      .eq("user_id", params.studentId)
      .order("taken_date", { ascending: false }),
    supabase.from("planner_columns").select("*").or(`student_id.is.null,student_id.eq.${params.studentId}`),
    supabase.from("planner_entries").select("*").eq("user_id", params.studentId),
    canEdit
      ? supabase
          .from("mentor_slots")
          .select("*")
          .eq("mentor_id", myMentorRecord!.id)
          .eq("booked_by", params.studentId)
          .eq("is_booked", true)
          .order("start_time", { ascending: false })
      : Promise.resolve({ data: [] as MentorSlot[] }),
    canEdit
      ? supabase
          .from("mentor_session_notes")
          .select("*")
          .eq("mentor_id", myMentorRecord!.id)
          .eq("student_id", params.studentId)
      : Promise.resolve({ data: [] as SessionNote[] }),
    canEdit
      ? supabase.from("mentor_study_plans").select("*").eq("student_id", params.studentId).maybeSingle()
      : Promise.resolve({ data: null }),
    canEdit
      ? supabase
          .from("mentor_meeting_links")
          .select("*")
          .eq("student_id", params.studentId)
          .eq("mentor_id", myMentorRecord!.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    canEdit
      ? supabase
          .from("mentor_student_notes")
          .select("*")
          .eq("student_id", params.studentId)
          .eq("mentor_id", myMentorRecord!.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("mentor_daily_notes").select("*").eq("student_id", params.studentId),
    supabase.from("mentor_plan_tasks").select("*").eq("student_id", params.studentId),
    supabase
      .from("student_planner_settings")
      .select("start_date, allow_self_assigned_tasks")
      .eq("student_id", params.studentId)
      .maybeSingle(),
    supabase.from("uworld_blocks").select("*").eq("user_id", params.studentId),
    supabase.from("study_resources").select("*").eq("active", true).order("sort_order", { ascending: true }),
    supabase
      .from("student_topic_checklist")
      .select("resource, category, topic, completed")
      .eq("student_id", params.studentId),
  ]);

  const scoreReports = (scoreReportsRes.data ?? []) as ScoreReport[];
  const allPlannerColumnRows = (plannerColumnsRes.data ?? []) as PlannerColumn[];
  const plannerColumns = resolvePlannerColumns(allPlannerColumnRows, params.studentId).filter((c) => c.active);
  const plannerEntries = (plannerEntriesRes.data ?? []) as PlannerEntry[];
  const sessions = (slotsRes.data ?? []) as MentorSlot[];
  const notesBySlotId = new Map<string, SessionNote>((notesRes.data ?? []).map((n: any) => [n.slot_id, n]));
  const studyPlan = studyPlanRes.data as { content: string; updated_at: string } | null;
  const meetingLink = meetingLinkRes.data as { meeting_link: string; updated_at: string } | null;
  const studentNote = studentNoteRes.data as { note: string; updated_at: string } | null;
  const dailyNotes = (dailyNotesRes.data ?? []) as MentorDailyNote[];
  const planTasks = (planTasksRes.data ?? []) as PlanTask[];
  const plannerSettingsRow = plannerSettingsRes.data as
    | { start_date: string | null; allow_self_assigned_tasks: boolean | null }
    | null;
  const plannerStartDate = plannerSettingsRow?.start_date ?? null;
  const allowSelfAssignedTasks = plannerSettingsRow?.allow_self_assigned_tasks ?? false;
  const uworldBlocks = (blocksRes.data ?? []) as UWorldBlock[];
  const studyResources = (resourcesRes.data ?? []) as StudyResource[];
  const topicChecklistRows = (topicChecklistRes.data ?? []) as TopicChecklistRow[];

  const regularReports = scoreReports.filter((r) => r.exam_type !== "question_level");
  const comparisonReports = [...regularReports].sort((a, b) => (a.taken_date ?? "").localeCompare(b.taken_date ?? ""));
  const allSystemStrengths = computeSystemStrengths(regularReports);
  const allDisciplineStrengths = computeDisciplineStrengths(regularReports);

  const qbankBreakdown = computeQBankSystemBreakdown(uworldBlocks);

  const graphReports = regularReports as unknown as GraphReport[];
  const graphBlocks = uworldBlocks as unknown as GraphBlock[];

  // --- Tab contents -------------------------------------------------------

  const overviewContent = (
    <div className="space-y-8">
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

      {canEdit && (
        <StudentTopicChecklist
          studentId={params.studentId}
          mentorId={myMentorRecord!.id}
          initialRows={topicChecklistRows}
        />
      )}

      {canEdit && (
        <StudentNotesEditor
          studentId={params.studentId}
          mentorId={myMentorRecord!.id}
          currentUserId={user.id}
          initialNote={studentNote?.note ?? null}
          initialUpdatedAt={studentNote?.updated_at ?? null}
        />
      )}

      {canEdit && (
        <MeetingLinkEditor
          studentId={params.studentId}
          mentorId={myMentorRecord!.id}
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
      {isAdmin && !canEdit && (
        <div className="card text-sm space-y-1">
          {adminPlannerEdit ? (
            <p className="text-slate-300">
              You&apos;re editing this planner as admin.
              {student.mentor_email ? " Tasks are filed under the student's mentor." : " This student has no mentor, so tasks are filed under Admin."}
            </p>
          ) : (
            <p className="text-amber-400">
              This student has no mentor linked yet, so the planner is read-only here. Link a mentor first
              (Admin &rarr; Students), then reopen this page.
            </p>
          )}
          <p>
            <Link href="/admin/planner-import" className="text-brand-400 hover:text-brand-300 font-semibold">
              Import a whole plan from Excel &rarr;
            </Link>
          </p>
        </div>
      )}

      {plannerCanEdit && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold mb-3">Planner schedule</h2>
          <PlannerStartDateControl studentId={params.studentId} initialStartDate={plannerStartDate} />
          <SelfAssignedTasksToggle studentId={params.studentId} initialAllowed={allowSelfAssignedTasks} />
        </div>
      )}

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
          canEdit={plannerCanEdit}
          mentorId={plannerMentorId}
          startDate={plannerStartDate}
          todayIso={easternDateStringNow()}
        />
      </div>
    </div>
  );

  const analysisContent = (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold mb-3">Progress graphs</h2>
        <StudentProgressGraphs reports={graphReports} blocks={graphBlocks} />
      </div>

      <div>
        {scoreReports.length === 0 && <p className="text-sm text-slate-500">No score reports uploaded yet.</p>}

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

      <div>
        <h2 className="text-lg font-bold mb-3">Question bank performance</h2>
        <QBankSystemBreakdown cells={qbankBreakdown} />
      </div>

      {canEdit && (
        <div>
          <h2 className="text-lg font-bold mb-3">Study plan</h2>
          <StudyPlanEditor
            studentId={params.studentId}
            mentorId={myMentorRecord!.id}
            currentUserId={user.id}
            initialContent={studyPlan?.content ?? null}
            initialUpdatedAt={studyPlan?.updated_at ?? null}
          />
        </div>
      )}

      {scoreReports.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-3">Score reports</h2>
          <div className="space-y-2">
            {scoreReports.map((r) => (
              <MentorScoreReportRow key={r.id} report={r} canReview={canEdit} canEdit={isAdmin} />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const messagesContent = canEdit ? (
    <MentorChatPanel
      mentorId={myMentorRecord!.id}
      studentId={params.studentId}
      otherPartyLabel={student.full_name || "this student"}
    />
  ) : null;

  const tabs: StudentTabDef[] = [
    { id: "overview", label: "Overview", content: overviewContent },
    ...(canEdit ? [{ id: "sessions", label: "Sessions", content: sessionsContent }] : []),
    { id: "planner", label: "Study Planner", content: studyPlannerContent },
    { id: "analysis", label: "Analysis", content: analysisContent },
    ...(canEdit ? [{ id: "messages", label: "Messages", content: messagesContent }] : []),
  ];

  const backHref = isPureViewer
    ? "/viewer"
    : isAdmin && !canEdit
    ? "/admin"
    : myMentorRecord && !canEdit
    ? "/mentorship/viewing"
    : "/mentorship/students";

  const mainContent = (
    <main className="flex-1 px-6 py-8 w-full">
      <Link href={backHref} className="text-xs text-brand-400 hover:text-brand-300">
        ← Back to students
      </Link>
      <div className="flex items-center gap-3 mt-2 mb-1">
        {student.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={student.avatar_url}
            alt=""
            className="w-20 h-20 rounded-full object-cover border border-slate-700 shrink-0"
          />
        ) : (
          <span className="w-20 h-20 rounded-full bg-brand-900/50 text-brand-300 text-2xl font-bold flex items-center justify-center shrink-0">
            {(student.full_name || "?").trim().charAt(0).toUpperCase()}
          </span>
        )}
        <h1 className="text-xl font-bold">{student.full_name || "Student"}</h1>
      </div>
      <p className="text-sm text-slate-400 mb-6">
        {canEdit
          ? "Click a tab to switch sections, or click any day on the Study Planner calendar to add or edit Assignments, log UWorld blocks, and leave Mentor Notes. Score reports are still upload-only by the student."
          : adminPlannerEdit
          ? "Admin view - you can add and edit this student's study planner on the Study Planner tab. Everything else is read-only."
          : "Read-only view - only this student's mentor can edit their planner, and only they can upload score reports."}
      </p>

      <MentorStudentTabs tabs={tabs} defaultTab="overview" />
    </main>
  );

  if (isPureViewer) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="border-b border-slate-800 bg-white px-6 py-4 flex items-center justify-between shrink-0">
          <Link href="/viewer" className="flex items-center gap-2">
            <img src="/logo.png" alt="" className="w-7 h-7 rounded-md" />
            <span className="font-bold text-brand-300">
              Master Grid <span className="text-slate-500 font-normal">&middot; Viewer</span>
            </span>
          </Link>
          <form action="/auth/signout" method="post">
            <button className="text-sm font-medium text-slate-500 hover:text-slate-300">Sign out</button>
          </form>
        </header>
        <div className="flex-1 overflow-y-auto">{mainContent}</div>
      </div>
    );
  }

  return (
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
      {mainContent}
    </AppShell>
  );
}
