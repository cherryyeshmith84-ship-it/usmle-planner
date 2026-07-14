// USMLE Step 1 discipline (subject) and organ system categories - the same
// breakdown the real exam and UWorld use. A question can be tagged with more
// than one subject and more than one system.
 
export const STEP1_SUBJECTS = [
  "Anatomy",
  "Behavioral Health",
  "Biochemistry & Nutrition",
  "Biostatistics & Epidemiology",
  "Embryology",
  "Genetics",
  "Histology & Cell Biology",
  "Immunology",
  "Microbiology",
  "Molecular Biology",
  "Pathology",
  "Pathophysiology",
  "Pharmacology",
  "Physiology",
  "Social Sciences (Ethics/Legal/Communication)",
] as const;
 
export const STEP1_SYSTEMS = [
  "Behavioral Health & Nervous Systems/Special Senses",
  "Biostatistics & Epidemiology/Population Health",
  "Blood & Lymphoreticular System",
  "Cardiovascular System",
  "Endocrine System",
  "Female Reproductive System & Breast",
  "Gastrointestinal System",
  "General Principles of Foundational Science",
  "Male Reproductive System",
  "Multisystem Processes & Disorders",
  "Musculoskeletal, Skin & Subcutaneous Tissue",
  "Renal & Urinary System",
  "Respiratory System",
  "Social Sciences (Ethics/Legal/Communication)",
] as const;
 
export type Step1Subject = (typeof STEP1_SUBJECTS)[number];
export type Step1System = (typeof STEP1_SYSTEMS)[number];
 
export interface QBankChoice {
  id: string;
  text: string;
  // Only meaningful for choices that are NOT the correct answer.
  // "near" = a close, plausible distractor (tests fine discrimination).
  // "far"/unset = an unrelated, easily-ruled-out distractor.
  distance?: "near" | "far";
}
 
export interface QBankQuestion {
  id: string;
  question: string;
  choices: QBankChoice[];
  correct_choice_id: string;
  explanation: string;
  subjects: string[];
  systems: string[];
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}
 
export type ExamModeOption = "test" | "tutor";
 
export interface QBankTestSession {
  id: string;
  user_id: string;
  mode: ExamModeOption;
  question_ids: string[];
  questions_per_block: number;
  subjects: string[];
  systems: string[];
  status_filter: string[];
  answers: Record<string, string>;
  question_seconds?: Record<string, number>;
  score_correct: number | null;
  score_total: number | null;
  started_at: string;
  submitted_at: string | null;
  // Resume-in-progress fields - let a refresh/reload pick back up exactly
  // where the student left off instead of restarting the test.
  current_block?: number;
  current_question_index?: number;
  revealed?: Record<string, boolean>;
  tutor_elapsed_seconds?: number;
  in_progress?: boolean;
}
 
export type QuestionStatus = "unused" | "correct" | "incorrect" | "omitted";
 
export interface QuestionStatusInfo {
  status: QuestionStatus;
  marked: boolean;
}
