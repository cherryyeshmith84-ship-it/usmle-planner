import { type Step1System } from "./qbankTypes";

/** One row of a "question-level feedback report" (e.g. an NBME CBSE/CCSE
 *  PDF that lists a content description, correct/incorrect, and a national
 *  percent-correct benchmark for every single question on the exam). */
export interface QuestionLevelItem {
  content_description: string;
  correct: boolean;
  national_pct: number | null;
}

export interface ContentAreaStat {
  system: Step1System | null;
  subtopic: string;
  correct: number;
  total: number;
  percent: number;
  /** Average "national % correct" difficulty benchmark across every question
   *  filed under this exact content description in this report, if given. */
  national_pct: number | null;
}

/** Keyed by the verbatim content-description string (e.g. "Diagnosis:
 *  Cardiovascular system: diseases of the myocardium") - this is the
 *  "question level" granularity itself, one entry per named topic rather
 *  than one entry per broad system. */
export type ContentBreakdown = Record<string, ContentAreaStat>;

/**
 * Maps a report's raw top-level category label (e.g. "Cardiovascular
 * system", "Immune System", "Biostat, Epi, Population Health, Lit Interp")
 * onto Master Grid's canonical 14-system list (lib/qbankTypes.ts
 * STEP1_SYSTEMS). NBME question-level reports use their own category labels
 * that don't exactly match STEP1_SYSTEMS, so this does the same kind of
 * mapping the AI does for image score reports, but as plain deterministic
 * string matching - these are hundreds of exact-text rows to classify, not
 * a single image to interpret, so a keyword match is both more reliable and
 * far cheaper than asking an AI to categorize every row itself.
 *
 * "Immune System" and "Pregnancy/childbirth/puerperium" aren't separate
 * entries in the official 14-system list - NBME folds immune-system content
 * into Blood & Lymphoreticular, and pregnancy content into Female
 * Reproductive System & Breast, so this mirrors that.
 */
export function mapToStep1System(rawLabel: string): Step1System | null {
  const s = rawLabel.toLowerCase();
  const isFemale = s.includes("female");

  if (s.includes("behavioral health") || s.includes("nervous system")) {
    return "Behavioral Health & Nervous Systems/Special Senses";
  }
  if (s.includes("biostat") || s.includes("epidemiology") || s.includes("population health") || s.includes("lit interp")) {
    return "Biostatistics & Epidemiology/Population Health";
  }
  if (s.includes("blood") || s.includes("lymphoreticular") || s.includes("immune system")) {
    return "Blood & Lymphoreticular System";
  }
  if (s.includes("cardiovascular")) return "Cardiovascular System";
  if (s.includes("endocrine")) return "Endocrine System";
  if (isFemale || s.includes("pregnancy") || s.includes("childbirth") || s.includes("puerperium")) {
    return "Female Reproductive System & Breast";
  }
  if (s.includes("gastrointestinal")) return "Gastrointestinal System";
  if (s.includes("general principles")) return "General Principles of Foundational Science";
  // Checked after the female/pregnancy branch above since "female" contains
  // the substring "male" - order matters here.
  if (s.includes("male")) return "Male Reproductive System";
  if (s.includes("multisystem")) return "Multisystem Processes & Disorders";
  if (s.includes("musculoskeletal") || s.includes("skin")) return "Musculoskeletal, Skin & Subcutaneous Tissue";
  if (s.includes("renal") || s.includes("urinary")) return "Renal & Urinary System";
  if (s.includes("respiratory")) return "Respiratory System";
  if (s.includes("social sciences")) return "Social Sciences (Ethics/Legal/Communication)";
  return null;
}

/**
 * Splits "Diagnosis: Cardiovascular system: diseases of the myocardium"
 * into its raw top-level label ("Cardiovascular system") and the more
 * specific subtopic after it ("diseases of the myocardium"). Handles labels
 * with more than two colons (e.g. "Gen Principle: Biostat, Epi, Population
 * Health, Lit Interp: correlation and regression") by treating everything
 * between the first and second colon as the system, and everything after
 * as the subtopic - the exact structure NBME question-level reports use.
 */
export function splitContentDescription(desc: string): { rawSystem: string; subtopic: string } {
  const parts = desc.split(":").map((p) => p.trim());
  if (parts.length < 3) {
    return { rawSystem: parts[0] ?? desc, subtopic: parts.slice(1).join(": ") || desc };
  }
  return { rawSystem: parts[1], subtopic: parts.slice(2).join(": ") };
}

/**
 * Aggregates the raw per-question rows a question-level PDF is parsed into:
 * - systemBreakdown: percent correct per canonical Step1 system, in the
 *   exact same shape used everywhere else in Master Grid, so this report
 *   type slots straight into the existing weakest/strongest-systems and
 *   trend logic without any extra plumbing.
 * - contentBreakdown: percent correct per exact content-description string
 *   - the "question level" granularity itself (e.g. specifically "diseases
 *   of the myocardium" within Cardio, not just Cardio overall) - used to
 *   call out specific weak spots and to compare the same named topic
 *   across two different report uploads over time.
 */
export function aggregateQuestionLevelItems(items: QuestionLevelItem[]): {
  systemBreakdown: Record<string, number>;
  contentBreakdown: ContentBreakdown;
} {
  const systemTally: Record<string, { correct: number; total: number }> = {};
  const contentTally: Record<
    string,
    { correct: number; total: number; system: Step1System | null; subtopic: string; nationalSum: number; nationalCount: number }
  > = {};

  for (const item of items) {
    const { rawSystem, subtopic } = splitContentDescription(item.content_description);
    const system = mapToStep1System(rawSystem);

    if (system) {
      const t = systemTally[system] ?? { correct: 0, total: 0 };
      t.total += 1;
      if (item.correct) t.correct += 1;
      systemTally[system] = t;
    }

    const key = item.content_description;
    const c = contentTally[key] ?? { correct: 0, total: 0, system, subtopic, nationalSum: 0, nationalCount: 0 };
    c.total += 1;
    if (item.correct) c.correct += 1;
    if (typeof item.national_pct === "number") {
      c.nationalSum += item.national_pct;
      c.nationalCount += 1;
    }
    contentTally[key] = c;
  }

  const systemBreakdown: Record<string, number> = {};
  for (const [system, t] of Object.entries(systemTally)) {
    systemBreakdown[system] = Math.round((t.correct / t.total) * 100);
  }

  const contentBreakdown: ContentBreakdown = {};
  for (const [key, c] of Object.entries(contentTally)) {
    contentBreakdown[key] = {
      system: c.system,
      subtopic: c.subtopic,
      correct: c.correct,
      total: c.total,
      percent: Math.round((c.correct / c.total) * 100),
      national_pct: c.nationalCount > 0 ? Math.round(c.nationalSum / c.nationalCount) : null,
    };
  }

  return { systemBreakdown, contentBreakdown };
}

export interface ContentAreaComparison {
  key: string;
  subtopic: string;
  system: Step1System | null;
  previousPercent: number;
  currentPercent: number;
  delta: number;
}

/**
 * Compares two question-level reports' contentBreakdown by exact
 * content-description match, so a student who uploads a second
 * question-level report later sees exactly which named topics they
 * improved on vs declined on - not just a system-level number. Sorted most
 * declined first.
 */
export function compareContentBreakdowns(
  previous: ContentBreakdown,
  current: ContentBreakdown
): ContentAreaComparison[] {
  const out: ContentAreaComparison[] = [];
  for (const [key, cur] of Object.entries(current)) {
    const prev = previous[key];
    if (!prev) continue;
    out.push({
      key,
      subtopic: cur.subtopic,
      system: cur.system,
      previousPercent: prev.percent,
      currentPercent: cur.percent,
      delta: cur.percent - prev.percent,
    });
  }
  return out.sort((a, b) => a.delta - b.delta);
}
