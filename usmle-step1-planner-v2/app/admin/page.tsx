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

  const students = (profilesData ?? []) as Profile[];

  const { data: templatesData } = await supabase.from("schedule_templates").select("id, name");
  const templateMap = new Map((templatesData ?? []).map((t: any) => [t.id, t.name]));

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-6">Students ({students.length})</h1>

        {students.length === 0 && (
          <p className="text-sm text-slate-400">
            No students have signed up yet. Once they do, they&apos;ll show up here.
          </p>
        )}

        <div className="space-y-3">
          {students.map((s) => (
            <Link
              key={s.id}
              href={`/admin/students/${s.id}`}
              className="card block hover:border-brand-500 transition"
            >
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold">{s.full_name || s.email || "Unnamed student"}</h3>
                {s.prep_stage && (
                  <span className="text-xs font-semibold bg-slate-800 text-slate-300 rounded-full px-2 py-1">
                    {STAGE_LABEL[s.prep_stage]}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-400">
                {s.email}
                {s.exam_date ? ` · exam ${s.exam_date}` : ""}
                {s.daily_hour_goal ? ` · goal ${s.daily_hour_goal}h/day` : ""}
              </p>
              <p className="text-sm text-brand-300 mt-1">
                {s.assigned_template_id
                  ? `Assigned: ${templateMap.get(s.assigned_template_id) ?? "template"}`
                  : "No template assigned - using default plan for their stage"}
              </p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
