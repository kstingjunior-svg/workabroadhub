/**
 * Vacancy form (create + edit) — 2026-10 School Recruitment Portal.
 *
 * Steps: 1) form  2) preview  3) confirmation.
 * Shared by schools and companies; school-only fields appear when isSchool.
 * Server is the source of truth for validation (server/lib/vacancy-validation.ts);
 * field errors it returns are shown inline next to each field.
 */
import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Eye, ArrowLeft, CheckCircle2, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SCHOOL_LEVELS, TEACHING_SUBJECTS, KENYA_COUNTIES, schoolLevelLabel } from "@/lib/school-constants";

export interface VacancyBranch { id: string; name: string; county: string | null; town: string | null }
export interface VacancyInitial {
  id?: string; title?: string; department?: string | null; vacancies?: number;
  employmentType?: string | null; experienceLevel?: string | null; category?: string | null;
  salaryMin?: number | null; salaryMax?: number | null; deadline?: string | null;
  county?: string | null; town?: string | null; branch?: { id: string } | null;
  responsibilities?: string | null; requirements?: string | null; credentials?: string | null;
  roleCategory?: string | null; subjects?: string[] | null; teachingLevel?: string | null;
  tscRequired?: boolean | null; startDate?: string | null; accommodation?: boolean | null;
  applicationMethod?: string | null; applicationContact?: string | null; status?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  companyId: string;
  companyName: string;
  isSchool: boolean;
  pendingVerification: boolean;
  schoolLevels?: string[];
  branches: VacancyBranch[];
  defaultCounty?: string;
  defaultTown?: string;
  initial?: VacancyInitial | null;   // present = edit mode
}

const JOB_CATEGORIES = ["retail", "hospitality", "healthcare", "construction", "transport", "security", "cleaning", "education", "logistics", "other"];

export const ROLE_CATEGORY_LABEL: Record<string, string> = {
  teaching: "Teaching", leadership: "School leadership", administration: "Administration",
  finance: "Finance / Accounts", ict: "ICT", library: "Library", health: "Health / Nursing",
  support: "Support staff", other: "Other",
};

// Common school roles → title + category (spec list). Picking one pre-fills the form.
const SCHOOL_ROLE_PRESETS: { title: string; cat: string }[] = [
  { title: "Primary School Teacher", cat: "teaching" },
  { title: "Secondary School Teacher", cat: "teaching" },
  { title: "Mathematics & Science Teacher", cat: "teaching" },
  { title: "Languages Teacher", cat: "teaching" },
  { title: "Humanities Teacher", cat: "teaching" },
  { title: "ECDE Teacher", cat: "teaching" },
  { title: "Principal", cat: "leadership" },
  { title: "Deputy Principal", cat: "leadership" },
  { title: "Head of Department", cat: "leadership" },
  { title: "School Administrator", cat: "administration" },
  { title: "Secretary / Receptionist", cat: "administration" },
  { title: "Accountant / Bursar", cat: "finance" },
  { title: "ICT Officer", cat: "ict" },
  { title: "Librarian", cat: "library" },
  { title: "School Nurse", cat: "health" },
  { title: "Cook", cat: "support" },
  { title: "Driver", cat: "support" },
  { title: "Cleaner", cat: "support" },
  { title: "Matron / Patron", cat: "support" },
  { title: "Security Guard", cat: "support" },
];

const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time: "Full-time", part_time: "Part-time", contract: "Contract",
  temporary: "Temporary", internship: "Internship", casual: "Casual",
};
const EXPERIENCE_LABEL: Record<string, string> = { any: "Any", entry: "Entry level", mid: "Mid level", senior: "Senior" };

const toDate = (v?: string | null) => (v ? String(v).slice(0, 10) : "");

export function VacancyFormModal(props: Props) {
  const { open, onClose, onSaved, companyId, companyName, isSchool, pendingVerification, branches, initial } = props;
  const editing = !!initial?.id;

  const blank = useMemo(() => ({
    title: initial?.title ?? "",
    department: initial?.department ?? "",
    vacancies: String(initial?.vacancies ?? 1),
    employmentType: initial?.employmentType ?? "full_time",
    experienceLevel: initial?.experienceLevel ?? "any",
    category: initial?.category ?? (isSchool ? "education" : "other"),
    salaryMin: initial?.salaryMin != null ? String(initial.salaryMin) : "",
    salaryMax: initial?.salaryMax != null ? String(initial.salaryMax) : "",
    deadline: toDate(initial?.deadline),
    county: initial?.county ?? (isSchool ? props.defaultCounty ?? "" : ""),
    town: initial?.town ?? (isSchool ? props.defaultTown ?? "" : ""),
    branchId: initial?.branch?.id ?? "",
    responsibilities: initial?.responsibilities ?? "",
    requirements: initial?.requirements ?? "",
    credentials: initial?.credentials ?? "",
    roleCategory: initial?.roleCategory ?? (isSchool ? "teaching" : ""),
    subjects: initial?.subjects ?? [],
    teachingLevel: initial?.teachingLevel ?? (props.schoolLevels?.[0] ?? ""),
    tscRequired: initial?.tscRequired ?? (isSchool ? true : null),
    startDate: toDate(initial?.startDate),
    accommodation: initial?.accommodation ?? false,
    applicationMethod: initial?.applicationMethod ?? "platform",
    applicationContact: initial?.applicationContact ?? "",
  }), [initial, isSchool, props.defaultCounty, props.defaultTown, props.schoolLevels]);

  const [f, setF] = useState(blank);
  const [step, setStep] = useState<"form" | "preview" | "done">("form");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverMsg, setServerMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState<null | "draft" | "open">(null);
  const [doneInfo, setDoneInfo] = useState<{ status: string; message: string } | null>(null);

  useEffect(() => {
    if (open) { setF(blank); setStep("form"); setErrors({}); setServerMsg(null); setDoneInfo(null); setSaving(null); }
  }, [open, blank]);

  const set = (k: keyof typeof f, v: any) => {
    setF((cur) => ({ ...cur, [k]: v }));
    if (errors[k as string]) setErrors((e) => { const n = { ...e }; delete n[k as string]; return n; });
  };
  const toggleSubject = (s: string) =>
    set("subjects", f.subjects.includes(s) ? f.subjects.filter((x) => x !== s) : f.subjects.length >= 8 ? f.subjects : [...f.subjects, s]);

  // Client-side checks mirror the server so most mistakes are caught instantly.
  function clientValidate(publishing: boolean): Record<string, string> {
    const e: Record<string, string> = {};
    if (f.title.trim().length < 3) e.title = "Enter a job title (at least 3 characters).";
    if (!publishing) return e;
    if (isSchool) {
      if (f.responsibilities.trim().length < 20) e.responsibilities = "Describe the role and responsibilities (at least 20 characters).";
      if (!f.county) e.county = "Choose the county.";
      if (!f.deadline) e.deadline = "Set an application deadline.";
      if (f.roleCategory === "teaching" && f.subjects.length === 0) e.subjects = "Pick at least one subject for a teaching role.";
    }
    const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
    if (f.deadline && f.deadline < today) e.deadline = "The deadline can't be in the past.";
    if (f.salaryMin && f.salaryMax && Number(f.salaryMax) < Number(f.salaryMin)) e.salaryMax = "Maximum salary must be at least the minimum.";
    if (f.applicationMethod === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.applicationContact.trim())) e.applicationContact = "Enter the email address applications should go to.";
    if (f.applicationMethod === "url" && !/^https:\/\/[^\s]+\.[^\s]+/.test(f.applicationContact.trim())) e.applicationContact = "Enter a full link starting with https://";
    return e;
  }

  function toPreview() {
    const e = clientValidate(true);
    setErrors(e);
    setServerMsg(Object.keys(e).length ? "Please fix the highlighted fields." : null);
    if (!Object.keys(e).length) setStep("preview");
  }

  async function save(status: "draft" | "open") {
    if (saving) return; // prevents double submit
    const e = clientValidate(status === "open");
    if (Object.keys(e).length) { setErrors(e); setServerMsg("Please fix the highlighted fields."); setStep("form"); return; }
    setSaving(status);
    setServerMsg(null);
    try {
      const body = {
        ...f,
        vacancies: Number(f.vacancies || 1),
        salaryMin: f.salaryMin ? Number(f.salaryMin) : null,
        salaryMax: f.salaryMax ? Number(f.salaryMax) : null,
        branchId: f.branchId || null,
        roleCategory: f.roleCategory || null,
        teachingLevel: f.teachingLevel || null,
        startDate: f.startDate || null,
        deadline: f.deadline || null,
        status,
      };
      const res = await fetch(editing ? `/api/employer/jobs/${initial!.id}` : `/api/employer/companies/${companyId}/jobs`, {
        method: editing ? "PATCH" : "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.errors) setErrors(data.errors);
        setServerMsg(data?.message || `Could not save (${res.status}).`);
        setStep("form");
        return;
      }
      setDoneInfo({ status, message: data?.message || (status === "draft" ? "Draft saved." : "Vacancy saved.") });
      setStep("done");
    } catch {
      setServerMsg("Network problem — check your connection and try again. Nothing was lost.");
    } finally {
      setSaving(null);
    }
  }

  if (!open) return null;

  const Err = ({ k }: { k: string }) => errors[k] ? <p className="text-xs text-rose-600 mt-1" role="alert">{errors[k]}</p> : null;
  const fieldCls = (k: string) => (errors[k] ? "border-rose-500 focus-visible:ring-rose-500" : "");
  const selectCls = (k: string) => `w-full h-11 text-sm border rounded-md px-3 bg-background ${errors[k] ? "border-rose-500" : ""}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="vac-title">
      <div className="relative bg-background w-full sm:max-w-2xl max-h-[94vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl">
        <button aria-label="Close" className="absolute top-3 right-3 p-2 rounded-full hover:bg-muted text-muted-foreground" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>

        <div className="p-5 sm:p-7">
          {/* Step indicator */}
          <ol className="flex items-center gap-2 text-xs text-muted-foreground mb-4" aria-label="Progress">
            {["Details", "Preview", "Done"].map((label, i) => {
              const idx = step === "form" ? 0 : step === "preview" ? 1 : 2;
              return (
                <li key={label} className={`flex items-center gap-1.5 ${i <= idx ? "text-emerald-700 font-medium" : ""}`}>
                  <span className={`h-5 w-5 rounded-full grid place-items-center text-[11px] ${i <= idx ? "bg-emerald-600 text-white" : "bg-muted"}`}>{i + 1}</span>
                  {label}{i < 2 && <span className="mx-1 text-muted-foreground/50">›</span>}
                </li>
              );
            })}
          </ol>

          {step === "form" && (
            <>
              <h2 id="vac-title" className="font-bold text-xl leading-tight">{editing ? "Edit vacancy" : isSchool ? "Post a school vacancy" : "Post a job"}</h2>
              <p className="text-sm text-muted-foreground mt-1 mb-4">At <strong>{companyName}</strong>. Fields marked * are needed to publish.</p>
              {pendingVerification && (
                <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-sm p-3">
                  Your {isSchool ? "school" : "organisation"} is <strong>pending verification</strong>. You can prepare and save vacancies now — they'll appear publicly once we've verified you.
                </div>
              )}
              {serverMsg && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-sm p-3" role="alert">{serverMsg}</div>}

              <div className="space-y-4">
                {isSchool && !editing && (
                  <div>
                    <p className="text-sm font-medium mb-1.5">Quick start — pick a common role</p>
                    <div className="flex flex-wrap gap-1.5">
                      {SCHOOL_ROLE_PRESETS.map((p) => (
                        <button key={p.title} type="button"
                          onClick={() => { set("title", p.title); set("roleCategory", p.cat); }}
                          className={`text-xs px-2.5 py-1.5 rounded-full border transition ${f.title === p.title ? "bg-emerald-600 text-white border-emerald-600" : "bg-background hover:bg-muted"}`}>
                          {p.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="vf-title" className="text-sm font-medium block mb-1">Job title *</label>
                  <Input id="vf-title" className={`h-11 ${fieldCls("title")}`} value={f.title} onChange={(e) => set("title", e.target.value.slice(0, 200))} placeholder={isSchool ? "e.g. Mathematics & Physics Teacher" : "e.g. Cashier"} aria-invalid={!!errors.title} />
                  <Err k="title" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {isSchool ? (
                    <div>
                      <label htmlFor="vf-rcat" className="text-sm font-medium block mb-1">Type of role</label>
                      <select id="vf-rcat" className={selectCls("roleCategory")} value={f.roleCategory} onChange={(e) => set("roleCategory", e.target.value)}>
                        {Object.entries(ROLE_CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="vf-cat" className="text-sm font-medium block mb-1">Category</label>
                      <select id="vf-cat" className={selectCls("category")} value={f.category} onChange={(e) => set("category", e.target.value)}>
                        {JOB_CATEGORIES.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label htmlFor="vf-dept" className="text-sm font-medium block mb-1">{isSchool ? "Subject or department" : "Department"}</label>
                    <Input id="vf-dept" className="h-11" value={f.department} onChange={(e) => set("department", e.target.value.slice(0, 120))} placeholder={isSchool ? "e.g. Sciences, Languages, Boarding" : "e.g. Front End"} />
                  </div>
                </div>

                {isSchool && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 p-3 space-y-3">
                    <div>
                      <p className="text-sm font-medium mb-1.5">Subjects to teach {f.roleCategory === "teaching" ? "*" : <span className="text-xs text-muted-foreground font-normal">(teaching roles only)</span>}</p>
                      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Subjects">
                        {TEACHING_SUBJECTS.map((s) => (
                          <button key={s} type="button" aria-pressed={f.subjects.includes(s)} onClick={() => toggleSubject(s)}
                            className={`text-xs px-2.5 py-1.5 rounded-full border transition ${f.subjects.includes(s) ? "bg-emerald-600 text-white border-emerald-600" : "bg-background hover:bg-muted"}`}>
                            {s}
                          </button>
                        ))}
                      </div>
                      <Err k="subjects" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="vf-level" className="text-sm font-medium block mb-1">Level</label>
                        <select id="vf-level" className={selectCls("teachingLevel")} value={f.teachingLevel} onChange={(e) => set("teachingLevel", e.target.value)}>
                          <option value="">—</option>
                          {SCHOOL_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="vf-start" className="text-sm font-medium block mb-1">Start date</label>
                        <Input id="vf-start" type="date" className={`h-11 ${fieldCls("startDate")}`} value={f.startDate} onChange={(e) => set("startDate", e.target.value)} />
                        <Err k="startDate" />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm min-h-[44px]">
                      <input type="checkbox" className="h-5 w-5" checked={!!f.tscRequired} onChange={(e) => set("tscRequired", e.target.checked)} />
                      TSC registration required
                    </label>
                    <label className="flex items-center gap-2 text-sm min-h-[44px]">
                      <input type="checkbox" className="h-5 w-5" checked={!!f.accommodation} onChange={(e) => set("accommodation", e.target.checked)} />
                      Housing / accommodation provided
                    </label>
                  </div>
                )}

                {branches.length > 0 && (
                  <div>
                    <label htmlFor="vf-branch" className="text-sm font-medium block mb-1">Branch / campus</label>
                    <select id="vf-branch" className={selectCls("branchId")} value={f.branchId}
                      onChange={(e) => { const b = branches.find((x) => x.id === e.target.value); set("branchId", e.target.value); if (b?.county) set("county", b.county); if (b?.town) set("town", b.town); }}>
                      <option value="">Main / HQ</option>
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.county ? ` — ${b.county}` : ""}</option>)}
                    </select>
                    <Err k="branchId" />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="vf-county" className="text-sm font-medium block mb-1">County {isSchool && "*"}</label>
                    <select id="vf-county" className={selectCls("county")} value={f.county} onChange={(e) => set("county", e.target.value)} aria-invalid={!!errors.county}>
                      <option value="">Select…</option>
                      {KENYA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <Err k="county" />
                  </div>
                  <div>
                    <label htmlFor="vf-town" className="text-sm font-medium block mb-1">Town / area</label>
                    <Input id="vf-town" className="h-11" value={f.town} onChange={(e) => set("town", e.target.value.slice(0, 80))} placeholder="e.g. Kitengela" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="vf-type" className="text-sm font-medium block mb-1">Employment</label>
                    <select id="vf-type" className={selectCls("employmentType")} value={f.employmentType} onChange={(e) => set("employmentType", e.target.value)}>
                      {Object.entries(EMPLOYMENT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="vf-exp" className="text-sm font-medium block mb-1">Experience</label>
                    <select id="vf-exp" className={selectCls("experienceLevel")} value={f.experienceLevel} onChange={(e) => set("experienceLevel", e.target.value)}>
                      {Object.entries(EXPERIENCE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="vf-vacs" className="text-sm font-medium block mb-1">Positions</label>
                    <Input id="vf-vacs" inputMode="numeric" className="h-11" value={f.vacancies} onChange={(e) => set("vacancies", e.target.value.replace(/\D/g, "").slice(0, 3))} />
                  </div>
                </div>

                <div>
                  <label htmlFor="vf-resp" className="text-sm font-medium block mb-1">Job description & responsibilities {isSchool && "*"}</label>
                  <Textarea id="vf-resp" rows={4} className={fieldCls("responsibilities")} value={f.responsibilities} onChange={(e) => set("responsibilities", e.target.value.slice(0, 6000))} placeholder="What the person will do day to day" aria-invalid={!!errors.responsibilities} />
                  <Err k="responsibilities" />
                </div>
                <div>
                  <label htmlFor="vf-req" className="text-sm font-medium block mb-1">Required qualifications & experience</label>
                  <Textarea id="vf-req" rows={3} value={f.requirements} onChange={(e) => set("requirements", e.target.value.slice(0, 6000))} placeholder={isSchool ? "e.g. Diploma or Degree in Education, 2+ years teaching" : "Qualifications and experience needed"} />
                </div>
                <div>
                  <label htmlFor="vf-cred" className="text-sm font-medium block mb-1">Registration or professional credentials</label>
                  <Input id="vf-cred" className="h-11" value={f.credentials} onChange={(e) => set("credentials", e.target.value.slice(0, 500))} placeholder={isSchool ? "e.g. Valid TSC number; KNEC examiner a plus" : "e.g. Valid driving licence"} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="vf-min" className="text-sm font-medium block mb-1">Salary from (KES) <span className="text-xs text-muted-foreground font-normal">optional</span></label>
                    <Input id="vf-min" inputMode="numeric" className={`h-11 ${fieldCls("salaryMin")}`} value={f.salaryMin} onChange={(e) => set("salaryMin", e.target.value.replace(/\D/g, ""))} placeholder="25000" />
                    <Err k="salaryMin" />
                  </div>
                  <div>
                    <label htmlFor="vf-max" className="text-sm font-medium block mb-1">Salary to (KES)</label>
                    <Input id="vf-max" inputMode="numeric" className={`h-11 ${fieldCls("salaryMax")}`} value={f.salaryMax} onChange={(e) => set("salaryMax", e.target.value.replace(/\D/g, ""))} placeholder="40000" />
                    <Err k="salaryMax" />
                  </div>
                </div>

                <div>
                  <label htmlFor="vf-deadline" className="text-sm font-medium block mb-1">Application deadline {isSchool && "*"}</label>
                  <Input id="vf-deadline" type="date" className={`h-11 ${fieldCls("deadline")}`} value={f.deadline} onChange={(e) => set("deadline", e.target.value)} aria-invalid={!!errors.deadline} />
                  <Err k="deadline" />
                </div>

                <fieldset>
                  <legend className="text-sm font-medium mb-1.5">How should candidates apply?</legend>
                  <div className="grid gap-2">
                    {[
                      { v: "platform", l: "Through WorkAbroad Hub (recommended)", d: "Applications with CVs arrive in your dashboard." },
                      { v: "email", l: "By email", d: "Candidates email you directly." },
                      { v: "url", l: "On our website / form", d: "Candidates follow your link." },
                    ].map((o) => (
                      <label key={o.v} className={`flex items-start gap-2 rounded-lg border p-3 cursor-pointer ${f.applicationMethod === o.v ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20" : ""}`}>
                        <input type="radio" name="vf-method" className="mt-1 h-4 w-4" checked={f.applicationMethod === o.v} onChange={() => set("applicationMethod", o.v)} />
                        <span><span className="text-sm font-medium block">{o.l}</span><span className="text-xs text-muted-foreground">{o.d}</span></span>
                      </label>
                    ))}
                  </div>
                  {f.applicationMethod !== "platform" && (
                    <div className="mt-2">
                      <label htmlFor="vf-contact" className="sr-only">Application contact</label>
                      <Input id="vf-contact" className={`h-11 ${fieldCls("applicationContact")}`} value={f.applicationContact} onChange={(e) => set("applicationContact", e.target.value.slice(0, 300))}
                        placeholder={f.applicationMethod === "email" ? "recruitment@yourschool.ac.ke" : "https://yourschool.ac.ke/careers"} inputMode={f.applicationMethod === "email" ? "email" : "url"} />
                      <Err k="applicationContact" />
                    </div>
                  )}
                </fieldset>
              </div>

              <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                <Button type="button" variant="outline" className="h-11" disabled={!!saving} onClick={() => save("draft")}>
                  {saving === "draft" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Save as draft
                </Button>
                <Button type="button" className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={!!saving} onClick={toPreview}>
                  <Eye className="h-4 w-4 mr-1.5" /> Preview
                </Button>
              </div>
            </>
          )}

          {step === "preview" && (
            <>
              <h2 id="vac-title" className="font-bold text-xl leading-tight mb-1">Preview</h2>
              <p className="text-sm text-muted-foreground mb-4">This is how candidates will see it.</p>
              <div className="rounded-xl border p-4 space-y-3">
                <div>
                  <p className="font-semibold text-lg leading-snug">{f.title}</p>
                  <p className="text-sm text-muted-foreground">{companyName}{(f.town || f.county) && ` · ${[f.town, f.county].filter(Boolean).join(", ")}`}</p>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded-full bg-muted px-2.5 py-1">{EMPLOYMENT_LABEL[f.employmentType]}</span>
                  {isSchool && f.roleCategory && <span className="rounded-full bg-muted px-2.5 py-1">{ROLE_CATEGORY_LABEL[f.roleCategory]}</span>}
                  {isSchool && f.teachingLevel && <span className="rounded-full bg-muted px-2.5 py-1">{schoolLevelLabel(f.teachingLevel)}</span>}
                  {f.tscRequired && <span className="rounded-full bg-muted px-2.5 py-1">TSC required</span>}
                  {f.accommodation && <span className="rounded-full bg-muted px-2.5 py-1">Housing provided</span>}
                  {(f.salaryMin || f.salaryMax) && <span className="rounded-full bg-emerald-50 text-emerald-800 px-2.5 py-1">KES {[f.salaryMin, f.salaryMax].filter(Boolean).map((n) => Number(n).toLocaleString()).join(" – ")}</span>}
                </div>
                {f.subjects.length > 0 && <p className="text-sm"><strong>Subjects:</strong> {f.subjects.join(", ")}</p>}
                {f.responsibilities && <div><p className="text-sm font-medium">Responsibilities</p><p className="text-sm whitespace-pre-line text-foreground/90">{f.responsibilities}</p></div>}
                {f.requirements && <div><p className="text-sm font-medium">Qualifications</p><p className="text-sm whitespace-pre-line text-foreground/90">{f.requirements}</p></div>}
                {f.credentials && <p className="text-sm"><strong>Credentials:</strong> {f.credentials}</p>}
                <p className="text-sm"><strong>Deadline:</strong> {f.deadline ? new Date(f.deadline).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" }) : "Open until filled"}</p>
                <p className="text-sm"><strong>How to apply:</strong> {f.applicationMethod === "platform" ? "Apply on WorkAbroad Hub" : f.applicationMethod === "email" ? `Email ${f.applicationContact}` : f.applicationContact}</p>
              </div>
              {serverMsg && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-sm p-3" role="alert">{serverMsg}</div>}
              <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                <Button type="button" variant="ghost" className="h-11" disabled={!!saving} onClick={() => setStep("form")}><ArrowLeft className="h-4 w-4 mr-1.5" /> Edit</Button>
                <Button type="button" variant="outline" className="h-11" disabled={!!saving} onClick={() => save("draft")}>
                  {saving === "draft" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Save as draft
                </Button>
                <Button type="button" className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={!!saving} onClick={() => save("open")} data-testid="btn-publish-vacancy">
                  {saving === "open" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />} {editing ? "Save & publish" : "Publish vacancy"}
                </Button>
              </div>
            </>
          )}

          {step === "done" && doneInfo && (
            <div className="text-center py-6">
              <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto mb-3" />
              <h2 id="vac-title" className="font-bold text-xl mb-2">{doneInfo.status === "draft" ? "Draft saved" : pendingVerification ? "Saved — awaiting verification" : "Your vacancy is live"}</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">{doneInfo.message}</p>
              <Button className="mt-6 h-11 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { onSaved(); onClose(); }}>Back to dashboard</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
