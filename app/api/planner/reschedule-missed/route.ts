import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * Study Planner v2's "missed day" prompt (MissedDayPrompt.tsx) - handles the
 * two options that actually change data ("Move to today" / "Spread across
 * next few days"). The third option, "Keep original schedule," is a pure
 * client-side dismiss and never calls this route.
 *
 * A student has no direct UPDATE policy on mentor_plan_tasks (confirmed via
 * pg_policies - they only get SELECT; mentors/admins get ALL via
 * is_mentor_of_student/is_admin), so this goes through the service-role
 * client, same pattern as /api/notifications/booking. The row set this can
 * touch is locked down hard: only rows where student_id = the caller's own
 * id, task_date = the exact missedDate the client sent, and completed =
 * false - a student can only move their own unfinished work, never touch a
 * mentor's plan content (title/category/etc. are never modified, only
 * task_date).
 */
export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { mode?: "today" | "spread"; missedDate?: string; todayIso?: string; spreadDays?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { mode, missedDate, todayIso } = body;
  const spreadDays = Math.min(Math.max(body.spreadDays ?? 3, 1), 7);

  if (!mode || !missedDate || !todayIso) {
    return NextResponse.json({ error: "Missing mode/missedDate/todayIso." }, { status: 400 });
  }
  if (mode !== "today" && mode !== "spread") {
    return NextResponse.json({ error: "Invalid mode." }, { status: 400 });
  }
  if (missedDate >= todayIso) {
    return NextResponse.json({ error: "missedDate must be before todayIso." }, { status: 400 });
  }

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return NextResponse.json({ error: "Service role not configured." }, { status: 500 });
  }
  const serviceClient = createServiceClient(serviceUrl, serviceKey);

  // Only this student's own unfinished tasks from that exact missed day -
  // never trust anything about which rows to touch from the request body
  // beyond the date to filter on.
  const { data: missedTasks, error: fetchError } = await serviceClient
    .from("mentor_plan_tasks")
    .select("id")
    .eq("student_id", user.id)
    .eq("task_date", missedDate)
    .eq("completed", false);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  const ids = (missedTasks ?? []).map((t) => t.id as string);
  if (ids.length === 0) {
    return NextResponse.json({ rescheduled: 0 });
  }

  if (mode === "today") {
    const { error: updateError } = await serviceClient
      .from("mentor_plan_tasks")
      .update({ task_date: todayIso })
      .in("id", ids);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    return NextResponse.json({ rescheduled: ids.length, mode, newDates: [todayIso] });
  }

  // "spread" - round-robin the missed tasks across the next `spreadDays`
  // days starting today, so a student who missed 6 tasks isn't just handed
  // a 6-item pile-up on top of today's already-planned work.
  const [y, m, d] = todayIso.split("-").map(Number);
  const targetDates = Array.from({ length: spreadDays }, (_, i) =>
    new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10)
  );

  let updatedCount = 0;
  for (let i = 0; i < ids.length; i++) {
    const targetDate = targetDates[i % targetDates.length];
    const { error: updateError } = await serviceClient
      .from("mentor_plan_tasks")
      .update({ task_date: targetDate })
      .eq("id", ids[i]);
    if (updateError) {
      return NextResponse.json({ error: updateError.message, rescheduled: updatedCount }, { status: 500 });
    }
    updatedCount++;
  }

  return NextResponse.json({ rescheduled: updatedCount, mode, newDates: targetDates });
}
