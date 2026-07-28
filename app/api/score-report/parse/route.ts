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

  const systemListText = STEP1_SYSTEMS.map((s, i) => `${i + 1}. ${s}`).join("\n");

  const prompt = `
You are carefully reading every pixel of a screenshot/PDF of a USMLE Step 1
practice exam score report (an NBME self-assessment form, a UWSA, the Free
120, or a UWorld self-assessment/performance summary). These reports are
often dense, multi-page, or contain more than one breakdown table - do not
stop after the first number you find. Work through the ENTIRE document
top to bottom before answering.

There are exactly 14 systems you need to check for (listed below, numbered).
For EACH of the 14, look everywhere in the document for a matching row,
bar, or percentage before deciding it isn't there. Some reports label these
"System", others label very similar categories under "Organ System" or
similar - use whichever table breaks performance down by organ
system/discipline. If a report shows both a "System" table and a
"Discipline/Subject" table, prefer the System one, but if only a
Discipline/Subject table exists, map each discipline to the closest
matching system below rather than leaving it blank - only skip a system if
you are confident, after checking the whole document, that no related
number appears anywhere.

The 14 systems (map any similar/abbreviated label you see - e.g. "Cardio",
"Cardiology" -> #4; "Renal", "Genitourinary" -> #12; "Repro" -> whichever of
#6/#9 the context indicates; "GI" -> #7; "MSK", "Derm" -> #11; "Heme/Onc",
"Blood" -> #3; "Psych", "Behavioral Science", "Neuro" -> #1:
${systemListText}

Two systems are almost always present in NBME/UWSA/UWorld breakdowns but get
missed because they're labeled inconsistently - look extra carefully for
these two before leaving them blank:
- #2 "Biostatistics & Epidemiology/Population Health": also appears as
  "Biostatistics", "Epidemiology", "Population Health", "Interpretation of
  the Medical Literature", "Evidence-Based Medicine", "ICM
  (biostat/epi portion)", or sometimes combined into a row just called
  "Biostat/Epi". If you see any row with "Biostat" or "Epi" anywhere in its
  label, that value belongs here.
- #14 "Social Sciences": also appears as "Social Sciences
  (Ethics/Legal/Communication)", "Behavioral Science" (only if it's a
  SEPARATE row from Psychiatry/Neurology - if there's just one combined
  Psych/Behavioral row, that one goes to #1 instead), "Communication and
  Interpersonal Skills", "Ethics", "Legal", "Patient Safety", or
  "Professionalism". If several small rows like these exist separately,
  average them into a single #14 value.

Before finalizing your answer, re-scan the document specifically for these
two - they are usually near the bottom of the breakdown table and easy to
skip past. Only leave one blank if, after this second check, you are certain
no matching row/number exists anywhere in the document.

Respond with ONLY JSON in exactly this shape, no extra commentary:

{
  "exam_type": "nbme" | "uwsa" | "free120" | "uworld_self_assessment" | "other",
  "exam_name": string (e.g. "NBME Form 28", "UWSA 1", "Free 120", "UWorld Self-Assessment"),
  "taken_date": string in YYYY-MM-DD format if a date is visible, otherwise null,
  "overall_score": number if an overall score (percentage, 3-digit scaled score, or
    predicted score) is shown, otherwise null,
  "overall_percent": number 0-100 if an overall percent-correct is shown or can be
    computed, otherwise null,
  "system_breakdown": an object mapping the exact system names from the numbered
    list above to a percent-correct number (0-100) - include every one you found a
    value for anywhere in the document, do not invent numbers for ones you didn't
    find.
}

If you genuinely cannot read the document or it isn't a score report, return every
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
            temperature: 0.1,
            responseMimeType: "application/json",
            maxOutputTokens: 3000,
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
