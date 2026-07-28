import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { PlannerColumn, PlannerEntry } from "@/lib/plannerColumns";
import { getContentPublished } from "@/lib/platformSettings";
import AppShell from "@/components/AppShell";
import PlannerGridClient from "@/components/PlannerGridClient";

export const dynamic = "force-dynamic";

/**
 * Day-by-day tracking grid (Planned system, PP/CP FA, hours, questions,
 * notes, etc.) - matches the coach's spreadsheet layout. Columns are
 * admin-configurable from /admin/planner-config. This replaced the older
 * template-driven task checklist; that still exists for the Dashboard's
 * "today" view and the AI coach (app/planner/mine and schedule_templates),
 * which this page no longer touches.
 */
export default async function PlannerPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  const profile = profileData as Profile | null;
  if (!profile?.onboarding_completed) redirect("/onboarding");

  const contentPublished = profile?.is_admin ? true : await getContentPublished(supabase);

  const [columnsRes, entriesRes] = await Promise.all([
    supabase.from("planner_columns").select("*").order("sort_order", { ascending: true }),
    supabase.from("planner_entries").select("*").eq("user_id", user.id),
  ]);

  const columns = (columnsRes.data ?? []) as PlannerColumn[];
  const entries = (entriesRes.data ?? []) as PlannerEntry[];

  return (
    <AppShell isAdmin={profile?.is_admin} userName={profile?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 max-w-6xl mx-auto px-6 py-8 w-full">
        <div className="mb-6">
          <h1 className="text-xl font-bold mb-1">My Study Plan</h1>
          <p className="text-sm text-slate-400">
            Log your day-by-day progress here - First Aid pages, questions, hours, and notes. Click
            "Show earlier week" / "Show more weeks" to move the range, or jump straight to a date.
          </p>
        </div>

        <PlannerGridClient targetUserId={user.id} columns={columns} initialEntries={entries} />
      </main>
    </AppShell>
  );
}
