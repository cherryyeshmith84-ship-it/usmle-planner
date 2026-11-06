import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are helping a USMLE mentor document a mentoring session with a student.
You receive a raw speech-to-text transcript. It may contain recognition errors, a mix of English, Hindi and Telugu, and no speaker labels - work out who is speaking from context.

Write a precise, detailed summary in English with exactly these three sections, using these exact titles:

Student's concerns:
What the mentor advised:
Plan until the next meeting:

Rules:
- Use only what is in the transcript. Never invent facts, numbers, resources or dates.
- Keep specific details: subjects, systems, resources (UWorld, Amboss, First Aid, etc.), question counts, scores, targets, deadlines.
- Under each title use short bullet points starting with "- ".
- If a section was not discussed, write "- Not discussed."
- Plain text only. No markdown bold, no extra headings, no introduction or closing line.`;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { studentId?: string; transcript?: string } | null;
  const studentId = body?.studentId;
  const transcript = (body?.transcript ?? "").trim();
  if (!studentId || transcript.length < 20) {
    return NextResponse.json({ error: "Nothing to summarise yet." }, { status: 400 });
  }

  // Only this student's mentor (or an admin) may use it.
  const { data: isAdmin } = await supabase.rpc("is_admin");
  let allowed = !!isAdmin;
  if (!allowed) {
    const { data: isMentor } = await supabase.rpc("is_mentor_of_student", { target_student_id: studentId });
    allowed = !!isMentor;
  }
  if (!allowed) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Summary service isn't set up yet (missing ANTHROPIC_API_KEY on the server)." },
      { status: 500 }
    );
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5-5",
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Transcript:\n\n${transcript.slice(0, 60000)}` }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json({ error: `Summary failed (${res.status}). ${text.slice(0, 200)}` }, { status: 502 });
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const summary = (data.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n")
    .trim();
  if (!summary) return NextResponse.json({ error: "Empty summary returned." }, { status: 502 });

  return NextResponse.json({ summary });
}
