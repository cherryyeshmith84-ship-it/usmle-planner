import Link from "next/link";
import { requireAdmin } from "@/lib/adminGuard";
import type { ScheduleTemplate } from "@/lib/types";
import { getTemplateDays } from "@/lib/templateDays";
import AdminNav from "@/components/AdminNav";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  beginning: "Just starting",
  middle: "In the middle",
  end: "Final stretch",
};

export default async function TemplatesPage() {
  const { supabase } = await requireAdmin();

  const { data } = await supabase
    .from("schedule_templates")
    .select("*")
    .order("stage", { ascending: true })
    .order("name", { ascending: true });

  const templates = (data ?? []) as ScheduleTemplate[];

  return (
    <div className="min-h-screen flex">
      <AdminNav />
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">Schedule templates</h1>
          <Link href="/admin/templates/new" className="btn-primary">
            New template
          </Link>
        </div>

        {templates.length === 0 && (
          <p className="text-sm text-slate-400">
            No templates yet. Create one for each stage/situation, then assign it to students
            from the student list.
          </p>
        )}

        <div className="space-y-3">
          {templates.map((t) => {
            const days = getTemplateDays(t);
            const totalTasks = days.reduce((sum, d) => sum + d.tasks.length, 0);
            return (
              <Link
                key={t.id}
                href={`/admin/templates/${t.id}`}
                className="card block hover:border-brand-500 transition"
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold">{t.name}</h3>
                  <span className="text-xs font-semibold bg-slate-800 text-slate-300 rounded-full px-2 py-1">
                    {STAGE_LABEL[t.stage]}
                  </span>
                </div>
                <p className="text-sm text-slate-400">
                  {days.length} day{days.length === 1 ? "" : "s"} · {totalTasks} task
                  {totalTasks === 1 ? "" : "s"} total
                  {t.hour_goal ? ` · ${t.hour_goal}h/day` : ""}
                  {t.remote_friendly ? " · remote-friendly" : ""}
                  {t.resource_tags?.length ? ` · ${t.resource_tags.join(", ")}` : ""}
                </p>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
