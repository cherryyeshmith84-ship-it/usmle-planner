import type { DailyLog, Profile } from "./types";

const BASE_GUIDANCE = `
You are an experienced, encouraging USMLE Step 1 study coach. You help a
student stay consistent, study effectively, and avoid burnout. Ground your
advice in these general principles unless the student's own instructions
say otherwise:

- UWorld: after finishing a block, review EVERY question (correct and
  incorrect) before moving on. Read each answer explanation fully, note
  the tested concept (not just the fact), and convert genuinely new
  information into spaced-repetition cards. Track first-pass percentage
  over time rather than chasing 100% on any single block.
- Sketchy (Micro/Pharm): watch a video once actively (pause, redraw key
  elements), then rely on quick visual recall reviews rather than
  full rewatches. Pair each Sketchy topic with a few UWorld questions on
  the same organism/drug soon after.
- Boards & Beyond / Pathoma: use for first-pass learning or targeted review
  of weak areas, not as a substitute for active question practice. Good
  ratio is roughly 30-40% content review to 60-70% active recall/questions
  once past the early "beginning" phase.
- Anki / spaced repetition: keep daily review load sustainable; if due
  cards pile up for multiple days in a row, recommend suspending
  low-yield decks temporarily rather than skipping reviews entirely.
- Skipping/falling behind: normalize occasional skipped or lighter days,
  but flag patterns (e.g. 3+ days skipped in a row, or repeatedly skipping
  the same subject) and suggest a concrete recovery plan, not guilt.
- Full-length exams (NBME/UWSA/Free120): recommend spacing these out,
  simulating real test conditions, and doing a full review of each,
  especially in the "end" phase.
- Pacing: a sustainable daily study load is usually 6-10 hours depending
  on the student's stage and life situation - don't push unsustainable
  hours, and call out burnout risk if hours are consistently very high
  with low self-rated quality.
- Tone: be specific and practical, reference what THIS student actually
  logged, not generic advice. Keep responses concise (a few short
  paragraphs or bullet-style sentences), warm, and motivating without
  being saccharine.
`;

export function buildSystemPrompt(profile: Profile | null) {
  const custom = profile?.ai_instructions?.trim();
  return [
    BASE_GUIDANCE.trim(),
    custom
      ? `\nThe student has also given you these personal instructions - follow these closely, and let them override the general guidance above if they conflict:\n${custom}`
      : "",
  ].join("\n");
}

export function buildUserPrompt(
  profile: Profile | null,
  today: DailyLog,
  recentLogs: DailyLog[]
) {
  const trackInfo =
    profile?.exam_track === "subject"
      ? `Preparing for: Subject exam - ${profile?.subject_name || "unspecified subject"}`
      : "Preparing for: USMLE Step 1 (CBSE)";
  const examInfo = profile?.exam_date
    ? `Exam date: ${profile.exam_date}`
    : "Exam date: not set";
  const stageInfo = profile?.prep_stage
    ? `Prep stage: ${profile.prep_stage}`
    : "Prep stage: not set";
  const goalInfo = profile?.daily_hour_goal
    ? `Daily hour goal: ${profile.daily_hour_goal}h`
    : "Daily hour goal: not set";
  const resourceInfo = profile?.resources?.length
    ? `Preferred resources: ${profile.resources.join(", ")}`
    : "Preferred resources: not set";
  const intakeLines = [
    profile?.strong_areas ? `Student says they're strong in: ${profile.strong_areas}` : "",
    profile?.weak_areas ? `Student says they're struggling with: ${profile.weak_areas}` : "",
    profile?.completed_so_far ? `Completed so far (from intake): ${profile.completed_so_far}` : "",
    profile?.goals_notes ? `Student's stated goals: ${profile.goals_notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const taskLines = today.tasks
    .map(
      (t) =>
        `- [${t.status.toUpperCase()}] ${t.title} (${t.resource}${
          t.target ? `, target: ${t.target}` : ""
        })`
    )
    .join("\n");

  const blockLines = (today.block_scores ?? [])
    .map((b) => `- ${b.resource}: ${b.question_count} questions, ${b.percent_correct}% correct`)
    .join("\n");

  const recentSummary = recentLogs
    .slice(0, 6)
    .map(
      (l) =>
        `${l.log_date}: ${l.hours_studied ?? "?"}h studied, rating ${
          l.rating ?? "n/a"
        }/10, ${l.tasks.filter((t) => t.status === "done").length}/${
          l.tasks.length
        } tasks done${l.topics_skipped ? `, skipped: ${l.topics_skipped}` : ""}`
    )
    .join("\n");

  return `
Student profile:
${trackInfo}
${examInfo}
${stageInfo}
${goalInfo}
${resourceInfo}
${intakeLines ? `\n${intakeLines}\n` : ""}

Today's log (${today.log_date}):
Hours studied: ${today.hours_studied ?? "not logged"}
Self-rating (0-10): ${today.rating ?? "not rated"}
Topics/tasks skipped: ${today.topics_skipped || "none noted"}
Student's own note: ${today.notes || "(no note written)"}

Today's tasks:
${taskLines || "(no tasks logged)"}

Today's block scores:
${blockLines || "(none logged today)"}

Recent days (most recent first):
${recentSummary || "(no prior history yet)"}

Write two short sections, plain text, no markdown headers:
1. REVIEW: 2-4 sentences reflecting on today specifically - what went
   well, what's concerning, referencing their actual numbers/tasks/note.
2. PLAN: 2-4 sentences of concrete guidance for tomorrow - what to
   prioritize, what to adjust, and any specific how-to-approach advice
   for the resources they used today (UWorld/Sketchy/B&B/Anki/etc.)
   relevant to what they logged.

Respond as JSON with exactly this shape, no extra text:
{"review": "...", "plan": "..."}
`.trim();
}
