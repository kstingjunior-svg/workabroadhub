/**
 * Kenya Careers vacancy validation (2026-10, School Recruitment Portal).
 *
 * Pure functions — no DB — so they are unit-tested in
 * tests/api/vacancy-validation.test.ts and shared by create + edit.
 */

export const VACANCY_STATUSES = ["open", "draft", "paused", "closed"] as const;
export type VacancyStatus = (typeof VACANCY_STATUSES)[number];

export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "temporary", "internship", "casual"] as const;
export const EXPERIENCE_LEVELS = ["entry", "mid", "senior", "any"] as const;
export const ROLE_CATEGORIES = ["teaching", "leadership", "administration", "finance", "ict", "library", "health", "support", "other"] as const;
export const APPLICATION_METHODS = ["platform", "email", "url"] as const;
export const SCHOOL_LEVELS = ["ecde", "primary", "junior_secondary", "senior_secondary", "tvet", "college", "university", "special_needs"] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface VacancyInput {
  title?: unknown; department?: unknown; vacancies?: unknown;
  employmentType?: unknown; experienceLevel?: unknown; category?: unknown;
  salaryMin?: unknown; salaryMax?: unknown;
  requirements?: unknown; responsibilities?: unknown; credentials?: unknown;
  deadline?: unknown; county?: unknown; town?: unknown; branchId?: unknown;
  roleCategory?: unknown; subjects?: unknown; teachingLevel?: unknown;
  tscRequired?: unknown; startDate?: unknown; accommodation?: unknown;
  applicationMethod?: unknown; applicationContact?: unknown;
  status?: unknown;
}

export interface CleanVacancy {
  title: string; department: string | null; vacancies: number;
  employmentType: string; experienceLevel: string; category: string;
  salaryMin: number | null; salaryMax: number | null;
  requirements: string | null; responsibilities: string | null; credentials: string | null;
  deadline: string | null; county: string | null; town: string | null; branchId: string | null;
  roleCategory: string | null; subjects: string[] | null; teachingLevel: string | null;
  tscRequired: boolean | null; startDate: string | null; accommodation: boolean | null;
  applicationMethod: string; applicationContact: string | null;
  status: VacancyStatus;
}

export type FieldErrors = Record<string, string>;

const str = (v: unknown, max: number) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};
const isoDate = (v: unknown): string | null => {
  const s = String(v ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
};
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : NaN as any;
};
const bool = (v: unknown): boolean | null =>
  v === null || v === undefined || v === "" ? null : v === true || v === "true" || v === 1 || v === "1";

export function todayIso(now = new Date()): string {
  // Kenya is UTC+3 all year; a vacancy "expires" at the end of its deadline day in Kenya.
  const k = new Date(now.getTime() + 3 * 3600_000);
  return k.toISOString().slice(0, 10);
}

/** True when a published vacancy's deadline has passed (end of day, Kenya time). */
export function isExpired(deadline: string | Date | null | undefined, now = new Date()): boolean {
  if (!deadline) return false;
  const d = typeof deadline === "string" ? deadline.slice(0, 10) : new Date(deadline).toISOString().slice(0, 10);
  return d < todayIso(now);
}

/**
 * Validate + normalise a vacancy. `isSchool` turns on school rules:
 * deadline + description required when publishing, category forced to
 * "education", teacher fields kept. Drafts only need a title.
 */
export function validateVacancy(
  input: VacancyInput,
  opts: { isSchool: boolean; now?: Date },
): { ok: true; value: CleanVacancy } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const status = (VACANCY_STATUSES as readonly string[]).includes(String(input.status ?? ""))
    ? (String(input.status) as VacancyStatus) : "open";
  const publishing = status === "open";

  const title = str(input.title, 200);
  if (!title || title.length < 3) errors.title = "Enter a job title (at least 3 characters).";

  const employmentType = String(input.employmentType ?? "full_time");
  if (!(EMPLOYMENT_TYPES as readonly string[]).includes(employmentType)) errors.employmentType = "Choose an employment type.";
  const experienceLevel = String(input.experienceLevel ?? "any");
  if (!(EXPERIENCE_LEVELS as readonly string[]).includes(experienceLevel)) errors.experienceLevel = "Choose an experience level.";

  const vacanciesRaw = num(input.vacancies ?? 1);
  const vacancies = Number.isNaN(vacanciesRaw as number) || vacanciesRaw === null ? 1 : Math.max(1, Math.min(999, vacanciesRaw));

  const salaryMin = num(input.salaryMin);
  const salaryMax = num(input.salaryMax);
  if (Number.isNaN(salaryMin as number) || (salaryMin !== null && salaryMin < 0)) errors.salaryMin = "Enter a valid amount.";
  if (Number.isNaN(salaryMax as number) || (salaryMax !== null && salaryMax < 0)) errors.salaryMax = "Enter a valid amount.";
  if (salaryMin != null && salaryMax != null && !Number.isNaN(salaryMin) && !Number.isNaN(salaryMax) && salaryMax < salaryMin) {
    errors.salaryMax = "Maximum salary must be at least the minimum.";
  }

  const responsibilities = str(input.responsibilities, 6000);
  const requirements = str(input.requirements, 6000);
  const credentials = str(input.credentials, 500);
  const county = str(input.county, 60);
  const town = str(input.town, 80);

  const deadlineRaw = String(input.deadline ?? "").trim();
  const deadline = isoDate(deadlineRaw);
  if (deadlineRaw && !deadline) errors.deadline = "Enter a valid date.";
  if (publishing && deadline && deadline < todayIso(opts.now)) errors.deadline = "The deadline can't be in the past.";

  const startRaw = String(input.startDate ?? "").trim();
  const startDate = isoDate(startRaw);
  if (startRaw && !startDate) errors.startDate = "Enter a valid date.";

  const applicationMethod = (APPLICATION_METHODS as readonly string[]).includes(String(input.applicationMethod ?? "platform"))
    ? String(input.applicationMethod ?? "platform") : "platform";
  let applicationContact = str(input.applicationContact, 300);
  if (applicationMethod === "email") {
    if (!applicationContact || !EMAIL_RE.test(applicationContact)) errors.applicationContact = "Enter the email address applications should go to.";
    else applicationContact = applicationContact.toLowerCase();
  } else if (applicationMethod === "url") {
    if (!applicationContact || !/^https:\/\/[^\s]+\.[^\s]+/.test(applicationContact)) errors.applicationContact = "Enter a full link starting with https://";
  } else {
    applicationContact = null;
  }

  let roleCategory = str(input.roleCategory, 30);
  if (roleCategory && !(ROLE_CATEGORIES as readonly string[]).includes(roleCategory)) roleCategory = "other";

  let subjects: string[] | null = null;
  let teachingLevel: string | null = null;
  let tscRequired: boolean | null = null;
  let accommodation: boolean | null = null;
  let category = String(input.category ?? "other").trim().slice(0, 40) || "other";

  if (opts.isSchool) {
    category = "education";
    const arr = Array.isArray(input.subjects) ? input.subjects : typeof input.subjects === "string" ? input.subjects.split(",") : [];
    const cleaned = Array.from(new Set(arr.map((x) => String(x ?? "").trim().slice(0, 60)).filter(Boolean))).slice(0, 8);
    subjects = cleaned.length ? cleaned : null;
    const lvl = String(input.teachingLevel ?? "");
    teachingLevel = (SCHOOL_LEVELS as readonly string[]).includes(lvl) ? lvl : null;
    tscRequired = bool(input.tscRequired);
    accommodation = bool(input.accommodation);
    if (!roleCategory) roleCategory = subjects ? "teaching" : null;
    if (publishing) {
      if (!responsibilities || responsibilities.length < 20) errors.responsibilities = "Describe the role and responsibilities (at least 20 characters).";
      if (!county) errors.county = "Choose the county.";
      if (!deadline) errors.deadline = errors.deadline ?? "Set an application deadline.";
      if (roleCategory === "teaching" && !subjects) errors.subjects = "Pick at least one subject for a teaching role.";
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title: title!, department: str(input.department, 120), vacancies,
      employmentType, experienceLevel, category,
      salaryMin: salaryMin as number | null, salaryMax: salaryMax as number | null,
      requirements, responsibilities, credentials,
      deadline, county, town, branchId: str(input.branchId, 40),
      roleCategory, subjects, teachingLevel, tscRequired, startDate, accommodation,
      applicationMethod, applicationContact, status,
    },
  };
}

/** Allowed status transitions an employer may make on their own vacancy. */
export function canTransition(from: string, to: string): boolean {
  if (from === to) return true;
  const allowed: Record<string, string[]> = {
    draft:  ["open", "closed"],
    open:   ["paused", "closed", "draft"],
    paused: ["open", "closed"],
    closed: ["open", "draft"], // re-open (e.g. re-advertise) is allowed
  };
  return (allowed[from] ?? []).includes(to);
}
