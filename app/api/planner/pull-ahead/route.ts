import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * Study Planner v2, phase 4 - "suggest moving ahead when tasks are finished
 * early." Called from AdaptiveInsights.tsx's "Pull tomorrow's tasks into
 * today" button, only ever offered once a student is comfortably ahead of
 * schedule (see computeMoveAheadSuggestion in lib/adaptivePlanner.ts).
 *
 * Same trust model as reschedule-missed: students have no direct UPDATE on
 * mentor_plan_tasks, so this goes through the service-role client, scoped
 * strictly to the caller's own incomplete rows on the exact sourceDate they
 * sent - it never touches another student's data or a mentor's plan
 * content, only task_date on the caller's own future tasks.
 */
export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { sourceDate?: string; todayIso?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { sourceDate, todayIso } = body;
  if (!sourceDate || !todayIso) {
    return NextResponse.json({ error: "Missing sourceDate/todayIso." }, { status: 400 });
  }
  if (sourceDate <= todayIso) {
    return NextResponse.json({ error: "sourceDate must be in the future." }, { status: 400 });
  }

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return NextResponse.json({ error: "Service role not configured." }, { status: 500 });
  }
  const serviceClient = createServiceClient(serviceUrl, serviceKey);

  const { data: futureTasks, error: fetchError } = await serviceClient
    .from("mentor_plan_tasks")
    .select("id")
    .eq("student_id", user.id)
    .eq("task_date", sourceDate);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  const ids = (futureTasks ?? []).map((t) => t.id as string);
  if (ids.length === 0) {
    return NextResponse.json({ pulled: 0 });
  }

  const { error: updateError } = await serviceClient
    .from("mentor_plan_tasks")
    .update({ task_date: todayIso })
    .in("id", ids);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ pulled: ids.length });
}
