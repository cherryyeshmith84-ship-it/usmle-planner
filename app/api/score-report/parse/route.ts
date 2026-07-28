import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { STEP1_SYSTEMS } from "@/lib/qbankTypes";
import type { ParsedScoreReport } from "@/lib/scoreReports";

/**
 * Takes a base64-encoded score-report image (NBME/UWSA/Free120/UWorld
 * self-assessment screenshot) and asks Gemini's vision model to read it:
 * exam name/type, date taken, overall score, and a per-system percent
 * breakdown mapped onto our canonical STEP1_SYSTEMS list so it lines up
 * with Master Grid. The student reviews/edits the result before it's ever
 * saved - this only returns a best-effort draft.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI is not configured yet. Add GEMINI_API_KEY in your deployment settings." },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  const imageBase64: string | undefined = body?.imageBase64;
  const mimeType: string = body?.mimeType || "image/png";
  if (!imageBase64) {
    return NextResponse.json({ error: "No image provided." }, { status: 400 });
  }

  const systemListText = STEP1_SYSTEMS.map((s) => `- ${s}`).join("\n");

  const prompt = `
You are reading a screenshot of a USMLE Step 1 practice exam score report
(this could be an NBME self-assessment form, a UWSA, the Free 120, or a
UWorld self-assessment/performance summary). Extract what you can see and
respond with ONLY JSON in exactly this shape, no extra commentary:

{
  "exam_type": "nbme" | "uwsa" | "free120" | "uworld_self_assessment" | "other",
  "exam_name": string (e.g. "NBME Form 28", "UWSA 1", "Free 120", "UWorld Self-Assessment"),
  "taken_date": string in YYYY-MM-DD format if a date is visible, otherwise null,
  "overall_score": number if an overall score (percentage, 3-digit scaled score, or
    predicted score) is shown, otherwise null,
  "overall_percent": number 0-100 if an overall percent-correct is shown or can be
    computed, otherwise null,
  "system_breakdown": an object mapping ONLY the following exact system names to a
    percent-correct number (0-100) for each one you can actually read a value for -
    omit any system not shown in the image, do not invent numbers:
${systemListText}
}

If the report uses different category names than the list above (e.g. "Cardiology"
instead of "Cardiovascular System"), map it to the closest matching name from the
list. If you genuinely cannot read the image or it isn't a score report, return every
field as null (system_breakdown as {}).
`.trim();

  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }, { inlineData: { mimeType, data: imageBase64 } }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
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

    let parsed: Partial<ParsedScoreReport> = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Couldn't read that image as a score report - try a clearer screenshot, or enter it manually." },
        { status: 422 }
      );
    }

    const result: ParsedScoreReport = {
      exam_type: (["nbme", "uwsa", "free120", "uworld_self_assessment", "other"] as const).includes(
        parsed.exam_type as any
      )
        ? (parsed.exam_type as ParsedScoreReport["exam_type"])
        : "other",
      exam_name: parsed.exam_name || "Score report",
      taken_date: parsed.taken_date || null,
      overall_score: typeof parsed.overall_score === "number" ? parsed.overall_score : null,
      overall_percent: typeof parsed.overall_percent === "number" ? parsed.overall_percent : null,
      system_breakdown:
        parsed.system_breakdown && typeof parsed.system_breakdown === "object"
          ? Object.fromEntries(
              Object.entries(parsed.system_breakdown).filter(
                ([k, v]) => (STEP1_SYSTEMS as readonly string[]).includes(k) && typeof v === "number"
              )
            )
          : {},
    };

    return NextResponse.json({ result, raw: json });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Unexpected error calling the AI." },
      { status: 500 }
    );
  }
}
