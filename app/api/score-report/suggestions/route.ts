import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeSystemStrengths } from "@/lib/scoreReports";
import type { AiExamReview, ScoreReport } from "@/lib/scoreReports";

/** Gemini is asked for raw JSON but sometimes wraps it in a ```json fence
 *  anyway despite the instruction not to - this strips that before parsing
 *  so a well-formed response doesn't get treated as a parse failure. */
function parseAiExamReview(text: string): AiExamReview | null {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "");
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed.bullets)) return null;
    return {
      bullets: parsed.bullets
        .filter((b: any) => typeof b?.text === "string")
        .map((b: any) => ({ text: b.text, positive: !!b.positive })),
      priorityAreas: Array.isArray(parsed.priorityAreas) ? parsed.priorityAreas.filter((p: any) => typeof p === "string") : [],
      estimatedHours: typeof parsed.estimatedHours === "string" ? parsed.estimatedHours : "",
    };
  } catch {
    return null;
  }
}

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
  // Older cache rows (before this became structured) hold a plain-prose
  // string that won't parse as JSON - treated the same as "no cache yet"
  // rather than an error, so the student just sees the "Get suggestions"
  // button instead of a broken render.
  const review = cache?.suggestion ? parseAiExamReview(cache.suggestion) : null;
  return NextResponse.json({ review, cached: true });
}

/**
 * Detects an already-completed REAL USMLE Step 1 result among the
 * student's uploads (as opposed to a practice self-assessment like an NBME/
 * UWSA/Free120/UWorld one) - identified by exam_name mentioning both "Step
 * 1" and something like "official"/"licensing" that a practice-exam name
 * never would. There's no dedicated exam_type for this (it's saved as
 * "other" via the manual/AI-parsed score report form, same as any
 * unrecognized report), so name-matching is the only signal available.
 * When this is present, the coaching note needs to stop giving "master
 * these weak systems" advice entirely - that was the actual bug reported:
 * the AI kept telling a student who'd already passed Step 1 to go work on
 * Cardio/Heme, because nothing ever told it the exam was already over.
 */
function findOfficialStep1Result(reports: ScoreReport[]): ScoreReport | null {
  const match = reports.find(
    (r) => /step\s*1/i.test(r.exam_name) && /(official|licensing|usmle exam)/i.test(r.exam_name)
  );
  return match ?? null;
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
    const cachedReview = parseAiExamReview(cache.suggestion);
    // A pre-structured cache row (plain prose from before this change) just
    // falls through to generating a fresh one below, instead of returning
    // something the UI can't render.
    if (cachedReview) {
      return NextResponse.json({ review: cachedReview, cached: true });
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI is not configured yet. Add GEMINI_API_KEY in your deployment settings." },
      { status: 500 }
    );
  }

  const strengths = computeSystemStrengths(reports);
  const overallValues = reports
    .map((r) => r.overall_percent ?? (typeof r.overall_score === "number" ? r.overall_score : null))
    .filter((v): v is number => typeof v === "number");
  const overallAverage =
    overallValues.length > 0 ? Math.round(overallValues.reduce((a, b) => a + b, 0) / overallValues.length) : null;

  const timeline = reports
    .map((r) => `${r.taken_date ?? "no date"} - ${r.exam_name} - overall ${r.overall_percent ?? r.overall_score ?? "?"}`)
    .join("\n");
  const systemLines = strengths
    .map(
      (s) =>
        `${s.system}: avg ${s.averagePercent}%, latest ${s.latestPercent}%, trend ${s.trend}, from ${s.reportCount} report(s)`
    )
    .join("\n");

  // If the actual exam is already done, none of the usual "prioritize this
  // system" coaching applies anymore - swap in a short congratulatory
  // instruction instead and skip the system-targeting instructions entirely.
  const officialResult = findOfficialStep1Result(reports);
  const officialResultNote = officialResult
    ? `\nCRITICAL CONTEXT: This student has ALREADY TAKEN the real USMLE Step 1 exam - see "${officialResult.exam_name}" in the timeline above (taken ${officialResult.taken_date ?? "date unknown"}${
        officialResult.overall_score !== null
          ? `, result recorded as: ${officialResult.overall_score}`
          : officialResult.overall_percent !== null
            ? `, result recorded as: ${officialResult.overall_percent}%`
            : ""
      }). The exam is OVER. Do not give any "prioritize/master this system" study
advice under any circumstances, no matter what the practice-exam system
percentages above show - those are now historical and irrelevant, since
studying more will not change an exam that's already been taken.\n`
    : "";

  const goalLine =
    overallAverage !== null
      ? `The student's own overall average across every report so far is ${overallAverage}%. Frame priorities around bringing every weak system up to at least that average, not just vaguely "keep improving" - a system sitting well below ${overallAverage}% is a bigger, more concrete priority than one only slightly under it.`
      : `Frame the goal as bringing every system up toward the student's own overall average, not just generic improvement.`;

  // Structured JSON instead of a prose paragraph - lets the "AI Exam Review"
  // card render checkmark/warning bullets, a numbered priority list, and an
  // estimated-hours line instead of one block of text (see AiExamReview in
  // lib/scoreReports.ts for the exact shape this must match).
  const jsonShapeNote = `
Respond with ONLY raw JSON (no markdown fences, no commentary before or after) matching exactly this shape:
{"bullets": [{"text": "...", "positive": true}, ...], "priorityAreas": ["...", ...], "estimatedHours": "..."}
"positive": true for something going well (rendered with a checkmark), false for something needing attention (rendered with a warning sign).`;

  const prompt = `
You are a USMLE Step 1 study coach reviewing a student's practice-exam score history.
${officialResultNote}
Score report timeline (oldest to newest):
${timeline}

Per-system performance (sorted weakest to strongest by recent average):
${systemLines}

${
  officialResult
    ? `Produce 2-3 warm, specific bullets (all "positive": true) congratulating the
student on completing the real USMLE Step 1 exam noted above (mention the
result if one is recorded). Do not mention weak systems, studying, or study
priorities in any way - the exam is done, that advice no longer applies.
"priorityAreas" must be an empty array and "estimatedHours" must be an empty string.`
    : `Produce 3-5 short bullets (each one sentence, no markdown) that:
1. Name the 1-3 systems that are the real priority right now - weight both how
   low they are AND whether they're stuck/declining vs. already improving. Mark
   these bullets "positive": false.
2. ${goalLine}
3. If a system used to be weak but is now trending up, include a "positive": true
   bullet acknowledging that instead of just repeating "still weak."
4. Include at least one "positive": true bullet naming a genuine strength or
   improvement, if the data supports one.
Then set "priorityAreas" to the same 1-3 systems named above, ordered most
urgent first, and "estimatedHours" to a short range like "8-10 focused hours"
estimating how much dedicated study time closing those gaps would take.
Keep bullet text warm and direct - like a coach talking to the student, not a report.`
}

${jsonShapeNote}
`.trim();

  // gemini-2.0-flash was fully shut down by Google on June 1, 2026 - calls to
  // it now fail outright, which is what was actually behind the persistent
  // "AI request failed" errors (not just occasional high demand). Defaulting
  // to the current GA model instead, matching generate-practice-question's
  // route, which already had this right.
  const model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

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
    // Gemini occasionally ignores the "raw JSON only" instruction under load -
    // rather than hard-failing the whole request when that happens, fall
    // back to a single bullet wrapping whatever text did come back so the
    // card still renders something instead of an error.
    const review: AiExamReview = parseAiExamReview(text) ?? {
      bullets: [{ text: text.trim() || "No suggestion generated.", positive: true }],
      priorityAreas: [],
      estimatedHours: "",
    };

    // Best-effort cache write - if this fails for some reason, we still
    // return the review we just paid quota for, we just won't reuse it
    // next time. Stored as a JSON string in the same `suggestion` text
    // column that used to hold plain prose - see parseAiExamReview above
    // for how older plain-prose rows are handled on read.
    await supabase.from("ai_suggestion_cache").upsert({
      user_id: user.id,
      suggestion: JSON.stringify(review),
      report_count: reports.length,
      generated_at: new Date().toISOString(),
    });

    return NextResponse.json({ review, cached: false });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Unexpected error calling the AI." },
      { status: 500 }
    );
  }
}
