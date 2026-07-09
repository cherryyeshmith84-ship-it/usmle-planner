// Standard adult USMLE reference ranges (conventional units, with SI in
// parentheses where commonly tested). Not a substitute for an authoritative
// lab-values table - actual lab ranges vary by assay/lab.
export interface LabValue {
  category: string;
  test: string;
  range: string;
}

export const LAB_VALUES: LabValue[] = [
  // Electrolytes
  { category: "Electrolytes", test: "Sodium (Na+)", range: "136-146 mEq/L (136-146 mmol/L)" },
  { category: "Electrolytes", test: "Potassium (K+)", range: "3.5-5.0 mEq/L (3.5-5.0 mmol/L)" },
  { category: "Electrolytes", test: "Chloride (Cl-)", range: "95-105 mEq/L (95-105 mmol/L)" },
  { category: "Electrolytes", test: "Bicarbonate (HCO3-)", range: "22-28 mEq/L (22-28 mmol/L)" },

  // General chemistry
  { category: "General Chemistry", test: "Urea nitrogen (BUN)", range: "7-18 mg/dL (2.5-6.4 mmol/L)" },
  { category: "General Chemistry", test: "Creatinine", range: "0.6-1.2 mg/dL (53-106 umol/L)" },
  { category: "General Chemistry", test: "Glucose, fasting", range: "70-100 mg/dL (3.8-5.6 mmol/L)" },
  { category: "General Chemistry", test: "Glucose, random (non-fasting)", range: "<140 mg/dL (<7.77 mmol/L)" },
  { category: "General Chemistry", test: "Calcium", range: "8.4-10.2 mg/dL (2.1-2.6 mmol/L)" },
  { category: "General Chemistry", test: "Magnesium (Mg2+)", range: "1.5-2.0 mEq/L (0.75-1.0 mmol/L)" },
  { category: "General Chemistry", test: "Phosphorus (inorganic)", range: "3.0-4.5 mg/dL (1.0-1.5 mmol/L)" },

  // Hepatic
  { category: "Hepatic", test: "ALT", range: "10-40 U/L" },
  { category: "Hepatic", test: "AST", range: "12-38 U/L" },
  { category: "Hepatic", test: "Alkaline phosphatase", range: "25-100 U/L" },
  { category: "Hepatic", test: "Bilirubin, total", range: "0.1-1.0 mg/dL (2-17 umol/L)" },
  { category: "Hepatic", test: "Bilirubin, direct", range: "0.0-0.3 mg/dL (0-5 umol/L)" },
  { category: "Hepatic", test: "Proteins, total", range: "6.0-7.8 g/dL (60-78 g/L)" },
  { category: "Hepatic", test: "Albumin", range: "3.5-5.5 g/dL (35-55 g/L)" },
  { category: "Hepatic", test: "Globulin", range: "2.3-3.5 g/dL (23-35 g/L)" },

  // Other serum
  { category: "Other Serum", test: "Amylase", range: "25-125 U/L" },
  { category: "Other Serum", test: "Lipase", range: "13-60 U/L" },
  { category: "Other Serum", test: "Creatinine clearance, male", range: "97-137 mL/min" },
  { category: "Other Serum", test: "Creatinine clearance, female", range: "88-128 mL/min" },
  { category: "Other Serum", test: "Creatine kinase, male", range: "25-90 U/L" },
  { category: "Other Serum", test: "Creatine kinase, female", range: "10-70 U/L" },
  { category: "Other Serum", test: "Lactate dehydrogenase", range: "45-200 U/L" },
  { category: "Other Serum", test: "Osmolality", range: "275-295 mOsmol/kg H2O" },
  { category: "Other Serum", test: "Troponin I", range: "<=0.04 ng/mL (<=0.04 ug/L)" },
  { category: "Other Serum", test: "Uric acid", range: "3.0-8.2 mg/dL (0.18-0.48 mmol/L)" },

  // Lipids
  { category: "Lipids", test: "Cholesterol, total (normal)", range: "<200 mg/dL (<5.2 mmol/L)" },
  { category: "Lipids", test: "Cholesterol, total (high)", range: ">240 mg/dL (>6.2 mmol/L)" },
  { category: "Lipids", test: "HDL", range: "40-60 mg/dL (1.0-1.6 mmol/L)" },
  { category: "Lipids", test: "LDL", range: "<160 mg/dL (<4.2 mmol/L)" },
  { category: "Lipids", test: "Triglycerides (normal)", range: "<150 mg/dL (<1.70 mmol/L)" },
  { category: "Lipids", test: "Triglycerides (borderline)", range: "151-199 mg/dL (1.71-2.25 mmol/L)" },

  // Iron studies
  { category: "Iron Studies", test: "Ferritin, male", range: "20-250 ng/mL (20-250 ug/L)" },
  { category: "Iron Studies", test: "Ferritin, female", range: "10-120 ng/mL (10-120 ug/L)" },
  { category: "Iron Studies", test: "Iron, male", range: "65-175 ug/dL (11.6-31.3 umol/L)" },
  { category: "Iron Studies", test: "Iron, female", range: "50-170 ug/dL (9.0-30.4 umol/L)" },
  { category: "Iron Studies", test: "Total iron-binding capacity", range: "250-400 ug/dL (44.8-71.6 umol/L)" },
  { category: "Iron Studies", test: "Transferrin", range: "200-360 mg/dL (2.0-3.6 g/L)" },

  // Endocrine
  { category: "Endocrine", test: "FSH, male", range: "4-25 mIU/mL" },
  { category: "Endocrine", test: "FSH, female (premenopause)", range: "4-30 mIU/mL" },
  { category: "Endocrine", test: "FSH, female (midcycle peak)", range: "10-90 mIU/mL" },
  { category: "Endocrine", test: "FSH, female (postmenopause)", range: "40-250 mIU/mL" },
  { category: "Endocrine", test: "LH, male", range: "6-23 mIU/mL" },
  { category: "Endocrine", test: "LH, female (follicular)", range: "5-30 mIU/mL" },
  { category: "Endocrine", test: "LH, female (midcycle)", range: "75-150 mIU/mL" },
  { category: "Endocrine", test: "LH, female (postmenopause)", range: "30-200 mIU/mL" },
  { category: "Endocrine", test: "Growth hormone, fasting", range: "<5 ng/mL" },
  { category: "Endocrine", test: "Growth hormone, provocative stimuli", range: ">7 ng/mL" },
  { category: "Endocrine", test: "Prolactin, male", range: "<17 ng/mL" },
  { category: "Endocrine", test: "Prolactin, female", range: "<25 ng/mL" },
  { category: "Endocrine", test: "Cortisol, 0800h", range: "5-23 ug/dL (138-635 nmol/L)" },
  { category: "Endocrine", test: "Cortisol, 1600h", range: "3-15 ug/dL (82-413 nmol/L)" },
  { category: "Endocrine", test: "Cortisol, 2000h", range: "<50% of 0800h value" },
  { category: "Endocrine", test: "TSH", range: "0.4-4.0 uU/mL" },
  { category: "Endocrine", test: "Triiodothyronine (T3), RIA", range: "100-200 ng/dL (1.5-3.1 nmol/L)" },
  { category: "Endocrine", test: "T3 resin uptake", range: "25%-35%" },
  { category: "Endocrine", test: "Thyroxine (T4)", range: "5-12 ug/dL (64-155 nmol/L)" },
  { category: "Endocrine", test: "Free T4", range: "0.9-1.7 ng/dL (12.0-21.9 pmol/L)" },
  { category: "Endocrine", test: "Thyroidal iodine (123I) uptake", range: "8%-30% of dose/24h" },
  { category: "Endocrine", test: "Intact PTH", range: "10-60 pg/mL" },
  { category: "Endocrine", test: "17-Hydroxycorticosteroids, male", range: "3.0-10.0 mg/24h" },
  { category: "Endocrine", test: "17-Hydroxycorticosteroids, female", range: "2.0-8.0 mg/24h" },
  { category: "Endocrine", test: "17-Ketosteroids total, male", range: "8-20 mg/24h" },
  { category: "Endocrine", test: "17-Ketosteroids total, female", range: "6-15 mg/24h" },
  { category: "Endocrine", test: "Hemoglobin A1c", range: "<=6% (<=42 mmol/mol)" },

  // Immunoglobulins
  { category: "Immunoglobulins", test: "IgA", range: "76-390 mg/dL" },
  { category: "Immunoglobulins", test: "IgE", range: "0-380 IU/mL" },
  { category: "Immunoglobulins", test: "IgG", range: "650-1500 mg/dL" },
  { category: "Immunoglobulins", test: "IgM", range: "50-300 mg/dL" },

  // Arterial blood gases
  { category: "Arterial Blood Gases (room air)", test: "PO2", range: "75-105 mmHg" },
  { category: "Arterial Blood Gases (room air)", test: "PCO2", range: "33-45 mmHg" },
  { category: "Arterial Blood Gases (room air)", test: "pH", range: "7.35-7.45" },

  // CSF
  { category: "Cerebrospinal Fluid", test: "Cell count", range: "0-5/mm3" },
  { category: "Cerebrospinal Fluid", test: "Chloride", range: "118-132 mEq/L" },
  { category: "Cerebrospinal Fluid", test: "Gamma globulin", range: "3%-12% of total proteins" },
  { category: "Cerebrospinal Fluid", test: "Glucose", range: "40-70 mg/dL" },
  { category: "Cerebrospinal Fluid", test: "Pressure", range: "70-180 mm H2O" },
  { category: "Cerebrospinal Fluid", test: "Proteins, total", range: "<40 mg/dL" },

  // CBC
  { category: "Hematologic - CBC", test: "Hematocrit, male", range: "41%-53%" },
  { category: "Hematologic - CBC", test: "Hematocrit, female", range: "36%-46%" },
  { category: "Hematologic - CBC", test: "Hemoglobin, male", range: "13.5-17.5 g/dL" },
  { category: "Hematologic - CBC", test: "Hemoglobin, female", range: "12.0-16.0 g/dL" },
  { category: "Hematologic - CBC", test: "MCH", range: "25-35 pg/cell" },
  { category: "Hematologic - CBC", test: "MCHC", range: "31%-36% Hb/cell" },
  { category: "Hematologic - CBC", test: "MCV", range: "80-100 um3 (fL)" },
  { category: "Hematologic - CBC", test: "Plasma volume, male", range: "25-43 mL/kg" },
  { category: "Hematologic - CBC", test: "Plasma volume, female", range: "28-45 mL/kg" },
  { category: "Hematologic - CBC", test: "Red cell volume, male", range: "20-36 mL/kg" },
  { category: "Hematologic - CBC", test: "Red cell volume, female", range: "19-31 mL/kg" },
  { category: "Hematologic - CBC", test: "Leukocyte count (WBC)", range: "4500-11,000/mm3" },
  { category: "Hematologic - CBC", test: "Neutrophils, segmented", range: "54%-62%" },
  { category: "Hematologic - CBC", test: "Neutrophils, bands", range: "3%-5%" },
  { category: "Hematologic - CBC", test: "Lymphocytes", range: "25%-33%" },
  { category: "Hematologic - CBC", test: "Monocytes", range: "3%-7%" },
  { category: "Hematologic - CBC", test: "Eosinophils", range: "1%-3%" },
  { category: "Hematologic - CBC", test: "Basophils", range: "0%-0.75%" },
  { category: "Hematologic - CBC", test: "Platelet count", range: "150,000-400,000/mm3" },

  // Coagulation
  { category: "Coagulation", test: "PTT (aPTT), activated", range: "25-40 seconds" },
  { category: "Coagulation", test: "Prothrombin time (PT)", range: "11-15 seconds" },
  { category: "Coagulation", test: "D-Dimer", range: "<=250 ng/mL" },

  // Other hematologic
  { category: "Hematologic - Other", test: "Reticulocyte count", range: "0.5%-1.5%" },
  { category: "Hematologic - Other", test: "Erythrocyte count (RBC), male", range: "4.3-5.9 million/mm3" },
  { category: "Hematologic - Other", test: "Erythrocyte count (RBC), female", range: "3.5-5.5 million/mm3" },
  { category: "Hematologic - Other", test: "ESR (Westergren), male", range: "0-15 mm/h" },
  { category: "Hematologic - Other", test: "ESR (Westergren), female", range: "0-20 mm/h" },
  { category: "Hematologic - Other", test: "CD4+ T-lymphocyte count", range: ">=500/mm3" },

  // Urine
  { category: "Urine", test: "Calcium", range: "100-300 mg/24h" },
  { category: "Urine", test: "Osmolality", range: "50-1200 mOsmol/kg H2O" },
  { category: "Urine", test: "Oxalate", range: "8-40 ug/mL" },
  { category: "Urine", test: "Proteins, total", range: "<150 mg/24h" },

  // BMI
  { category: "Body Mass Index", test: "BMI, adult", range: "19-25 kg/m2" },
];
