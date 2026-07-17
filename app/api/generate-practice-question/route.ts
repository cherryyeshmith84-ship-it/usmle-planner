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

/**
 * Writes `count` new practice questions in one call - the client decides
 * how many to ask for per request. Asking for the full set at once was
 * both slow (waiting on one big generation before showing anything) and
 * fragile (a long response is more likely to get cut off mid-JSON), so the
 * client instead asks for a small first batch, then a second batch in the
 * background - see components/ErrorNotePracticeClient.tsx.
 */
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
  const rawCount = Number(body?.count);
  const count = Number.isFinite(rawCount) ? Math.min(Math.max(Math.round(rawCount), 1), 10) : 5;

  if (!concept || !originalQuestion) {
    return NextResponse.json({ error: "Missing concept or original question." }, { status: 400 });
  }

  // gemini-2.0-flash was shut down by Google on June 1, 2026 - any call to
  // it now fails outright, which is very likely why generation had gotten
  // slow/unreliable (fail, retry, fail again). gemini-2.5-flash-lite is
  // Google's current low-latency model and is the active replacement.
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

  async function callGemini(): Promise<GeneratedPracticeQuestion[]> {
    const systemPrompt = buildPracticeQuestionSystemPrompt(count);
    const userPrompt = buildPracticeQuestionUserPrompt({
      concept,
      weakConcept,
      errorNote,
      originalQuestion,
      harder,
      count,
    });

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

    if (!res.ok) return [];

    const json = await res.json();
    const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    let parsed: { questions?: unknown[] } | null = null;
    try {
      parsed = JSON.parse(stripCodeFence(text));
    } catch {
      parsed = null;
    }

    const candidates = Array.isArray(parsed?.questions) ? (parsed!.questions as unknown[]) : [];
    return candidates.filter(isValidQuestion) as GeneratedPracticeQuestion[];
  }

  try {
    let questions = await callGemini();
    // One retry if this came back with nothing usable - a malformed or
    // truncated response is usually a one-off, not persistent.
    if (questions.length === 0) {
      questions = await callGemini();
    }

    if (questions.length === 0) {
      return NextResponse.json(
        { error: "AI couldn't write any usable questions right now. Try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({ questions });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Unexpected error calling the AI." },
      { status: 500 }
    );
  }
}
