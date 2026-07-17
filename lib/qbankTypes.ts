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

// Fixed dropdown options for the "Error DNA" fields on a wrong choice, and
// for the overall question's type - kept as plain string enums (not a
// separate lookup table/library) for this first pass of the editor.
export const ERROR_TYPES = [
  "Knowledge gap",
  "Mechanism confusion",
  "Diagnosis confusion",
  "Process-sequence confusion",
  "Location/compartment confusion",
  "Image recognition failure",
  "Question interpretation error",
  "Second-order reasoning failure",
  "Therapeutic-effect anchoring",
  "Calculation error",
] as const;
export type ErrorType = (typeof ERROR_TYPES)[number];

export const QUESTION_TYPES = [
  "Diagnosis",
  "Pathophysiology",
  "Mechanism of action",
  "Next best step",
  "Adverse effect",
  "Risk factor",
  "Anatomy",
  "Histology recognition",
  "Drug mechanism",
  "Drug toxicity",
  "Experimental interpretation",
] as const;
export type QBankQuestionType = (typeof QUESTION_TYPES)[number];

export const DIFFICULTY_LEVELS = ["easy", "moderate", "hard", "killer"] as const;
export type QuestionDifficulty = (typeof DIFFICULTY_LEVELS)[number];

// Admin publish workflow - separate from QuestionStatus below, which is a
// per-student "have I done this one" status, not an authoring state.
export type QuestionAdminStatus = "draft" | "under_review" | "published";

export interface QBankChoice {
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
  // note (e.g. "Acarbose -> carbs, Orlistat -> fats") plus tagging used to
  // spot patterns in what a student tends to confuse.
  error_note?: string | null;
  error_type?: ErrorType | string | null;
  confused_with?: string | null;
  weak_concept?: string | null;
  // Correct-choice-only field - the one-line "why this is right" takeaway.
  key_concept?: string | null;
}

// Extra Question Editor fields, kept in one flexible jsonb blob on the
// question row (see supabase/schema_v18_qbank_meta.sql) so adding more of
// these later doesn't need another database migration.
export interface QBankQuestionMeta {
  educational_objective?: string;
  key_takeaway?: string;
  exam_trap?: string;
  topic?: string;
  subtopic?: string;
  primary_concept?: string;
  // References concept_library.id. Set whenever Primary concept is chosen
  // via the Question Editor's Concept Library dropdown (added so Primary
  // concept can only ever be one of a fixed, deduped set of concepts -
  // free-typed values can no longer create near-duplicates). Older
  // questions tagged before this existed may have primary_concept set with
  // no matching id - that's expected and still works everywhere that reads
  // primary_concept as a string.
  primary_concept_id?: string;
  secondary_concepts?: string[];
  difficulty?: QuestionDifficulty;
  question_type?: QBankQuestionType | string;
  status?: QuestionAdminStatus;
}

export interface QBankQuestion {
  id: string;
  question: string;
  // Optional image shown alongside the question stem - e.g. a lab-value
  // table, X-ray, ECG, or histology slide that doesn't work as plain text.
  question_image_url?: string | null;
  choices: QBankChoice[];
  correct_choice_id: string;
  explanation: string;
  // Optional image shown alongside the explanation (after the student
  // answers), same idea as question_image_url.
  explanation_image_url?: string | null;
  subjects: string[];
  systems: string[];
  meta?: QBankQuestionMeta | null;
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
