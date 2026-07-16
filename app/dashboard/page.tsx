import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  AssessmentQuestion,
  BlockScore,
  CoachMessage,
  DailyLog,
  PersonalTemplate,
  Profile,
  ScheduleTemplate,
  TemplateTask,
} from "@/lib/types";
import type { QBankQuestion } from "@/lib/qbankTypes";
import { computePlanProgress, dayNumberFor, getTemplateDays, tasksForDay, type PlanProgress } from "@/lib/templateDays";
import { computeDashboardInsights, type QBankAnswerEvent } from "@/lib/masteryDashboard";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function computeStreak(logs: DailyLog[]): number {
  const doneDates = new Set(
    logs.filter((l) => l.marked_complete).map((l) => l.log_date)
  );
  let streak = 0;
  const cursor = new Date();
  if (!doneDates.has(cursor.toISOString().slice(0, 10))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  for (;;) {
    const d = cursor.toISOString().slice(0, 10);
    if (doneDates.has(d)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const profile = profileData as Profile | null;

  if (!profile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const today = todayStr();
  const activeSource = profile.active_plan_source || "coach";

  // Run every query that doesn't depend on another query's result at the
  // same time, instead of one after another - this is most of what was
  // making page loads feel slow.
  const [
    logsRes,
    assignedTemplateRes,
    personalTemplateRes,
    messagesRes,
    scoreRes,
    qbankSessionsRes,
    qbankQuestionsRes,
    assessmentAttemptsRes,
    assessmentsRes,
  ] = await Promise.all([
    supabase
      .from("daily_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("log_date", { ascending: false })
      .limit(30),
    profile.assigned_template_id
      ? supabase.from("schedule_templates").select("*").eq("id", profile.assigned_template_id).single()
      : Promise.resolve({ data: null } as any),
    activeSource === "own"
      ? supabase.from("personal_templates").select("*").eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null } as any),
    supabase.from("messages").select("*").eq("student_id", user.id).order("created_at", { ascending: true }),
    supabase.from("daily_logs").select("block_scores").eq("user_id", user.id),
    supabase
      .from("qbank_test_sessions")
      .select("answers, submitted_at")
      .eq("user_id", user.id)
      .not("submitted_at", "is", null),
    supabase.from("qbank_questions").select("*"),
    supabase
      .from("assessment_attempts")
      .select("answers, assessment_id")
      .eq("user_id", user.id)
      .not("submitted_at", "is", null),
    supabase.from("assessments").select("id, questions"),
  ]);

  const logs = (logsRes.data ?? []) as DailyLog[];
  const todayLog = logs.find((l) => l.log_date === today) ?? null;
  const streak = computeStreak(logs);

  let daysUntilExam: number | null = null;
  if (profile.exam_date) {
    const diff =
      (new Date(profile.exam_date).getTime() - new Date(today).getTime()) /
      (1000 * 60 * 60 * 24);
    daysUntilExam = Math.ceil(diff);
  }

  const assignedTemplate = (assignedTemplateRes.data as ScheduleTemplate) ?? null;
  const personalTemplate = (personalTemplateRes.data as PersonalTemplate) ?? null;

  const activeTemplate = activeSource === "own" ? personalTemplate : assignedTemplate;
  const activeStartDate =
    (activeSource === "own" ? personalTemplate?.start_date : profile.assigned_template_start_date) ||
    today;

  let templateDayTasks: TemplateTask[] | null = null;
  let dayInfo: { dayNumber: number; totalDays: number } | null = null;
  let planProgress: PlanProgress | null = null;
  if (activeTemplate) {
    const days = getTemplateDays(activeTemplate);
    if (days.length > 0) {
      const dayNumber = dayNumberFor(activeStartDate, today);
      templateDayTasks = tasksForDay(days, dayNumber);
      dayInfo = { dayNumber, totalDays: days.length };

      const { data: logsSinceStartData } = await supabase
        .from("daily_logs")
        .select("tasks")
        .eq("user_id", user.id)
        .gte("log_date", activeStartDate);
      planProgress = computePlanProgress(days, (logsSinceStartData ?? []) as { tasks: any[] }[]);
    }
  }

  const messagesData = messagesRes.data;
  const allBlockScores: BlockScore[] = (scoreRes.data ?? []).flatMap(
    (r: any) => (r.block_scores ?? []) as BlockScore[]
  );

  // Flatten every submitted Question Bank session into individual
  // question-answer events - this is what the mastery/opportunity math and
  // "today's questions" count are both built from.
  const qbankSessions = (qbankSessionsRes.data ?? []) as {
    answers: Record<string, string> | null;
    submitted_at: string | null;
  }[];
  const qbankQuestions = (qbankQuestionsRes.data ?? []) as QBankQuestion[];
  const questionById = new Map(qbankQuestions.map((q) => [q.id, q]));

  const qbankEvents: QBankAnswerEvent[] = [];
  for (const session of qbankSessions) {
    if (!session.submitted_at) continue;
    for (const [questionId, choiceId] of Object.entries(session.answers ?? {})) {
      if (!choiceId) continue;
      qbankEvents.push({ questionId, choiceId, submittedAt: session.submitted_at });
    }
  }

  // Self-assessment questions don't carry subjects/systems/Error DNA tags,
  // so they only fold into the plain "questions answered"/"accuracy" totals,
  // not the per-system mastery breakdown or the opportunity card.
  const assessmentAttempts = (assessmentAttemptsRes.data ?? []) as {
    answers: Record<string, string> | null;
    assessment_id: string;
  }[];
  const assessments = (assessmentsRes.data ?? []) as { id: string; questions: AssessmentQuestion[] }[];
  const assessmentCorrectById = new Map<string, string>();
  for (const a of assessments) {
    for (const q of a.questions ?? []) {
      assessmentCorrectById.set(q.id, q.correct_choice_id);
    }
  }
  let extraAnswered = 0;
  let extraCorrect = 0;
  for (const attempt of assessmentAttempts) {
    for (const [questionId, choiceId] of Object.entries(attempt.answers ?? {})) {
      const correctId = assessmentCorrectById.get(questionId);
      if (correctId === undefined || !choiceId) continue;
      extraAnswered++;
      if (choiceId === correctId) extraCorrect++;
    }
  }

  const insights = computeDashboardInsights(qbankEvents, questionById, extraAnswered, extraCorrect);
  const questionsAnsweredToday = qbankEvents.filter((e) => e.submittedAt.slice(0, 10) === today).length;
  const dailyQuestionGoal = profile.daily_question_goal ?? 20;

  return (
    <DashboardClient
      userId={user.id}
      profile={profile}
      todayLog={todayLog}
      recentLogs={logs}
      today={today}
      streak={streak}
      daysUntilExam={daysUntilExam}
      templateDayTasks={templateDayTasks}
      dayInfo={dayInfo}
      planProgress={planProgress}
      allBlockScores={allBlockScores}
      initialMessages={(messagesData ?? []) as CoachMessage[]}
      insights={insights}
      questionsAnsweredToday={questionsAnsweredToday}
      dailyQuestionGoal={dailyQuestionGoal}
    />
  );
}
