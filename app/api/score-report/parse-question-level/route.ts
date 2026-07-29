import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aggregateQuestionLevelItems, type QuestionLevelItem } from "@/lib/questionLevelReports";

/**
 * Takes a base64-encoded "question-level feedback report" (e.g. an NBME
 * CBSE/CCSE PDF that lists a content description, correct/incorrect, and a
 * national percent-correct benchmark for every single question on the
 * exam - not just one overall per-system percent table like the regular
 * score-report parse route handles) and asks Gemini to read every row of
 * it. The aggregation into per-system and per-topic percentages happens
 * here in plain code (lib/questionLevelReports.ts), not by asking the AI to
 * do arithmetic across 100+ rows itself - the AI's only job is faithfully
 * transcribing each row.
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
  type FileInput = { base64: string; mimeType: string };
  let files: FileInput[] = [];
  if (Array.isArray(body?.files) && body.files.length > 0) {
    files = body.files
      .filter((f: any) => typeof f?.base64 === "string" && f.base64.length > 0)
      .map((f: any) => ({ base64: f.base64, mimeType: f.mimeType || "application/pdf" }));
  }
  if (files.length === 0) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (files.length > 6) {
    return NextResponse.json({ error: "Too many files - please upload at most 6 at a time." }, { status: 400 });
  }

  const prompt = `
You are reading a "question-level feedback report" from a medical licensing
exam self-assessment (e.g. an NBME CBSE/CCSE "Examinee Question-Level
Feedback Report", or a similar per-question breakdown from another
platform). Unlike a simple per-system percent table, this document lists
ONE ROW PER QUESTION - typically a "Content Description" column (a topic
label, often with a category prefix like "Diagnosis:", "Foundation:", or
"Gen Principle:" followed by a system/subject and then a specific
subtopic), a column showing whether that question was answered "Correct"
or "Incorrect", and often a "National % Correct" benchmark column. The
document may span several pages and may contain 100-250+ rows - you must
work through every single page and transcribe EVERY row, not just the
first page or a sample. Do not skip, summarize, or merge rows - if the same
content description appears multiple times (because multiple different
questions covered that same topic), include it as that many separate
entries.

Also find, near the top of the document: the exam's name/title (e.g. "CBSE",
"CCSE", or whatever this specific exam is called - include the subject if
shown, e.g. "CBSE"), the date the exam was taken (look for "Test Date" or
similar - format as YYYY-MM-DD), and an overall score if one is shown (e.g.
"Total Equated Percent Correct Score" - a single overall number, typically
0-100).

Respond with ONLY JSON in exactly this shape, no extra commentary:

{
  "exam_name": string (e.g. "CBSE"),
  "taken_date": string in YYYY-MM-DD format if visible, otherwise null,
  "overall_score": number if an overall score is shown, otherwise null,
  "items": [
    { "content_description": string (verbatim, exactly as printed, including
        any "Diagnosis:"/"Foundation:"/"Gen Principle:" style prefix),
      "correct": boolean (true if that row's answer column says "Correct"),
      "national_pct": number 0-100 if a national/comparison percent-correct
        column is shown for that row, otherwise null },
    ...
  ]
}

If you genuinely cannot read the document or it isn't a question-level
feedback report, return { "exam_name": null, "taken_date": null,
"overall_score": null, "items": [] }.
`.trim();

  const model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  try {
    // Same 503 ("model overloaded") retry as the regular score-report parse
    // route - Google's own message says these are usually transient, and a
    // 150+ row document is exactly the kind of upload where making someone
    // redo the whole thing over one blip would be most annoying.
    let res: Response | null = null;
    let lastErrText = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(
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
              // A 200+ row document needs a lot more room than the regular
              // single-table score-report parse - each item is small JSON,
              // but there can be hundreds of them.
              maxOutputTokens: 16384,
            },
          }),
        }
      );
      if (res.ok || res.status !== 503) break;
      lastErrText = await res.text();
      if (attempt < 2) await sleep(1500 * (attempt + 1));
    }

    if (!res) {
      return NextResponse.json({ error: "AI request failed: no response from Gemini." }, { status: 502 });
    }

    if (!res.ok) {
      const errText = res.status === 503 ? lastErrText : await res.text();
      const hint =
        res.status === 503
          ? " The AI model is overloaded right now even after retrying - this usually clears up within a few minutes, so try again shortly."
          : "";
      return NextResponse.json(
        { error: `AI request failed: ${errText.slice(0, 300)}${hint}` },
        { status: 502 }
      );
    }

    const json = await res.json();
    const finishReason = json?.candidates?.[0]?.finishReason;
    const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    let parsed: { exam_name?: string | null; taken_date?: string | null; overall_score?: number | null; items?: any[] } = {};
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

    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const items: QuestionLevelItem[] = rawItems
      .filter((it: any) => typeof it?.content_description === "string" && it.content_description.trim().length > 0)
      .map((it: any) => ({
        content_description: String(it.content_description).trim(),
        correct: it.correct === true,
        national_pct: typeof it.national_pct === "number" ? it.national_pct : null,
      }));

    if (items.length === 0) {
      const reasonHint =
        finishReason === "MAX_TOKENS"
          ? " (the response was cut off, likely because the report has a lot of questions - try again, it sometimes works on a second try)"
          : "";
      return NextResponse.json(
        {
          error: `Couldn't read any question rows from that file${reasonHint} - make sure it's a question-level feedback report, or try a clearer scan.`,
        },
        { status: 422 }
      );
    }

    const { systemBreakdown, contentBreakdown } = aggregateQuestionLevelItems(items);

    return NextResponse.json({
      exam_name: parsed.exam_name || "Question-Level Report",
      taken_date: parsed.taken_date || null,
      overall_score: typeof parsed.overall_score === "number" ? parsed.overall_score : null,
      itemCount: items.length,
      systemBreakdown,
      contentBreakdown,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Unexpected error calling the AI." },
      { status: 500 }
    );
  }
}
