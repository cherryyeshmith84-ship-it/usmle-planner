import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ScoreReport } from "@/lib/scoreReports";
import { getContentPublished } from "@/lib/platformSettings";
import AppShell from "@/components/AppShell";
import PerformanceClient from "@/components/PerformanceClient";

export const dynamic = "force-dynamic";

/**
 * Performance page - now built entirely from uploaded score reports
 * (NBME/UWSA/Free120/UWorld self-assessments) instead of the old plain
 * daily-log list: weak/strong systems, progress-over-time comparison, and
 * AI suggestions. See components/PerformanceClient.tsx and
 * lib/scoreReports.ts.
 */
export default async function HistoryPage() {
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

  const contentPublished = profileData?.is_admin ? true : await getContentPublished(supabase);

  const { data } = await supabase
    .from("score_reports")
    .select("*")
    .eq("user_id", user.id)
    .order("taken_date", { ascending: false });
  const reports = (data ?? []) as ScoreReport[];

  return (
    <AppShell isAdmin={profileData?.is_admin} userName={profileData?.full_name} contentPublished={contentPublished}>
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8 w-full">
        <h1 className="text-xl font-bold mb-1">Performance</h1>
        <p className="text-sm text-slate-400 mb-6">
          Upload your NBME, UWSA, Free 120, and UWorld self-assessment results to track your weak and
          strong systems over time.
        </p>
        <PerformanceClient userId={user.id} initialReports={reports} />
      </main>
    </AppShell>
  );
}
