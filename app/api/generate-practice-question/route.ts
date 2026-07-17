import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildPracticeQuestionSystemPrompt, buildPracticeQuestionUserPrompt } from "@/lib/practiceQuestionPrompt";

export interface GeneratedPracticeChoice {
  text: string;
  correct: boolean;
  explanation: string;
}

export interface GeneratedPracticeQuestion {
  question: string;
  choices: GeneratedPracticeChoice[];
  keyTakeaway: string;
}

// Gemini is told not to wrap its answer in a code fence, but sometimes does
// anyway - strip ```json ... ``` (or a bare ```) if present before parsing.
function stripCodeFence(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return (match ? match[1] : text).trim();
}

function isValidQuestion(q: any): q is GeneratedPracticeQuestion {
  if (!q || typeof q.question !== "string" || !q.question.trim()) return false;
  if (!Array.isArray(q.choices) || q.choices.length !== 5) return false;
  const correctCount = q.choices.filter((c: any) => c?.correct === true).length;
  if (correctCount !== 1) return false;
  return q.choices.every((c: any) => typeof c?.text === "string" && c.text.trim().length > 0);
}

export async function POST(request: Request) {
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

  const body = await request.json().catch(() => null);
  const concept: string = (body?.concept || "").trim();
  const weakConcept: string | null = body?.weakConcept || null;
  const errorNote: string | null = body?.errorNote || null;
  const originalQuestion: string = (body?.originalQuestion || "").trim();
  const harder: boolean = !!body?.harder;

  if (!concept || !originalQuestion) {
    return NextResponse.json({ error: "Missing concept or original question." }, { status: 400 });
  }

  const systemPrompt = buildPracticeQuestionSystemPrompt();
  const userPrompt = buildPracticeQuestionUserPrompt({ concept, weakConcept, errorNote, originalQuestion, harder });
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  // A set of 10 full vignette questions is a lot of JSON - give the model
  // plenty of room so it isn't cut off mid-object.
  async function callGemini(): Promise<GeneratedPracticeQuestion[] | { error: string }> {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.8,
            responseMimeType: "application/json",
            maxOutputTokens: 8192,
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return { error: `AI request failed: ${errText.slice(0, 300)}` };
    }

    const json = await res.json();
    const finishReason = json?.candidates?.[0]?.finishReason;
    const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    let parsed: { questions?: unknown[] } | null = null;
    try {
      parsed = JSON.parse(stripCodeFence(text));
    } catch {
      parsed = null;
    }

    const candidates = Array.isArray(parsed?.questions) ? (parsed!.questions as unknown[]) : [];
    const valid = candidates.filter(isValidQuestion) as GeneratedPracticeQuestion[];

    if (valid.length === 0) {
      const reasonNote = finishReason === "MAX_TOKENS" ? " (response got cut off - try again)" : "";
      return { error: `AI returned an unusable set of questions${reasonNote}. Try again.` };
    }

    return valid;
  }

  try {
    let result = await callGemini();
    // One retry if the first attempt came back completely unusable - a
    // malformed JSON response is usually a one-off, not persistent.
    if (!Array.isArray(result)) {
      result = await callGemini();
    }

    if (!Array.isArray(result)) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({ questions: result });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Unexpected error calling the AI." },
      { status: 500 }
    );
  }
}
