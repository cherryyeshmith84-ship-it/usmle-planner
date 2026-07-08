export type PrepStage = "beginning" | "middle" | "end";

export type ExamTrack = "step1" | "subject";

export type ActivePlanSource = "coach" | "own";

export type TaskStatus = "pending" | "done" | "skipped";

export interface StudyTask {
  id: string;
  title: string;
  resource: string;
  target: string;
  status: TaskStatus;
}

export interface Profile {
  id: string;
  full_name: string | null;
  exam_date: string | null;
  prep_stage: PrepStage | null;
  daily_hour_goal: number | null;
  resources: string[] | null;
  ai_instructions: string | null;
  is_admin?: boolean;
  assigned_template_id?: string | null;
  assigned_template_start_date?: string | null;
  email?: string | null;
  created_at?: string;
  onboarding_completed?: boolean;
  exam_track?: ExamTrack | null;
  subject_name?: string | null;
  completed_so_far?: string | null;
  weak_areas?: string | null;
  strong_areas?: string | null;
  goals_notes?: string | null;
  track_changed_pending?: boolean;
  active_plan_source?: ActivePlanSource;
}

export interface TemplateTask {
  title: string;
  resource: string;
  target: string;
}

export interface TemplateDay {
  day_number: number;
  tasks: TemplateTask[];
}

export interface ScheduleTemplate {
  id: string;
  name: string;
  stage: PrepStage;
  hour_goal: number | null;
  resource_tags: string[];
  remote_friendly: boolean;
  notes: string | null;
  // Legacy templates store a flat TemplateTask[] (one repeating day).
  // Newer templates store a TemplateDay[] (day-by-day sequence).
  // Use lib/templateDays.ts helpers to read this safely either way.
  tasks: TemplateTask[] | TemplateDay[];
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  exam_track?: ExamTrack;
  subject_name?: string | null;
}

export interface PersonalTemplate {
  user_id: string;
  name: string;
  // Same day-by-day sequence shape as ScheduleTemplate.tasks.
  tasks: TemplateTask[] | TemplateDay[];
  start_date: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface BlockScore {
  id: string;
  resource: string;
  question_count: number;
  percent_correct: number;
}

export interface CoachMessage {
  id: string;
  student_id: string;
  sender: "coach" | "student";
  body: string;
  created_at: string;
}

export interface AiFeedback {
  review: string;
  plan: string;
  generated_at: string;
}

export interface DailyLog {
  id: string;
  user_id: string;
  log_date: string;
  tasks: StudyTask[];
  hours_studied: number | null;
  topics_skipped: string | null;
  notes: string | null;
  rating: number | null;
  marked_complete: boolean;
  ai_feedback: AiFeedback | null;
  block_scores: BlockScore[];
  created_at?: string;
  updated_at?: string;
}

export interface AssessmentChoice {
  id: string;
  text: string;
  // Only meaningful for choices that are NOT the correct answer.
  // "near" = a close, plausible distractor (tests fine discrimination).
  // "far"/unset = an unrelated, easily-ruled-out distractor.
  distance?: "near" | "far";
}

export interface AssessmentQuestion {
  id: string;
  question: string;
  choices: AssessmentChoice[];
  correct_choice_id: string;
  explanation: string;
}

export interface Assessment {
  id: string;
  name: string;
  // Exam is split into blocks: questions_per_block questions each, with
  // block_time_minutes to complete each block (like an NBME-style exam).
  questions_per_block: number;
  block_time_minutes: number;
  // Shared break pool for the whole exam (minutes) - only usable between
  // blocks, can be split across multiple breaks.
  break_minutes: number;
  questions: AssessmentQuestion[];
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AssessmentAttempt {
  id: string;
  assessment_id: string;
  user_id: string;
  started_at: string;
  submitted_at: string | null;
  // Map of question id -> chosen choice id
  answers: Record<string, string>;
  score_correct: number;
  score_total: number;
  // Map of question id -> approx. seconds spent on that question.
  question_seconds?: Record<string, number>;
  created_at?: string;
}
