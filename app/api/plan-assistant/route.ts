import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.PLAN_AI_MODEL || "claude-sonnet-4-5";

type ClearAction = { from?: string | null; to?: string | null; match?: string | null };
type AddAction = { date: string; title: string; category?: string };
type Actions = { clear?: ClearAction[]; add?: AddAction[]; summary?: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function cleanActions(a: Actions): { clear: ClearAction[]; add: AddAction[]; summary: string } {
  const clear = (Array.isArray(a.clear) ? a.clear : [])
    .map((c) => ({
      from: c.from && ISO.test(c.from) ? c.from : null,
      to: c.to && ISO.test(c.to) ? c.to : null,
      match: c.match ? String(c.match).slice(0, 100) : null,
    }))
    // never allow an unbounded "delete everything": a start date is required
    .filter((c) => c.from);
  const add = (Array.isArray(a.add) ? a.add : [])
    .filter((x) => x && ISO.test(String(x.date)) && String(x.title ?? "").trim())
    .slice(0, 400)
    .map((x) => ({ date: x.date, title: String(x.title).trim().slice(0, 300), category: x.category }));
  return { clear, add, summary: String(a.summary ?? "").slice(0, 400) };
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set on the server. Add it in Vercel -> Settings -> Environment Variables, then redeploy." },
      { status: 500 }
    );
  }

  let body: { studentId?: string; instruction?: string; entryDate?: string; today?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const studentId = body.studentId;
  const instruction = (body.instruction ?? "").trim();
  const entryDate = body.entryDate && ISO.test(body.entryDate) ? body.entryDate : null;
  const today = body.today && ISO.test(body.today) ? body.today : entryDate;
  if (!studentId || !instruction || !entryDate || !today) {
    return NextResponse.json({ error: "Missing studentId, instruction or date" }, { status: 400 });
  }

  // Current upcoming tasks (RLS: only what this user may see) so the AI can
  // refer to them ("remove the renal ones").
  const { data: existing } = await supabase
    .from("mentor_plan_tasks")
    .select("task_date, title, completed")
    .eq("student_id", studentId)
    .gte("task_date", today)
    .order("task_date", { ascending: true })
    .limit(150);
  const existingText = (existing ?? [])
    .map((t: { task_date: string; title: string; completed: boolean }) => `${t.task_date}: ${t.title}${t.completed ? " (done)" : ""}`)
    .join("\n");

  const dow = new Date(today + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" });
  const system = `You turn a mentor's spoken or typed instruction into edits of a student's USMLE study planner.
Today is ${today} (${dow}). "Tomorrow" is the day after today.
Reply with ONLY a JSON object, no prose, in this shape:
{"clear":[{"from":"YYYY-MM-DD","to":"YYYY-MM-DD or null","match":"text or null"}],"add":[{"date":"YYYY-MM-DD","title":"short task","category":"question_block|reading|review|video|other"}],"summary":"one short sentence of what you did"}
Rules:
- "clear" removes the student's NOT-yet-completed tasks with task_date >= from (and <= to if given; and only titles containing "match" if given). Only include "clear" when the instruction asks to remove/replace/delete/cancel/overwrite existing things. "remove everything/whatever is existing from tomorrow" = from tomorrow, to null, match null. Always give a "from" date.
- "add" lists every concrete task on its own date. Expand ranges: "40 UWorld questions daily for 20 days from tomorrow" = one task "UWorld 40 questions" on each of 20 consecutive dates starting tomorrow. "Every Monday" / "weekdays only" / "except Sundays" must be respected. If no date is given, use tomorrow.
- Titles are short and specific, e.g. "UWorld 40 questions (mixed, timed)", "First Aid review: Renal", "Review acid-base notes". Use question_block for question banks, reading for reading, video for videos, review for review/revision, else other.
- A sentence that has several separate instructions (e.g. "...and first aid review") becomes several tasks; a task with no stated date goes on tomorrow.
- Never invent extra tasks the instruction did not ask for. Do not clear anything unless asked.
- If the instruction is not about the planner at all, return {"clear":[],"add":[],"summary":"Nothing to change in the planner."}.`;

  const userMsg = `Student's upcoming tasks (for reference):\n${existingText || "(none)"}\n\nInstruction:\n${instruction}`;

  let aiText = "";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        temperature: 0,
        system,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: `AI error: ${json?.error?.message ?? res.status}` }, { status: 502 });
    }
    aiText = (json.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
  } catch (e) {
    return NextResponse.json({ error: `AI request failed: ${(e as Error).message}` }, { status: 502 });
  }

  let actions: ReturnType<typeof cleanActions>;
  try {
    const start = aiText.indexOf("{");
    const end = aiText.lastIndexOf("}");
    actions = cleanActions(JSON.parse(aiText.slice(start, end + 1)));
  } catch {
    return NextResponse.json({ error: "I couldn't understand that. Try saying it again more simply." }, { status: 422 });
  }

  if (actions.clear.length === 0 && actions.add.length === 0) {
    return NextResponse.json({ ok: true, removed: 0, added: 0, summary: actions.summary || "Nothing to change in the planner." });
  }

  const { data, error } = await supabase.rpc("apply_plan_instruction", {
    p_student_id: studentId,
    p_entry_date: entryDate,
    p_instruction: instruction,
    p_actions: { clear: actions.clear, add: actions.add },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const r = (data ?? {}) as { removed?: number; added?: number };
  return NextResponse.json({
    ok: true,
    removed: r.removed ?? 0,
    added: r.added ?? 0,
    summary: actions.summary,
    firstDate: actions.add.map((a) => a.date).sort()[0] ?? null,
    lastDate: actions.add.map((a) => a.date).sort().slice(-1)[0] ?? null,
  });
}
