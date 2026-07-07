export type PrepStage = "beginning" | "middle" | "end";

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
  email?: string | null;
  created_at?: string;
}

export interface TemplateTask {
  title: string;
  resource: string;
  target: string;
}

export interface ScheduleTemplate {
  id: string;
  name: string;
  stage: PrepStage;
  hour_goal: number | null;
  resource_tags: string[];
  remote_friendly: boolean;
  notes: string | null;
  tasks: TemplateTask[];
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
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
  created_at?: string;
  updated_at?: string;
}
