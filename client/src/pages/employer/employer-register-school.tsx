/**
 * /employer/register-school — register a school as a Kenya Careers employer.
 *
 * 2026-10 (Tony): same verification flow as companies (companies row with
 * status='pending' + company_claims row → admin approves → poster becomes
 * school admin), with school-specific fields: levels, ownership, town.
 */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, CheckCircle2, GraduationCap, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SCHOOL_LEVELS, SCHOOL_OWNERSHIP, KENYA_COUNTIES } from "@/lib/school-constants";

const ROLES = ["Principal", "Head Teacher", "Deputy Principal", "Deputy Head Teacher", "Director / Owner", "BOM Chair / Secretary", "Bursar / Administrator", "HR"];

export default function EmployerRegisterSchool() {
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [levels, setLevels] = useState<string[]>([]);
  const [ownership, setOwnership] = useState("private");
  const [county, setCounty] = useState("");
  const [town, setTown] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [contactName, setContactName] = useState("");
  const [role, setRole] = useState("Principal");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);

  const toggleLevel = (v: string) =>
    setLevels((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/employer/register-company", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institutionType: "school",
          name, schoolLevels: levels, schoolOwnership: ownership, county, town,
          description, website, contactName, role, email, phone, evidenceUrl, registrationNumber,
        }),
      });
      if (res.status === 401) {
        navigate("/login?redirect=%2Femployer%2Fregister-school");
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body?.companyId) { navigate(`/employer/companies/${body.companyId}/manage`); return; }
      if (!res.ok) { setError(body?.message || `Submission failed (${res.status}).`); return; }
      setCompanyId(body?.companyId ?? null);
      setSubmitted(body?.message ?? "Registered.");
    } catch (err: any) {
      setError(err?.message || "Could not register the school.");
    } finally { setSubmitting(false); }
  }

  const canSubmit = name.trim().length >= 2 && levels.length > 0 && !!county && contactName.trim() && email.trim() && phone.replace(/\D/g, "").length >= 9;

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="bg-gradient-to-br from-emerald-700 to-teal-600 text-white px-4 pt-4 pb-8">
        <div className="max-w-2xl mx-auto">
          <Link href="/kenya-careers/schools">
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 -ml-2 mb-2">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
            </Button>
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Register your school</h1>
          <p className="text-sm text-emerald-50 mt-0.5">
            Free for schools. Once we've verified your school you can post teacher vacancies straight away.
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 mt-4">
        {submitted ? (
          <Card>
            <CardContent className="p-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-3" />
              <h2 className="font-semibold mb-1">School registered — pending verification</h2>
              <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">{submitted}</p>
              <div className="flex flex-wrap gap-2 justify-center">
                <Link href={companyId ? `/employer/companies/${companyId}/manage` : "/employer/dashboard"}><Button>Open my school dashboard</Button></Link>
                <Link href="/kenya-careers?institution=school"><Button variant="outline">See school vacancies</Button></Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                <GraduationCap className="h-4 w-4" />
                <p className="text-sm font-medium">School details</p>
              </div>

              <div>
                <label htmlFor="rs-name" className="text-sm font-medium block mb-1">School name *</label>
                <Input id="rs-name" value={name} onChange={(e) => setName(e.target.value.slice(0, 160))} placeholder="e.g. St. Mary's Girls High School" />
              </div>

              <div>
                <p className="text-sm font-medium mb-1.5">Level(s) *</p>
                <div className="flex flex-wrap gap-2">
                  {SCHOOL_LEVELS.map((l) => (
                    <button
                      key={l.value} type="button" onClick={() => toggleLevel(l.value)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition ${levels.includes(l.value) ? "bg-emerald-600 text-white border-emerald-600" : "bg-background hover:bg-muted"}`}
                      data-testid={`level-${l.value}`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="rs-own" className="text-sm font-medium block mb-1">Type of school</label>
                <select id="rs-own" value={ownership} onChange={(e) => setOwnership(e.target.value)} className="w-full text-sm border rounded-md px-3 py-2 bg-background">
                  {SCHOOL_OWNERSHIP.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rs-county" className="text-sm font-medium block mb-1">County *</label>
                  <select id="rs-county" value={county} onChange={(e) => setCounty(e.target.value)} className="w-full text-sm border rounded-md px-3 py-2 bg-background">
                    <option value="">Select…</option>
                    {KENYA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="rs-town" className="text-sm font-medium block mb-1">Town / area</label>
                  <Input id="rs-town" value={town} onChange={(e) => setTown(e.target.value.slice(0, 80))} placeholder="e.g. Kitengela" />
                </div>
              </div>

              <div>
                <label htmlFor="rs-desc" className="text-sm font-medium block mb-1">About the school</label>
                <Textarea id="rs-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value.slice(0, 2000))} placeholder="Day or boarding, number of students, curriculum (CBC, 8-4-4, IGCSE)…" />
              </div>

              <div>
                <label htmlFor="rs-web" className="text-sm font-medium block mb-1">Website or Facebook page</label>
                <Input id="rs-web" type="url" value={website} onChange={(e) => setWebsite(e.target.value.slice(0, 240))} placeholder="https://" />
              </div>

              <hr />
              <p className="text-sm font-medium">Your details (for verification)</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rs-yname" className="text-sm font-medium block mb-1">Your full name *</label>
                  <Input id="rs-yname" value={contactName} onChange={(e) => setContactName(e.target.value.slice(0, 120))} placeholder="Mary Achieng" />
                </div>
                <div>
                  <label htmlFor="rs-role" className="text-sm font-medium block mb-1">Your role</label>
                  <select id="rs-role" value={role} onChange={(e) => setRole(e.target.value)} className="w-full text-sm border rounded-md px-3 py-2 bg-background">
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rs-email" className="text-sm font-medium block mb-1">School email *</label>
                  <Input id="rs-email" type="email" value={email} onChange={(e) => setEmail(e.target.value.slice(0, 160))} placeholder="school@gmail.com" />
                </div>
                <div>
                  <label htmlFor="rs-phone" className="text-sm font-medium block mb-1">Official school phone *</label>
                  <Input id="rs-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value.slice(0, 40))} placeholder="07XX XXX XXX" />
                </div>
              </div>

              <div>
                <label htmlFor="rs-regno" className="text-sm font-medium block mb-1">School registration number (optional)</label>
                <Input id="rs-regno" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value.slice(0, 80))} placeholder="Ministry of Education registration / KNEC centre code" />
                <p className="text-[10px] text-muted-foreground mt-0.5">Helps us verify your school faster. Never shown publicly.</p>
              </div>

              <div>
                <label htmlFor="rs-evidence" className="text-sm font-medium block mb-1">Registration certificate link (optional)</label>
                <Input id="rs-evidence" type="url" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value.slice(0, 500))} placeholder="Google Drive link to your Ministry of Education registration" />
                <p className="text-[10px] text-muted-foreground mt-0.5">Optional — speeds up verification.</p>
              </div>

              {error && <div className="text-sm text-rose-700 bg-rose-50 rounded-md p-2">{error}</div>}

              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={submit}
                disabled={submitting || !canSubmit}
                data-testid="btn-submit-register-school"
              >
                {submitting
                  ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Submitting…</>
                  : <><Sparkles className="h-4 w-4 mr-1.5" /> Register school</>}
              </Button>
              <p className="text-[11px] text-center text-muted-foreground">
                We'll verify your school and email you, usually within 1 business day.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
