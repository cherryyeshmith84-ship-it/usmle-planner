import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeSystemStrengths } from "@/lib/scoreReports";
import type { ScoreReport } from "@/lib/scoreReports";

/**
 * Generates a short, specific coaching note from a student's score-report
 * history: which systems are persistently weak (not just weak on one exam),
 * which are trending down even if not the worst yet, and what to prioritize
 * given how much time might be left. Distinct from lib/aiPrompt.ts (daily
 * coach) and lib/examAiPrompt.ts (in-exam help) - this one only ever sees
 * score-report data, not daily logs or exam questions.
 *
 * IMPORTANT: GEMINI_API_KEY is one shared key for every student on the
 * platform, and Google's free tier has a small daily/per-minute quota
 * shared across ALL of them - not per student. Without caching, every
 * button click (or accidental double-click) from every student burns
 * that same shared quota, which is why this used to fail constantly with
 * "429 quota exceeded" the moment more than a couple of people used it.
 * ai_suggestion_cache stores the last suggestion per student along with
 * how many score reports it was generated from. We only call Gemini again
 * when: there's no cache yet, the student has added a new report since
 * the cache was written, or the student explicitly asks to refresh. This
 * doesn't remove the free-tier ceiling, but it means quota is spent on
 * real new data, not on repeat clicks/page loads.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { data: cache } = await supabase
    .from("ai_suggestion_cache")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  return NextResponse.json({ suggestion: cache?.suggestion ?? null, cached: true });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let force = false;
  try {
    const body = await req.json();
    force = !!body?.force;
  } catch {
    // No body / not JSON - treat as force=false (normal "give me a suggestion" call).
  }

  const { data } = await supabase
    .from("score_reports")
    .select("*")
    .eq("user_id", user.id)
    .order("taken_date", { ascending: true });
  const reports = (data ?? []) as ScoreReport[];

  if (reports.length === 0) {
    return NextResponse.json(
      { error: "Upload at least one score report first." },
      { status: 400 }
    );
  }

  // Reuse the cached suggestion when it was generated from the same number
  // of reports and the student didn't explicitly ask to refresh - this is
  // the check that keeps quota usage proportional to real new data instead
  // of clicks.
  const { data: cache } = await supabase
    .from("ai_suggestion_cache")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!force && cache && cache.report_count === reports.length) {
    return NextResponse.json({ suggestion: cache.suggestion, cached: true });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI is not configured yet. Add GEMINI_API_KEY in your deployment settings." },
      { status: 500 }
    );
  }

  const strengths = computeSystemStrengths(reports);
  const timeline = reports
    .map((r) => `${r.taken_date ?? "no date"} - ${r.exam_name} - overall ${r.overall_percent ?? r.overall_score ?? "?"}`)
    .join("\n");
  const systemLines = strengths
    .map(
      (s) =>
        `${s.system}: avg ${s.averagePercent}%, latest ${s.latestPercent}%, trend ${s.trend}, from ${s.reportCount} report(s)`
    )
    .join("\n");

  const prompt = `
You are a USMLE Step 1 study coach reviewing a student's practice-exam score history.

Score report timeline (oldest to newest):
${timeline}

Per-system performance (sorted weakest to strongest by recent average):
${systemLines}

Write a short, specific note (3-5 sentences, plain text, no markdown headers or
bullet points) that:
1. Names the 1-3 systems that are the real priority right now - weight both how
   low they are AND whether they're stuck/declining vs. already improving.
2. If a system used to be weak but is now trending up, acknowledge that instead
   of just repeating "still weak."
3. Gives one concrete, actionable suggestion (not generic "study more") for the
   top-priority system.
Keep it warm and direct - like a coach talking to the student, not a report.
`.trim();

  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6 },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `AI request failed: ${errText.slice(0, 300)}` },
        { status: 502 }
      );
    }

    const json = await res.json();
    const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const suggestion = text.trim() || "No suggestion generated.";

    // Best-effort cache write - if this fails for some reason, we still
    // return the suggestion we just paid quota for, we just won't reuse it
    // next time.
    await supabase.from("ai_suggestion_cache").upsert({
      user_id: user.id,
      suggestion,
      report_count: reports.length,
      generated_at: new Date().toISOString(),
    });

    return NextResponse.json({ suggestion, cached: false });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Unexpected error calling the AI." },
      { status: 500 }
    );
  }
}
