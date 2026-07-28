import { requireAdmin } from "@/lib/adminGuard";
import type { PlannerColumn, StudyResource } from "@/lib/plannerColumns";
import AdminNav from "@/components/AdminNav";
import PlannerConfigClient from "@/components/PlannerConfigClient";

export const dynamic = "force-dynamic";

export default async function PlannerConfigPage() {
  const { supabase } = await requireAdmin();

  const [columnsRes, resourcesRes] = await Promise.all([
    supabase.from("planner_columns").select("*").order("sort_order", { ascending: true }),
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
