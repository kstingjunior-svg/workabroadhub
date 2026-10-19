// 2026-10 (Tony: schools sourcing teachers via Kenya Careers).
// Shared lists for school registration, teacher vacancy posting and display.
// Values must match server VALID_SCHOOL_LEVELS / VALID_SCHOOL_OWNERSHIP.

export const SCHOOL_LEVELS: { value: string; label: string }[] = [
  { value: "ecde",             label: "ECDE / Pre-primary" },
  { value: "primary",          label: "Primary (Grades 1–6)" },
  { value: "junior_secondary", label: "Junior School (Grades 7–9)" },
  { value: "senior_secondary", label: "Senior / Secondary School" },
  { value: "tvet",             label: "TVET / Technical Institute" },
  { value: "college",          label: "College" },
  { value: "university",       label: "University" },
  { value: "special_needs",    label: "Special Needs School" },
];

export const SCHOOL_OWNERSHIP: { value: string; label: string }[] = [
  { value: "private",       label: "Private" },
  { value: "public",        label: "Public" },
  { value: "faith_based",   label: "Faith-based / Mission" },
  { value: "international", label: "International" },
  { value: "community",     label: "Community" },
];

// Kenyan subjects across CBC (ECDE → Senior School) and 8-4-4.
export const TEACHING_SUBJECTS: string[] = [
  "Mathematics", "English", "Kiswahili", "Biology", "Chemistry", "Physics",
  "Integrated Science", "Geography", "History & Government", "Social Studies",
  "CRE", "IRE", "HRE", "Business Studies", "Agriculture", "Computer Studies / ICT",
  "Pre-Technical Studies", "Home Science", "Creative Arts & Sports",
  "Physical Education", "Music", "Art & Design", "French", "German", "Arabic",
  "Mandarin", "Kenya Sign Language", "Life Skills", "Special Needs Education",
  "Lower Primary (all subjects)", "Upper Primary (all subjects)",
  "Early Years / ECDE", "Technical & Vocational", "Guidance & Counselling",
];

export const schoolLevelLabel = (v?: string | null) =>
  SCHOOL_LEVELS.find((l) => l.value === v)?.label ?? v ?? "";
export const ownershipLabel = (v?: string | null) =>
  SCHOOL_OWNERSHIP.find((o) => o.value === v)?.label ?? v ?? "";

export const KENYA_COUNTIES = [
  "Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo-Marakwet", "Embu", "Garissa",
  "Homa Bay", "Isiolo", "Kajiado", "Kakamega", "Kericho", "Kiambu", "Kilifi",
  "Kirinyaga", "Kisii", "Kisumu", "Kitui", "Kwale", "Laikipia", "Lamu",
  "Machakos", "Makueni", "Mandera", "Marsabit", "Meru", "Migori", "Mombasa",
  "Murang'a", "Nairobi", "Nakuru", "Nandi", "Narok", "Nyamira", "Nyandarua",
  "Nyeri", "Samburu", "Siaya", "Taita-Taveta", "Tana River", "Tharaka-Nithi",
  "Trans Nzoia", "Turkana", "Uasin Gishu", "Vihiga", "Wajir", "West Pokot",
];
