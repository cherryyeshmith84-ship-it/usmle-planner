import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { Mentor, MentorSlot, SessionNote } from "@/lib/mentors";
import { findMentorByEmail, formatSlotDate, formatSlotTime, getSlotStatus } from "@/lib/mentors";
import { getContentPublished } from "@/lib/platformSettings";
import { computeDisciplineStrengths, computeSystemStrengths, type ScoreReport } from "@/lib/scoreReports";
import type { PlannerColumn, PlannerEntry } from "@/lib/plannerColumns";
import { readField, resolvePlannerColumns } from "@/lib/plannerColumns";
import type { MentorDailyNote } from "@/lib/mentorDailyNotes";
import { groupNotesByDate } from "@/lib/mentorDailyNotes";
import type { PlanTask } from "@/lib/planTasks";
import AppShell from "@/components/AppShell";
import StudyPlanEditor from "@/components/StudyPlanEditor";
import MentorScoreReportRow from "@/components/MentorScoreReportRow";
import MentorDailyNoteCell from "@/components/MentorDailyNoteCell";
import MentorAssignmentsSection from "@/components/MentorAssignmentsSection";
import AssignToPlanButton from "@/components/AssignToPlanButton";
import MentorPlannerColumnsEditor from "@/components/MentorPlannerColumnsEditor";
import PlannerStartDateControl from "@/components/PlannerStartDateControl";

export const dynamic = "force-dynamic";

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
 * Read-only "student progress" view a mentor can open for a specific
 * student. Deliberately built fresh instead of reusing PlannerGridClient /
 * PerformanceClient, since both of those are edit-capable and a mentor
 * should never be able to write a student's own planner rows or score
 * reports - only read them. RLS (is_mentor_of_student, see migration
 * mentor_read_student_progress) is what actually enforces that a mentor can
 * only load a student they have a real relationship with (a booked session
 * or a message thread) - this page's own not-a-mentor / no-relationship
 * checks below are just a friendlier 404 on top of that. The one deliberate
 * write exception is the "Mentor Note" column (mentor_daily_notes, Study
 * Planner v1 item 5) - a separate table the mentor can write and the
 * student can only read, kept apart from the student's own planner data.
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
    .select("id, full_name, email")
    .eq("id", params.studentId)
    .maybeSingle();
  // RLS on profiles only returns a row here if this mentor actually has a
  // relationship with this student (or the viewer is an admin) - no row
  // means either the student doesn't exist or there's no real relationship,
  // and either way a 404 is the right, non-leaky response.
  if (!studentData) notFound();
  const student = studentData as Pick<Profile, "id" | "full_name" | "email">;

  const [
    scoreReportsRes,
    plannerColumnsRes,
    plannerEntriesRes,
    slotsRes,
    notesRes,
    studyPlanRes,
    dailyNotesRes,
    planTasksRes,
    plannerSettingsRes,
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
    supabase
      .from("planner_entries")
      .select("*")
      .eq("user_id", params.studentId)
      .order("log_date", { ascending: false })
      .limit(14),
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
    supabase.from("mentor_daily_notes").select("*").eq("student_id", params.studentId),
    supabase.from("mentor_plan_tasks").select("*").eq("student_id", params.studentId),
    supabase.from("student_planner_settings").select("start_date").eq("student_id", params.studentId).maybeSingle(),
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
  // Mentor Notes (Study Planner v1 item 5) - a separate, mentor-writable
  // per-day note shown alongside the read-only planner grid below. Only
  // meaningful when the viewer actually is this student's mentor (RLS also
  // enforces this - an admin browsing here sees existing notes but has no
  // relationship id to write new ones under, so the cell just renders
  // read-only text via the fallback below).
  const dailyNotesByDate = groupNotesByDate((dailyNotesRes.data ?? []) as MentorDailyNote[]);
  const planTasks = (planTasksRes.data ?? []) as PlanTask[];
  const plannerStartDate = (plannerSettingsRes.data as { start_date: string } | null)?.start_date ?? null;

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

  return (
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8 w-full">
        <Link href="/mentorship/sessions" className="text-xs text-brand-400 hover:text-brand-300">
          ← Back to sessions
        </Link>
        <h1 className="text-xl font-bold mt-2 mb-1">{student.full_name || "Student"}</h1>
        <p className="text-sm text-slate-400 mb-6">
          Read-only view - you can see this student&apos;s progress, but only they can edit their planner
          or upload score reports.
        </p>

        {/* Analysis */}
        <div className="mb-8">
          <h2 className="text-lg font-bold mb-3">Analysis</h2>
          {scoreReports.length === 0 ? (
            <p className="text-sm text-slate-500">No score reports uploaded yet.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="card">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Weakest systems
                </p>
                <div className="space-y-1.5">
                  {systemStrengths.map((s) => (
                    <div key={s.system} className="flex items-center justify-between text-sm gap-2">
                      <span>{s.system}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-slate-400">
                          {s.averagePercent}%{" "}
                          <span className={TREND_STYLE[s.trend]}>{TREND_LABEL[s.trend]}</span>
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
                      <div key={s.system} className="flex items-center justify-between text-sm gap-2">
                        <span>{s.system}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-slate-400">
                            {s.averagePercent}%{" "}
                            <span className={TREND_STYLE[s.trend]}>{TREND_LABEL[s.trend]}</span>
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

          {/* Full comparison tables - every system/discipline across every
              regular report, not just the top-5 weakest above, so a mentor
              has the same depth of data the student sees on their own
              Analysis page when deciding what to put in the student's study
              plan below. */}
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
            here (see mentor_study_plans RLS); writing this overrides the
            default AI-generated study plan the student otherwise sees on
            their own Analysis page. */}
        {myMentorRecord && (
          <div className="mb-8">
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

        {/* Assignments - the day-by-day checklist (Study Planner v1 item 6)
            the student sees and checks off on their own planner. Separate
            from the free-text Study plan above: this is a per-day task
            list, not a paragraph. */}
        {myMentorRecord && (
          <div className="mb-8">
            <h2 className="text-lg font-bold mb-3">Assignments</h2>
            <MentorAssignmentsSection
              studentId={params.studentId}
              mentorId={myMentorRecord.id}
              initialTasks={planTasks}
            />
          </div>
        )}

        {/* Score reports */}
        {scoreReports.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-bold mb-3">Score reports</h2>
            <div className="space-y-2">
              {scoreReports.map((r) => (
                <MentorScoreReportRow key={r.id} report={r} canReview={!!myMentorRecord} />
              ))}
            </div>
          </div>
        )}

        {/* Planner schedule - where this student's plan starts. Once set,
            their planner grid stops resetting to a window centered on
            "today" every time it loads and instead starts here, growing
            forward from whatever's already been logged (see
            lib/plannerSettings.ts). */}
        {myMentorRecord && (
          <div className="mb-8">
            <h2 className="text-lg font-bold mb-3">Planner schedule</h2>
            <PlannerStartDateControl studentId={params.studentId} initialStartDate={plannerStartDate} />
          </div>
        )}

        {/* Planner layout - lets a mentor add/edit/delete this specific
            student's planner columns (e.g. drop "First Aid Pages" for a
            student not using First Aid, or add a custom one) without
            touching any other student's layout. */}
        {myMentorRecord && (
          <div className="mb-8">
            <h2 className="text-lg font-bold mb-3">Planner layout</h2>
            <MentorPlannerColumnsEditor
              studentId={params.studentId}
              defaultColumns={defaultPlannerColumns}
              initialOwnColumns={ownPlannerColumns}
            />
          </div>
        )}

        {/* Study planner - read-only except the Mentor Note column */}
        <div className="mb-8">
          <h2 className="text-lg font-bold mb-3">Study planner</h2>
          {plannerEntries.length === 0 || plannerColumns.length === 0 ? (
            <p className="text-sm text-slate-500">No planner entries yet.</p>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                    <th className="pr-4 py-1">Date</th>
                    {plannerColumns.map((c) => (
                      <th key={c.id} className="pr-4 py-1">
                        {c.label}
                      </th>
                    ))}
                    <th className="pr-4 py-1">Mentor Note</th>
                  </tr>
                </thead>
                <tbody>
                  {plannerEntries.map((e) => (
                    <tr key={e.id} className="border-t border-slate-800">
                      <td className="pr-4 py-1.5 text-slate-400">{e.log_date}</td>
                      {plannerColumns.map((c) => {
                        const value = readField(e, c);
                        return (
                          <td key={c.id} className="pr-4 py-1.5">
                            {c.field_type === "checkbox" ? (value ? "✓" : "") : String(value ?? "")}
                          </td>
                        );
                      })}
                      <td className="pr-4 py-1.5 align-top">
                        {myMentorRecord ? (
                          <MentorDailyNoteCell
                            studentId={params.studentId}
                            mentorId={myMentorRecord.id}
                            date={e.log_date}
                            initialContent={dailyNotesByDate[e.log_date]?.content ?? ""}
                            initialStatus={dailyNotesByDate[e.log_date]?.status ?? null}
                            initialReviewed={dailyNotesByDate[e.log_date]?.reviewed ?? false}
                            initialReviewedAt={dailyNotesByDate[e.log_date]?.reviewed_at ?? null}
                            initialNextCheckinDate={dailyNotesByDate[e.log_date]?.next_checkin_date ?? null}
                          />
                        ) : (
                          <span className="text-slate-300 whitespace-pre-wrap">
                            {dailyNotesByDate[e.log_date]?.content || <span className="text-slate-600">-</span>}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Previous sessions + notes (only meaningful for the signed-in mentor's own history) */}
        {myMentorRecord && (
          <div>
            <h2 className="text-lg font-bold mb-3">Previous sessions</h2>
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
        )}
      </main>
    </AppShell>
  );
}
