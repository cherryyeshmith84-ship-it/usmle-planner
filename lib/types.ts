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
  distance?: "near" | "far";
}

export interface AssessmentQuestion {
  id: string;
  question: string;
  choices: AssessmentChoice[];
  correct_choice_id: string;
  explanation: string;
}

export type AssessmentKind = "self_assessment" | "qbank";

export interface Assessment {
  id: string;
  name: string;
  // "self_assessment" (default): one attempt only, like a real exam.
  // "qbank": retakeable practice - shows up under the Question Bank tab.
  kind?: AssessmentKind;
  questions_per_block: number;
  block_time_minutes: number;
  break_minutes: number;
  questions: AssessmentQuestion[];
  // Admin-assigned identifier shown to students during the exam (like a
  // real NBME/UWorld "Test Id"). Optional - blank until an admin sets it.
  test_id?: string | null;
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
  answers: Record<string, string>;
  score_correct: number;
  score_total: number;
  question_seconds?: Record<string, number>;
  created_at?: string;
}
