import Link from "next/link";
import { requireAdmin } from "@/lib/adminGuard";
import type { Profile, ScheduleTemplate } from "@/lib/types";
import AdminNav from "@/components/AdminNav";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  beginning: "Just starting",
  middle: "In the middle",
  end: "Final stretch",
};

export default async function AdminHome() {
  const { supabase, user } = await requireAdmin();

  const { data: profilesData } = await supabase
    .from("profiles")
    .select("*")
    .neq("id", user.id)
    .order("created_at", { ascending: false });

  const allStudents = (profilesData ?? []) as Profile[];
  // Students who need attention first: no plan yet, or just switched tracks
  // and their existing plan may no longer fit - surface these at the top.
  const needsAttentionCheck = (s: Profile) =>
    (s.onboarding_completed && !s.assigned_template_id) || !!s.track_changed_pending;
  const needsPlan = allStudents.filter(needsAttentionCheck);
  const rest = allStudents.filter((s) => !needsAttentionCheck(s));
  const students = [...needsPlan, ...rest];

  const { data: templatesData } = await supabase.from("schedule_templates").select("id, name");
  const templateMap = new Map((templatesData ?? []).map((t: any) => [t.id, t.name]));

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8">
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
              <Link
                key={s.id}
                href={`/admin/students/${s.id}`}
                className={`card block transition ${
                  needsAttention
                    ? "border-amber-700 hover:border-amber-500"
                    : "hover:border-brand-500"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
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
                  </div>
                </div>
                <p className="text-sm text-slate-400">
                  {s.email}
                  {s.exam_date ? ` · exam ${s.exam_date}` : ""}
                  {s.daily_hour_goal ? ` · goal ${s.daily_hour_goal}h/day` : ""}
                </p>
                <p className="text-sm text-brand-300 mt-1">
                  {s.assigned_template_id
                    ? `Assigned: ${templateMap.get(s.assigned_template_id) ?? "template"}`
                    : s.onboarding_completed
                    ? "No template assigned yet"
                    : "Hasn't finished onboarding yet"}
                </p>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
