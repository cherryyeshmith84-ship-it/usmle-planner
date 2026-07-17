import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DailyLog } from "@/lib/types";
import AppShell from "@/components/AppShell";

export const dynamic = "force-dynamic";

function ratingColor(rating: number | null) {
  if (rating === null) return "bg-slate-800 text-slate-400";
  if (rating >= 8) return "bg-green-900/40 text-green-400";
  if (rating >= 5) return "bg-amber-900/40 text-amber-400";
  return "bg-red-900/40 text-red-400";
}

export default async function HistoryPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("daily_logs")
    .select("*")
    .eq("user_id", user.id)
    .order("log_date", { ascending: false })
    .limit(90);

  const logs = (data ?? []) as DailyLog[];

  const { data: profileData } = await supabase
    .from("profiles")
    .select("is_admin, full_name")
    .eq("id", user.id)
    .single();

  return (
    <AppShell isAdmin={profileData?.is_admin} userName={profileData?.full_name}>
      <main className="flex-1 max-w-3xl mx-auto px-6 py-8 w-full">
        <h1 className="text-xl font-bold mb-6">History</h1>

        {logs.length === 0 && (
          <p className="text-sm text-slate-400">
            No logged days yet - head to your dashboard and save today's
            progress to start building your history.
          </p>
        )}

        <div className="space-y-3">
          {logs.map((log) => {
            const done = log.tasks.filter((t) => t.status === "done").length;
            const total = log.tasks.length;
            return (
              <div key={log.id} className="card py-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold">{log.log_date}</span>
                  <div className="flex items-center gap-2">
                    {log.marked_complete && (
                      <span className="text-xs font-semibold bg-green-900/40 text-green-400 rounded-full px-2 py-1">
                        Completed
                      </span>
                    )}
                    <span
                      className={`text-xs font-semibold rounded-full px-2 py-1 ${ratingColor(
                        log.rating
                      )}`}
                    >
                      {log.rating !== null ? `${log.rating}/10` : "not rated"}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-slate-300">
                  {log.hours_studied ?? "?"}h studied &middot; {done}/{total} tasks done
                  {log.topics_skipped ? ` · skipped: ${log.topics_skipped}` : ""}
                </p>
                {log.block_scores?.length > 0 && (
                  <p className="text-sm text-slate-400 mt-1">
                    {log.block_scores
                      .map((b) => `${b.resource} ${b.question_count}q, ${b.percent_correct}%`)
                      .join(" · ")}
                  </p>
                )}
                {log.notes && (
                  <p className="text-sm text-slate-400 mt-2 italic">&ldquo;{log.notes}&rdquo;</p>
                )}
                {log.ai_feedback?.plan && (
                  <p className="text-sm text-brand-300 mt-2">
                    <span className="font-semibold">AI plan: </span>
                    {log.ai_feedback.plan}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </AppShell>
  );
}
