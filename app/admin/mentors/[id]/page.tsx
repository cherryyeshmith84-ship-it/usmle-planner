import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/adminGuard";
import type { Profile } from "@/lib/types";
import type { Mentor } from "@/lib/mentors";
import { averageRating, formatSlotDate, formatSlotTime } from "@/lib/mentors";
import AdminNav from "@/components/AdminNav";

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

function stars(rating: number) {
  return "★".repeat(rating) + "☆".repeat(Math.max(0, 5 - rating));
}

type SlotRow = {
  id: string;
  start_time: string;
  end_time: string;
  is_booked: boolean;
  booked_by: string | null;
  cancelled_at: string | null;
};

type FeedbackRow = {
  id: string;
  student_id: string;
  rating: number;
  helpful: boolean | null;
  comment: string | null;
  created_at: string | null;
};

/**
 * Full admin-only dashboard for a single mentor - everything an admin needs
 * to oversee a mentor's workload in one place: every student linked to
 * them, each one's plan/score progress, every upcoming session, and every
 * piece of student feedback they've received. Reached from Admin > Mentors
 * (each mentor row links here) - a read-only rollup, not an editor; actual
 * mentor edits (name/email/bio/photo, activate/deactivate) still happen
 * back on the Mentors list itself.
 */
export default async function AdminMentorDetailPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireAdmin();

  const { data: mentorData } = await supabase.from("mentors").select("*").eq("id", params.id).maybeSingle();
  if (!mentorData) notFound();
  const mentor = mentorData as Mentor;

  const [linkedStudentsRes, slotsRes, feedbackRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, email, exam_track, subject_name, prep_stage, exam_date, onboarding_completed, assigned_template_id, track_changed_pending"
      )
      .ilike("mentor_email", mentor.email)
      .order("full_name", { ascending: true }),
    supabase
      .from("mentor_slots")
      .select("id, start_time, end_time, is_booked, booked_by, cancelled_at")
      .eq("mentor_id", mentor.id)
      .order("start_time", { ascending: false }),
    supabase
      .from("mentor_session_feedback")
      .select("id, student_id, rating, helpful, comment, created_at")
      .eq("mentor_id", mentor.id)
      .order("created_at", { ascending: false }),
  ]);

  const students = (linkedStudentsRes.data ?? []) as Pick<Profile, "id" | "full_name" | "email" | "exam_track" | "subject_name" | "prep_stage" | "exam_date" | "onboarding_completed" | "assigned_template_id" | "track_changed_pending">[];
  const slots = (slotsRes.data ?? []) as SlotRow[];
  const feedback = (feedbackRes.data ?? []) as FeedbackRow[];

  // A student can book a session (or leave feedback) without ever linking
  // this mentor's email under Settings, so the names needed for the
  // sessions/feedback lists below aren't guaranteed to already be in
  // `students` - fetch whichever extra profiles are actually referenced.
  const knownIds = new Set(students.map((s) => s.id));
  const extraIds = Array.from(
    new Set(
      [...slots.map((s) => s.booked_by), ...feedback.map((f) => f.student_id)].filter(
        (id): id is string => !!id && !knownIds.has(id)
      )
    )
  );
  const extraProfilesRes = extraIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", extraIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
  const nameById = new Map<string, string>();
  for (const s of students) nameById.set(s.id, s.full_name || s.email || "Unnamed student");
  for (const p of (extraProfilesRes.data ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
    nameById.set(p.id, p.full_name || p.email || "Unnamed student");
  }

  // Score reports for the progress badges on the students list below -
  // fetched only for linked students, not the one-off session bookers.
  const scoreReportsRes = students.length
    ? await supabase
        .from("score_reports")
        .select("user_id, overall_percent, taken_date")
        .in(
          "user_id",
          students.map((s) => s.id)
        )
        .order("taken_date", { ascending: false })
    : { data: [] as { user_id: string; overall_percent: number | null; taken_date: string | null }[] };
  const latestScoreByStudent = new Map<string, number | null>();
  for (const r of (scoreReportsRes.data ?? []) as {
    user_id: string;
    overall_percent: number | null;
    taken_date: string | null;
  }[]) {
    if (!latestScoreByStudent.has(r.user_id)) latestScoreByStudent.set(r.user_id, r.overall_percent);
  }

  const nowIso = new Date().toISOString();
  const upcomingSessions = slots
    .filter((s) => s.is_booked && !s.cancelled_at && s.end_time > nowIso)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const completedSessions = slots.filter((s) => s.is_booked && !s.cancelled_at && s.end_time <= nowIso);
  const avgRating = averageRating(feedback);

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8">
        <Link href="/admin/mentors" className="text-xs text-brand-400 hover:text-brand-300">
          &larr; Back to mentors
        </Link>
        <div className="flex items-center justify-between gap-3 flex-wrap mt-2 mb-1">
          <h1 className="text-xl font-bold">{mentor.name}</h1>
          <span
            className={`text-xs font-semibold rounded-full px-2 py-1 ${
              mentor.active ? "bg-green-900/40 text-green-400" : "bg-slate-800 text-slate-400"
            }`}
          >
            {mentor.active ? "Active" : "Inactive"}
          </span>
        </div>
        <p className="text-sm text-slate-400 mb-1">{mentor.email}</p>
        {mentor.bio ? (
          <p className="text-sm text-slate-300 mb-6 max-w-xl">{mentor.bio}</p>
        ) : (
          <div className="mb-6" />
        )}

        {/* At-a-glance stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="card text-center">
            <p className="text-xl font-extrabold text-brand-400">{students.length}</p>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Students</p>
          </div>
          <div className="card text-center">
            <p className="text-xl font-extrabold text-brand-400">{upcomingSessions.length}</p>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Upcoming sessions</p>
          </div>
          <div className="card text-center">
            <p className="text-xl font-extrabold text-brand-400">{completedSessions.length}</p>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Completed sessions</p>
          </div>
          <div className="card text-center">
            <p className="text-xl font-extrabold text-brand-400">{avgRating !== null ? `${avgRating}★` : "-"}</p>
            <p className="text-xs text-slate-500 uppercase tracking-wide">
              {feedback.length} review{feedback.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        {/* Students */}
        <h2 className="text-lg font-bold mb-3">Students ({students.length})</h2>
        {students.length === 0 ? (
          <p className="text-sm text-slate-400 mb-8">
            No students have linked this mentor&apos;s email under their Settings yet.
          </p>
        ) : (
          <div className="space-y-3 mb-8">
            {students.map((s) => {
              const latestPct = latestScoreByStudent.get(s.id);
              return (
                <div key={s.id} className="card">
                  <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
                    <h3 className="font-semibold">{s.full_name || s.email || "Unnamed student"}</h3>
                    <Link href={`/admin/students/${s.id}`} className="text-xs text-brand-400 hover:text-brand-300">
                      View full profile &rarr;
                    </Link>
                  </div>
                  <p className="text-sm text-slate-400 mb-2">
                    {s.email}
                    {s.exam_date ? ` · exam ${s.exam_date}` : ""}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold bg-slate-800 text-slate-300 rounded-full px-2 py-1">
                      {s.exam_track === "subject"
                        ? `Subject${s.subject_name ? `: ${s.subject_name}` : ""}`
                        : s.prep_stage
                        ? STAGE_LABEL[s.prep_stage]
                        : "Step 1"}
                    </span>
                    {s.assigned_template_id ? (
                      <span className="text-xs font-semibold bg-green-900/40 text-green-400 rounded-full px-2 py-1">
                        Has a plan
                      </span>
                    ) : (
                      <span className="text-xs font-semibold bg-amber-900/40 text-amber-400 rounded-full px-2 py-1">
                        No plan yet
                      </span>
                    )}
                    {latestPct !== undefined && (
                      <span className={`text-xs font-semibold rounded-full px-2 py-1 ${scoreBadgeClass(latestPct)}`}>
                        Latest score: {latestPct !== null ? `${latestPct}%` : "logged"}
                      </span>
                    )}
                    {s.track_changed_pending && (
                      <span className="text-xs font-semibold bg-amber-900/40 text-amber-400 rounded-full px-2 py-1">
                        Track changed
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Upcoming sessions */}
        <h2 className="text-lg font-bold mb-3">Upcoming sessions ({upcomingSessions.length})</h2>
        {upcomingSessions.length === 0 ? (
          <p className="text-sm text-slate-400 mb-8">No upcoming sessions booked.</p>
        ) : (
          <div className="space-y-2 mb-8">
            {upcomingSessions.map((slot) => (
              <div key={slot.id} className="card py-3 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm">
                  {nameById.get(slot.booked_by ?? "") ?? "Unknown student"} &middot;{" "}
                  {formatSlotDate(slot.start_time)}, {formatSlotTime(slot.start_time)}&ndash;
                  {formatSlotTime(slot.end_time)}
                </p>
                {slot.booked_by && (
                  <Link href={`/admin/students/${slot.booked_by}`} className="text-xs text-brand-400 hover:text-brand-300">
                    View student &rarr;
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Feedback */}
        <h2 className="text-lg font-bold mb-3">Student feedback ({feedback.length})</h2>
        {feedback.length === 0 ? (
          <p className="text-sm text-slate-400">No feedback left yet.</p>
        ) : (
          <div className="space-y-3">
            {feedback.map((f) => (
              <div key={f.id} className="card">
                <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
                  <p className="text-sm font-semibold">{nameById.get(f.student_id) ?? "Unknown student"}</p>
                  <span className="text-amber-400 text-sm">{stars(f.rating)}</span>
                </div>
                <p className="text-xs text-slate-500 mb-2">
                  {f.created_at ? f.created_at.slice(0, 10) : ""}
                  {f.helpful !== null ? ` · ${f.helpful ? "Found it helpful" : "Not helpful"}` : ""}
                </p>
                {f.comment && <p className="text-sm text-slate-300">{f.comment}</p>}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
