import type { ErrorType, QBankQuestionType, QuestionDifficulty } from "./qbankTypes";

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
  daily_question_goal?: number | null;
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
  // Student-entered link to a specific mentor (by the mentor's email) -
  // gives that mentor access to this student's planner/analysis/etc.
  // immediately, without needing a booked session or a message first. See
  // is_mentor_of_student() in Postgres, which checks this alongside the
  // older booking/message paths.
  mentor_email?: string | null;
  // Same idea as mentor_email, but for a Tutor/Mentor+Tutor row instead -
  // kept as a fully separate field (not reused) so a student's mentoring
  // relationship and tutoring relationship can be with two different
  // people, and each professional's dashboard only ever shows their own
  // linked students, never the other's.
  tutor_email?: string | null;
  // Free-text status the student sets for their own mentor to see - not
  // tied to a specific day, just "the latest thing I want my mentor to
  // know" (e.g. "Feeling behind on Biochem this week"). Editable from
  // Settings and the Home dashboard (see components/StatusUpdateCard.tsx).
  status_update?: string | null;
  status_updated_at?: string | null;
  // Whether this student has finished or skipped the in-app tutorial
  // (components/OnboardingTour.tsx) - once true, it never shows again.
  tutorial_completed?: boolean;
  // Admin-only flag that pulls this student out of every mentor's
  // self-service Waiting list (app/mentorship/waiting/page.tsx) without
  // assigning them a mentor - e.g. a spam/test signup, or someone the
  // admin wants to route by hand instead of leaving open for any mentor to
  // self-claim. Toggled from the admin dashboard's "Waiting for a mentor"
  // list (see components/WaitingVisibilityToggle.tsx). Never affects
  // anything else - a hidden student still shows up normally everywhere
  // else in the admin UI, and still gets a mentor exactly the same way
  // (manual assignment or, once un-hidden, mentor self-claim).
  waiting_hidden?: boolean;
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
  // Optional image shown alongside this specific choice - e.g. an EKG strip
  // or histology slide that IS the answer choice, not just the question.
  image_url?: string | null;
  // Optional short explanation for just this choice (e.g. "A is incorrect
  // because..."), shown in the explanation section right next to this
  // choice's letter and image - not buried in one big shared paragraph.
  rationale?: string | null;
  // "Error DNA" fields - only meaningful on wrong choices. A short mnemonic
  // note plus tagging used to spot patterns in what a student tends to
  // confuse. Mirrors QBankChoice in lib/qbankTypes.ts.
  error_note?: string | null;
  error_type?: ErrorType | string | null;
  confused_with?: string | null;
  weak_concept?: string | null;
  // Correct-choice-only field - the one-line "why this is right" takeaway.
  key_concept?: string | null;
}

// Extra per-question editor fields, mirroring QBankQuestionMeta in
// lib/qbankTypes.ts (minus the draft/review/publish status, which doesn't
// apply here - a whole assessment is saved as one unit, not per question).
export interface AssessmentQuestionMeta {
  educational_objective?: string;
  key_takeaway?: string;
  exam_trap?: string;
  topic?: string;
  subtopic?: string;
  primary_concept?: string;
  // Comma-separated free text (kept as a plain string here, rather than an
  // array, since it's edited inline per-question in a long form).
  secondary_concepts?: string;
  difficulty?: QuestionDifficulty;
  question_type?: QBankQuestionType | string;
  // Optional table-style answer choices - mirrors
  // QBankQuestionMeta.answer_table_columns in lib/qbankTypes.ts. When set,
  // each choice's `text` is interpreted as pipe- ("|") separated cell
  // values in this column order and rendered as a table with these names
  // as headers, instead of a plain answer-choice list.
  answer_table_columns?: string[];
}

export interface AssessmentQuestion {
  id: string;
  question: string;
  // Optional image shown alongside the question stem - e.g. a lab-value
  // table, X-ray, ECG, or histology slide that doesn't work as plain text.
  question_image_url?: string | null;
  choices: AssessmentChoice[];
  correct_choice_id: string;
  explanation: string;
  // Optional image shown alongside the explanation (after the student
  // answers), same idea as question_image_url.
  explanation_image_url?: string | null;
  meta?: AssessmentQuestionMeta | null;
}

export type AssessmentKind = "self_assessment" | "qbank";

export interface Assessment {
  id: string;
  name: string;
  // "self_assessment" (default): one attempt only, like a real exam.
  // "qbank": retakeable practice - shows up under the Question Bank tab.
  kind?: AssessmentKind;
  // Exam is split into blocks: questions_per_block questions each, with
  // block_time_minutes to complete each block (like an NBME-style exam).
  questions_per_block: number;
  block_time_minutes: number;
  // Shared break pool for the whole exam (minutes) - only usable between
  // blocks, can be split across multiple breaks.
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
  // Map of question id -> chosen choice id
  answers: Record<string, string>;
  score_correct: number;
  score_total: number;
  // Map of question id -> approx. seconds spent on that question.
  question_seconds?: Record<string, number>;
  created_at?: string;
}
