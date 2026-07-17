"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { templateTasksToStudyTasks, type RoadmapEntry } from "@/lib/templateDays";
import type { ActivePlanSource, StudyTask, TaskStatus } from "@/lib/types";

const DAYS_PER_WEEK = 7;
type Tab = "today" | "week" | "full";

function dayStatus(
  dayTasks: StudyTask[],
  date: string,
  today: string
): { label: string; className: string } {
  const totalCount = dayTasks.length;
  const doneCount = dayTasks.filter((t) => t.status === "done").length;

  if (date === today) return { label: "Today", className: "bg-brand-900/40 text-brand-300" };
  if (date > today) return { label: "Upcoming", className: "bg-slate-800 text-slate-400" };
  if (totalCount > 0 && doneCount >= totalCount) {
    return { label: "Completed", className: "bg-green-900/40 text-green-400" };
  }
  if (doneCount > 0) return { label: "Partially done", className: "bg-amber-900/40 text-amber-400" };
  return { label: "Missed", className: "bg-red-900/40 text-red-400" };
}

export default function PlannerClient({
  userId,
  entries,
  today,
  activeSource,
  hasCoachPlan,
  hasOwnPlan,
}: {
  userId: string;
  entries: RoadmapEntry[];
  today: string;
  activeSource: ActivePlanSource;
  hasCoachPlan: boolean;
  hasOwnPlan: boolean;
}) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const [tab, setTab] = useState<Tab>("today");
  const [dayTasks, setDayTasks] = useState<Record<string, StudyTask[]>>(() => {
    const map: Record<string, StudyTask[]> = {};
    for (const e of entries) {
      map[e.date] = e.log?.tasks?.length ? e.log.tasks : templateTasksToStudyTasks(e.tasks);
    }
    return map;
  });

  // Chunk the whole plan into 7-day "weeks" in day order (Day 1-7, 8-14, ...)
  // - this is what the Full Plan tab pages through, and what This Week jumps
  // straight to.
  const weeks = useMemo(() => {
    const chunks: RoadmapEntry[][] = [];
    for (let i = 0; i < entries.length; i += DAYS_PER_WEEK) {
      chunks.push(entries.slice(i, i + DAYS_PER_WEEK));
    }
    return chunks;
  }, [entries]);

  const currentWeekIndex = useMemo(() => {
    if (entries.length === 0) return 0;
    const exactIdx = entries.findIndex((e) => e.date === today);
    if (exactIdx !== -1) return Math.floor(exactIdx / DAYS_PER_WEEK);
    const futureIdx = entries.findIndex((e) => e.date > today);
    if (futureIdx === -1) return Math.max(0, weeks.length - 1); // plan finished - land on last week
    return Math.floor(futureIdx / DAYS_PER_WEEK); // plan not started yet - land on first week
  }, [entries, today, weeks.length]);

  const [fullPlanWeek, setFullPlanWeek] = useState(currentWeekIndex);
  const clampedFullPlanWeek = Math.min(fullPlanWeek, Math.max(0, weeks.length - 1));

  const todayEntry = entries.find((e) => e.date === today) ?? null;
  const thisWeekEntries = weeks[currentWeekIndex] ?? [];

  const thisWeekProgress = useMemo(() => {
    let done = 0;
    let total = 0;
    for (const e of thisWeekEntries) {
      const tasks = dayTasks[e.date] ?? [];
      total += tasks.length;
      done += tasks.filter((t) => t.status === "done").length;
    }
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { done, total, pct };
  }, [thisWeekEntries, dayTasks]);

  async function switchSource(source: ActivePlanSource) {
    if (source === activeSource || switching) return;
    setSwitching(true);
    const supabase = createClient();
    await supabase.from("profiles").update({ active_plan_source: source }).eq("id", userId);
    setSwitching(false);
    router.refresh();
  }

  async function saveDay(date: string, tasks: StudyTask[]) {
    const supabase = createClient();
    await supabase.from("daily_logs").upsert(
      { user_id: userId, log_date: date, tasks },
      { onConflict: "user_id,log_date" }
    );
  }

  function toggleDone(date: string, taskId: string) {
    setDayTasks((prev) => {
      const updated: StudyTask[] = (prev[date] ?? []).map((t) => {
        if (t.id !== taskId) return t;
        const status: TaskStatus = t.status === "done" ? "pending" : "done";
        return { ...t, status };
      });
      saveDay(date, updated);
      return { ...prev, [date]: updated };
    });
  }

  function toggleSkip(date: string, taskId: string) {
    setDayTasks((prev) => {
      const updated: StudyTask[] = (prev[date] ?? []).map((t) => {
        if (t.id !== taskId) return t;
        const status: TaskStatus = t.status === "skipped" ? "pending" : "skipped";
        return { ...t, status };
      });
      saveDay(date, updated);
      return { ...prev, [date]: updated };
    });
  }

  function renderDayCard(entry: RoadmapEntry) {
    const tasks = dayTasks[entry.date] ?? [];
    const doneCount = tasks.filter((t) => t.status === "done").length;
    const status = dayStatus(tasks, entry.date, today);
    const editable = entry.date <= today;

    return (
      <div
        key={entry.dayNumber}
        className={`card ${status.label === "Today" ? "border-brand-500" : ""}`}
      >
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h3 className="font-semibold">
            Day {entry.dayNumber}{" "}
            <span className="text-slate-500 font-normal text-sm">· {entry.date}</span>
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">
              {doneCount}/{tasks.length} done
            </span>
            <span className={`text-xs font-semibold rounded-full px-2 py-1 ${status.className}`}>
              {status.label}
            </span>
          </div>
        </div>

        <ul className="space-y-2">
          {tasks.map((t) => (
            <li
              key={t.id}
              className={`flex items-center gap-3 border rounded-xl px-3 py-2 transition ${
                t.status === "done"
                  ? "border-green-900 bg-green-900/10"
                  : t.status === "skipped"
                  ? "border-amber-900 bg-amber-900/10"
                  : "border-slate-700"
              }`}
            >
              <button
                type="button"
                onClick={() => editable && toggleDone(entry.date, t.id)}
                disabled={!editable}
                aria-label={t.status === "done" ? "Mark not done" : "Mark done"}
                className={`shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition ${
                  t.status === "done"
                    ? "bg-green-500 border-green-500"
                    : editable
                    ? "border-slate-500 hover:border-green-500"
                    : "border-slate-700 cursor-not-allowed"
                }`}
              >
                {t.status === "done" && (
                  <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
                    <path
                      d="M4 10.5L8 14.5L16 5.5"
                      stroke="black"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium truncate ${
                    t.status === "done" ? "line-through text-green-400" : ""
                  }`}
                >
                  {t.title}
                </p>
                <p className="text-xs text-slate-400">
                  {t.resource}
                  {t.target ? ` · ${t.target}` : ""}
                </p>
              </div>
              {editable && (
                <button
                  type="button"
                  onClick={() => toggleSkip(entry.date, t.id)}
                  className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full transition ${
                    t.status === "skipped"
                      ? "bg-amber-900/40 text-amber-400"
                      : "text-slate-500 hover:text-amber-400"
                  }`}
                >
                  Skip
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => switchSource("coach")}
              className={`text-sm font-semibold px-3 py-2 rounded-lg border transition ${
                activeSource === "coach"
                  ? "border-brand-400 bg-brand-900/40 text-brand-300"
                  : "border-slate-700 text-slate-300 hover:border-slate-600"
              }`}
            >
              Coach Plan
            </button>
            {/* Only show the Custom Plan tab once one actually exists - never a
                disabled-looking "(not built yet)" option. Building one is its
                own clear call to action on the right instead. */}
            {hasOwnPlan && (
              <button
                type="button"
                onClick={() => switchSource("own")}
                className={`text-sm font-semibold px-3 py-2 rounded-lg border transition ${
                  activeSource === "own"
                    ? "border-brand-400 bg-brand-900/40 text-brand-300"
                    : "border-slate-700 text-slate-300 hover:border-slate-600"
                }`}
              >
                Custom Plan
              </button>
            )}
          </div>
          <Link href="/planner/mine" className="btn-secondary text-sm">
            {hasOwnPlan ? "Edit my custom plan" : "Build a custom plan"}
          </Link>
        </div>
        {activeSource === "coach" && !hasCoachPlan && (
          <p className="text-sm text-slate-400 mt-3">Your coach hasn&apos;t assigned a plan yet.</p>
        )}
      </div>

      {entries.length > 0 && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-1.5">
              {(["today", "week", "full"] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`text-sm font-semibold px-3 py-1.5 rounded-lg transition ${
                    tab === t
                      ? "bg-brand-900/40 text-brand-300"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {t === "today" ? "Today" : t === "week" ? "This Week" : "Full Plan"}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              This week&apos;s progress: {thisWeekProgress.done}/{thisWeekProgress.total} tasks ·{" "}
              {thisWeekProgress.pct}%
            </p>
          </div>

          <p className="text-xs text-slate-500">
            You can mark any past day&apos;s tasks too - if you forget to check in, just come
            back and mark yesterday (or any earlier day) whenever you catch up.
          </p>
        </>
      )}

      {tab === "today" &&
        (todayEntry ? (
          renderDayCard(todayEntry)
        ) : (
          <div className="card">
            <p className="text-sm text-slate-400">
              Nothing scheduled for today in this plan.{" "}
              <button
                type="button"
                onClick={() => setTab("full")}
                className="text-brand-400 hover:text-brand-300 font-medium"
              >
                View the full plan
              </button>
              .
            </p>
          </div>
        ))}

      {tab === "week" && (
        <div className="space-y-4">
          {thisWeekEntries.length === 0 ? (
            <div className="card">
              <p className="text-sm text-slate-400">No days in this plan yet.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                Week {currentWeekIndex + 1} of {weeks.length}
              </p>
              {thisWeekEntries.map(renderDayCard)}
            </>
          )}
        </div>
      )}

      {tab === "full" && (
        <div className="space-y-4">
          {weeks.length === 0 ? (
            <div className="card">
              <p className="text-sm text-slate-400">This plan doesn&apos;t have any days yet.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setFullPlanWeek((w) => Math.max(0, w - 1))}
                  disabled={clampedFullPlanWeek === 0}
                  className="text-sm font-medium text-brand-400 hover:text-brand-300 disabled:text-slate-700 disabled:cursor-not-allowed"
                >
                  &larr; Previous week
                </button>
                <p className="text-sm text-slate-400">
                  Week {clampedFullPlanWeek + 1} of {weeks.length}
                </p>
                <button
                  type="button"
                  onClick={() => setFullPlanWeek((w) => Math.min(weeks.length - 1, w + 1))}
                  disabled={clampedFullPlanWeek >= weeks.length - 1}
                  className="text-sm font-medium text-brand-400 hover:text-brand-300 disabled:text-slate-700 disabled:cursor-not-allowed"
                >
                  Next week &rarr;
                </button>
              </div>
              {weeks[clampedFullPlanWeek]?.map(renderDayCard)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
