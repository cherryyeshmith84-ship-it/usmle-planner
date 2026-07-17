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

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.7,
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

    let parsed: GeneratedPracticeQuestion | null = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    const choices = parsed?.choices ?? [];
    const correctCount = choices.filter((c) => c?.correct).length;
    if (!parsed || !parsed.question || choices.length < 2 || correctCount !== 1) {
      return NextResponse.json(
        { error: "AI returned an unusable question. Try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({ practiceQuestion: parsed });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Unexpected error calling the AI." },
      { status: 500 }
    );
  }
}
