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
  // Accepts either a single { imageBase64, mimeType } (older callers) or a
  // { files: [{ base64, mimeType }, ...] } batch - a student may upload
  // several screenshots/PDFs (from the same or different platforms) for
  // one score report, e.g. one image per table, or a scrolled multi-part
  // capture. All of them are sent to Gemini together so it can merge them
  // into a single combined result instead of parsing each in isolation.
  type FileInput = { base64: string; mimeType: string };
  let files: FileInput[] = [];
  if (Array.isArray(body?.files) && body.files.length > 0) {
    files = body.files
      .filter((f: any) => typeof f?.base64 === "string" && f.base64.length > 0)
      .map((f: any) => ({ base64: f.base64, mimeType: f.mimeType || "image/png" }));
  } else if (typeof body?.imageBase64 === "string" && body.imageBase64.length > 0) {
    files = [{ base64: body.imageBase64, mimeType: body.mimeType || "image/png" }];
  }
  if (files.length === 0) {
    return NextResponse.json({ error: "No image provided." }, { status: 400 });
  }
  if (files.length > 6) {
    return NextResponse.json({ error: "Too many files - please upload at most 6 at a time." }, { status: 400 });
  }

  const systemListText = STEP1_SYSTEMS.map((s, i) => `${i + 1}. ${s}`).join("\n");

  const multiFileNote =
    files.length > 1
      ? `\nYou have been given ${files.length} separate images/files this time. They are
almost always pieces of the SAME score report - for example one image of a
"Performance By System" table and another of a "Performance By Subject"
table, a scrolled multi-part screenshot capture, or one image showing the
overall score and another showing the system breakdown. Treat all of them
together as one report and merge everything you read across every file
into a single combined "system_breakdown" object (and single exam_type/
exam_name/taken_date/overall_score/overall_percent) - do not produce
separate results per file. Only if two files are unmistakably from
different exams entirely (different dates, different exam names) should
you prioritize the most complete/most recent one instead of merging.\n`
      : "";

  const prompt = `
You are carefully reading every pixel of a screenshot/PDF (there may be more
than one - see below) of a USMLE Step 1 practice exam score report from ANY
platform (an NBME self-assessment form, a UWSA, the Free 120, a UWorld
self-assessment/performance summary, or any similar third-party practice
exam tool). These reports are often dense, multi-page, or contain more than
one breakdown table - do not stop after the first number you find. Work
through the ENTIRE document top to bottom before answering.
${multiFileNote}

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
  the Medical Literature", "Evidence-Based Medicine", "Genetics &
  Biostatistics" (UWorld's "Performance By Subject" table specifically -
  check that table for this even if a separate "Performance By System"
  table also exists and doesn't mention it), "ICM (biostat/epi portion)",
  or a row just called "Biostat/Epi". If you see any row with "Biostat" or
  "Epi" anywhere in its label, in ANY table on the page, that value goes
  here.
- #14 "Social Sciences": also appears as "Social Sciences
  (Ethics/Legal/Communication)", "Communication and Interpersonal Skills",
  "Ethics", "Legal", "Patient Safety", or "Professionalism". IMPORTANT:
  UWorld self-assessment score reports do NOT test this as its own
  category anywhere (not under System, not under Subject) - if this is a
  UWorld report (title/URL says uworld.com or "UWorld"), leave this one
  null without searching further, that is the correct answer, not a
  failure. Only keep searching for it on NBME/UWSA/Free120 reports.

UWorld "Performance By System" reports use exactly these 11 category names -
if you see this exact table, map every row using this table (do not
guess - use these mappings exactly):
  "Cardiovascular System" -> #4 Cardiovascular System
  "Respiratory System" -> #13 Respiratory System
  "Gastrointestinal & Nutrition" -> #7 Gastrointestinal System
  "Immunologic & Blood Disorders" -> #3 Blood & Lymphoreticular System
  "Renal, Urinary & Reproductive" -> use this same value for BOTH #12 Renal
    & Urinary System AND, split between #6 Female Reproductive System &
    Breast / #9 Male Reproductive System (UWorld combines all three into
    one score; reusing it for each is the best available estimate)
  "Nervous System & Special Sensory" and "Behavioral & Mental Disorders" ->
    average these two UWorld rows together into #1 Behavioral Health &
    Nervous Systems/Special Senses (NBME's #1 combines what UWorld reports
    separately)
  "Musculoskeletal, Skin & Connective" -> #11 Musculoskeletal/Skin &
    Subcutaneous Tissue
  "Endocrine & Metabolic Disorders" -> #5 Endocrine System
  "Gynecologic, Pregnancy & Childbirth" -> also folds into #6 Female
    Reproductive System & Breast (average with the Renal/Urinary/Repro
    value above if both are present)
  "General Principles" -> #8 General Principles of Foundational Science
  UWorld's System table has no row for #10 Multisystem Processes &
  Disorders or #9 Male Reproductive System on their own - leave those null
  unless the "Performance By Subject" table has something more specific.

Before finalizing your answer, re-scan the document specifically for
Biostatistics/Epi (checking every table on the page, not just the System
one) - it's easy to miss when it only appears in a Subject table. Only
leave a system blank if, after this second check, you are certain no
matching row/number exists anywhere in the document (or, for Social
Sciences on a UWorld report specifically, because UWorld genuinely doesn't
test it).

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
              parts: [
                { text: prompt },
                ...files.map((f) => ({ inlineData: { mimeType: f.mimeType, data: f.base64 } })),
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            maxOutputTokens: 4096,
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
    const finishReason = json?.candidates?.[0]?.finishReason;
    const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Gemini should return pure JSON (responseMimeType is set), but if it
    // wraps it in a ```json fence anyway, or the JSON has leading/trailing
    // junk, try to salvage just the {...} object before giving up.
    let parsed: Partial<ParsedScoreReport> = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          // fall through to the error response below
        }
      }
    }

    if (!parsed || Object.keys(parsed).length === 0) {
      const reasonHint =
        finishReason === "MAX_TOKENS"
          ? " (the response was cut off - try again, it sometimes works on a second try)"
          : "";
      return NextResponse.json(
        {
          error: `Couldn't read that file as a score report${reasonHint} - try a clearer screenshot, or enter it manually.`,
        },
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
