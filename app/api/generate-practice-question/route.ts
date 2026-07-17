import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildPracticeQuestionSystemPrompt,
  buildPracticeQuestionUserPrompt,
  PRACTICE_SET_SIZE,
} from "@/lib/practiceQuestionPrompt";

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

// Asking Gemini for the whole set in one response reliably got cut off
// mid-JSON before it finished (a full vignette + 5 choices + explanations,
// times 10-15, is a lot of output) - losing every question in the batch
// even if most of them were actually complete. Splitting into several
// smaller parallel calls keeps each individual response well within the
// token budget, so one truncated chunk doesn't take down the whole set.
const CHUNK_SIZE = 5;

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

  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  async function callGemini(count: number): Promise<GeneratedPracticeQuestion[]> {
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

  // One retry per chunk if it comes back with nothing usable - a malformed
  // or truncated response is usually a one-off, not persistent.
  async function callChunkWithRetry(count: number): Promise<GeneratedPracticeQuestion[]> {
    const first = await callGemini(count);
    if (first.length > 0) return first;
    return callGemini(count);
  }

  try {
    const chunkSizes: number[] = [];
    let remaining = PRACTICE_SET_SIZE;
    while (remaining > 0) {
      const size = Math.min(CHUNK_SIZE, remaining);
      chunkSizes.push(size);
      remaining -= size;
    }

    const results = await Promise.all(chunkSizes.map((size) => callChunkWithRetry(size)));
    const questions = results.flat();

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
