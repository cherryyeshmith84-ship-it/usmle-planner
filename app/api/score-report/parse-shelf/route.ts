import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aggregateQuestionLevelItems, mapToStep1System, type QuestionLevelItem } from "@/lib/questionLevelReports";

// Long PDFs + AI: give the function room, and never cache.
export const dynamic = "force-dynamic";
export const maxDuration = 60;
// NOTE: AI failures are returned as HTTP 422 (not 5xx) on purpose - a 5xx from
// this route is replaced by an HTML error page in front of the site, which
// hides the real reason from the admin.

interface ShelfSection {
  group: string; // e.g. "Organ System/Topic", "Physician Task", "Site of Care", "Patient Group"
  name: string; // e.g. "Cardiovascular System"
  epc: number | null; // student's equated percent correct
  comparison: number | null; // comparison group average
  pct_questions: string | null; // e.g. "10 - 15%"
}

/**
 * Admin-only. Reads NBME Subject ("shelf") exam PDFs for ANY subject
 * (Medicine, Psychiatry, Surgery, Pediatrics, OB/GYN, Family Medicine,
 * Neurology, Emergency Medicine...) - the "Examinee Performance Report"
 * (EPC scores by organ system / physician task / site of care / patient
 * group), the "Examinee Question-Level Feedback Report" (one row per
 * question), or both together. The AI only transcribes; all the arithmetic
 * (percent per system and per topic) happens here in plain code.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!me?.is_admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI is not configured yet. Add GEMINI_API_KEY in your deployment settings." },
      { status: 422 }
    );
  }

  const body = await req.json().catch(() => null);
  const files: { base64: string; mimeType: string }[] = Array.isArray(body?.files)
    ? body.files
        .filter((f: any) => typeof f?.base64 === "string" && f.base64.length > 0)
        .map((f: any) => ({ base64: f.base64, mimeType: f.mimeType || "application/pdf" }))
    : [];
  if (files.length === 0) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (files.length > 4) return NextResponse.json({ error: "Please upload at most 4 files at a time." }, { status: 400 });

  const prompt = `
You are reading one or more NBME "Subject Examination Program" (shelf exam)
score PDFs for ONE exam taken by ONE student. The files may be:
(a) an "EXAMINEE PERFORMANCE REPORT": a table with columns Your EPC Score,
    Comparison Group Average EPC Score, and "% of Questions", grouped under
    headings like "Performance by Organ System/Topic", "Performance by
    Physician Task", "Performance by Site of Care", "Performance by Patient
    Group";
(b) an "EXAMINEE QUESTION-LEVEL FEEDBACK REPORT": one row per question with
    "Content Description", "Your Answer" (Correct/Incorrect) and
    "National % Correct". It may span several pages - transcribe EVERY row of
    EVERY page, never skip, merge or summarize; repeated descriptions are
    separate rows.
If both kinds are provided, fill in both parts. Leave a part empty if that
kind of file was not provided.

From the headers find: the subject (the title line, e.g. "MEDICINE
EXAMINATION" -> "Medicine", "PSYCHIATRY EXAMINATION" -> "Psychiatry"), the
Test Date (format YYYY-MM-DD), and the "Total Equated Percent Correct Score"
(a number 0-100). If the performance report states the comparison group mean
for the total EPC score (e.g. "...mean and standard deviation ... were 75 and
9"), return that mean as comparison_mean, otherwise null.

Respond with ONLY JSON in exactly this shape, no commentary:
{
  "subject": string or null,
  "taken_date": "YYYY-MM-DD" or null,
  "total_epc": number or null,
  "comparison_mean": number or null,
  "sections": [
    { "group": "Organ System/Topic" | "Physician Task" | "Site of Care" | "Patient Group",
      "name": string (verbatim row label),
      "epc": number or null,
      "comparison": number or null,
      "pct_questions": string or null (verbatim, e.g. "10 - 15%") }
  ],
  "items": [
    { "content_description": string (verbatim, including the "Diagnosis:" /
        "Foundation:" / "Gen Principle:" / "Management:" prefix),
      "correct": boolean,
      "national_pct": number 0-100 or null }
  ]
}
If a file is not a shelf-exam report, return empty arrays and nulls.
`.trim();

  const model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
  const fallback = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.8-flash";
  const attempts = [model, model, fallback, fallback];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  try {
    let res: Response | null = null;
    for (let i = 0; i < attempts.length; i++) {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${attempts[i]}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: prompt }, ...files.map((f) => ({ inlineData: { mimeType: f.mimeType, data: f.base64 } }))],
              },
            ],
            generationConfig: { temperature: 0.1, responseMimeType: "application/json", maxOutputTokens: 24576 },
          }),
        }
      );
      if (res.ok) break;
      if (![429, 500, 503].includes(res.status) || i === attempts.length - 1) break;
      await sleep(1500 * (i + 1));
    }

    if (!res || !res.ok) {
      const errText = res ? await res.text() : "no response";
      return NextResponse.json({ error: `AI request failed: ${errText.slice(0, 300)}` }, { status: 422 });
    }

    const json = await res.json();
    const finishReason = json?.candidates?.[0]?.finishReason;
    const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    let parsed: any = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch {
          // handled below
        }
      }
    }

    const items: QuestionLevelItem[] = (Array.isArray(parsed.items) ? parsed.items : [])
      .filter((it: any) => typeof it?.content_description === "string" && it.content_description.trim())
      .map((it: any) => ({
        content_description: String(it.content_description).trim(),
        correct: it.correct === true,
        national_pct: typeof it.national_pct === "number" ? it.national_pct : null,
      }));

    const sections: ShelfSection[] = (Array.isArray(parsed.sections) ? parsed.sections : [])
      .filter((s: any) => typeof s?.name === "string" && s.name.trim())
      .map((s: any) => ({
        group: typeof s.group === "string" ? s.group : "",
        name: String(s.name).trim(),
        epc: typeof s.epc === "number" ? s.epc : null,
        comparison: typeof s.comparison === "number" ? s.comparison : null,
        pct_questions: typeof s.pct_questions === "string" ? s.pct_questions : null,
      }));

    if (items.length === 0 && sections.length === 0) {
      const hint = finishReason === "MAX_TOKENS" ? " (the answer was cut off - try again)" : "";
      return NextResponse.json(
        { error: `Couldn't read anything from those files${hint}. Make sure they are NBME shelf exam reports.` },
        { status: 422 }
      );
    }

    // Per-system / per-topic percentages from the question rows.
    let systemBreakdown: Record<string, number> = {};
    let contentBreakdown: Record<string, any> = {};
    if (items.length > 0) {
      const agg = aggregateQuestionLevelItems(items);
      systemBreakdown = agg.systemBreakdown;
      contentBreakdown = agg.contentBreakdown;
    } else {
      // Performance report only: use the organ-system rows that map cleanly to
      // ONE Master Grid system (combined rows like "Female & Male Reproductive
      // Systems, and Endocrine System" are skipped on purpose).
      for (const s of sections) {
        if (!/organ system/i.test(s.group) || s.epc === null) continue;
        if (/[,&]|\band\b/i.test(s.name)) continue;
        const sys = mapToStep1System(s.name);
        if (sys) systemBreakdown[sys] = Math.round(s.epc);
      }
    }

    const subject = typeof parsed.subject === "string" && parsed.subject.trim() ? parsed.subject.trim() : null;

    return NextResponse.json({
      subject,
      exam_name: subject ? `${subject} Shelf (NBME)` : "Shelf Exam (NBME)",
      taken_date: typeof parsed.taken_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.taken_date) ? parsed.taken_date : null,
      total_epc: typeof parsed.total_epc === "number" ? parsed.total_epc : null,
      comparison_mean: typeof parsed.comparison_mean === "number" ? parsed.comparison_mean : null,
      sections,
      itemCount: items.length,
      systemBreakdown,
      contentBreakdown,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error calling the AI." }, { status: 422 });
  }
}
