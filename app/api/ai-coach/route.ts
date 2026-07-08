import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/aiPrompt";
import type { AiFeedback, DailyLog, Profile } from "@/lib/types";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export async function POST() {
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

  const today = todayStr();

  const { data: profileData } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  const profile = profileData as Profile | null;

  const { data: todayLogData } = await supabase
    .from("daily_logs")
    .select("*")
    .eq("user_id", user.id)
    .eq("log_date", today)
    .single();

  if (!todayLogData) {
    return NextResponse.json(
      { error: "Save today's progress before requesting AI feedback." },
      { status: 400 }
    );
  }
  const todayLog = todayLogData as DailyLog;

  const { data: recentLogsData } = await supabase
    .from("daily_logs")
    .select("*")
    .eq("user_id", user.id)
    .lt("log_date", today)
    .order("log_date", { ascending: false })
    .limit(7);
  const recentLogs = (recentLogsData ?? []) as DailyLog[];

  const systemPrompt = buildSystemPrompt(profile);
  const userPrompt = buildUserPrompt(profile, todayLog, recentLogs);
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
            temperature: 0.6,
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

    let parsed: { review: string; plan: string };
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { review: text || "No response generated.", plan: "" };
    }

    const feedback: AiFeedback = {
      review: parsed.review || "No review generated.",
      plan: parsed.plan || "No plan generated.",
      generated_at: new Date().toISOString(),
    };

    await supabase
      .from("daily_logs")
      .update({ ai_feedback: feedback })
      .eq("user_id", user.id)
      .eq("log_date", today);

    return NextResponse.json({ feedback });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Unexpected error calling the AI." },
      { status: 500 }
    );
  }
}
