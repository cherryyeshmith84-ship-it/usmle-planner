import { requireAdmin } from "@/lib/adminGuard";
import type { PlannerColumn, StudyResource } from "@/lib/plannerColumns";
import AdminNav from "@/components/AdminNav";
import PlannerConfigClient from "@/components/PlannerConfigClient";

export const dynamic = "force-dynamic";

export default async function PlannerConfigPage() {
  const { supabase } = await requireAdmin();

  const [columnsRes, resourcesRes] = await Promise.all([
    // Global defaults only (student_id is null) - a mentor's per-student
    // customizations (see MentorPlannerColumnsEditor) live in this same
    // table but are managed from that student's own page, not here. Without
    // this filter an admin (who can see every row via RLS) would see every
    // student's customized columns mixed into the shared default list.
    supabase.from("planner_columns").select("*").is("student_id", null).order("sort_order", { ascending: true }),
    supabase.from("study_resources").select("*").order("sort_order", { ascending: true }),
  ]);

  const columns = (columnsRes.data ?? []) as PlannerColumn[];
  const resources = (resourcesRes.data ?? []) as StudyResource[];

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-1">Planner settings</h1>
        <p className="text-sm text-slate-400 mb-6">
          Customize what shows up on every student's Study Planner grid.
        </p>
        <PlannerConfigClient initialColumns={columns} initialResources={resources} />
      </main>
    </div>
  );
}
