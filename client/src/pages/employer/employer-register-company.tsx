/**
 * /employer/register-company — register a brand-new company.
 *
 * 2026-06 Phase 4: for employers whose company isn't yet in our pre-loaded
 * catalogue. Collects basic profile data + the registrant's role + an
 * optional URL pointing at a business cert / license. Creates the
 * companies row with status='pending' AND a company_claims row so admin
 * can verify before granting access.
 */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Building2, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const KENYA_COUNTIES = [
  "Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo-Marakwet", "Embu", "Garissa",
  "Homa Bay", "Isiolo", "Kajiado", "Kakamega", "Kericho", "Kiambu", "Kilifi",
  "Kirinyaga", "Kisii", "Kisumu", "Kitui", "Kwale", "Laikipia", "Lamu",
  "Machakos", "Makueni", "Mandera", "Marsabit", "Meru", "Migori", "Mombasa",
  "Murang'a", "Nairobi", "Nakuru", "Nandi", "Narok", "Nyamira", "Nyandarua",
  "Nyeri", "Samburu", "Siaya", "Taita-Taveta", "Tana River", "Tharaka-Nithi",
  "Trans Nzoia", "Turkana", "Uasin Gishu", "Vihiga", "Wajir", "West Pokot",
];

export default function EmployerRegisterCompany() {
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [county, setCounty] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ message: string; companyId: string } | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/employer/register-company", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, industry, county, description, website,
          contactName, email, phone, role, evidenceUrl,
        }),
      });
      if (res.status === 401) {
        navigate("/login?redirect=/employer/register-company");
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body?.message || `Submission failed (${res.status}).`); return; }
      setSubmitted({ message: body?.message ?? "Registered.", companyId: body?.companyId });
    } catch (err: any) {
      setError(err?.message || "Could not register company.");
    } finally { setSubmitting(false); }
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="bg-gradient-to-br from-slate-900 to-slate-700 text-white px-4 pt-4 pb-8">
        <div className="max-w-2xl mx-auto">
          <Link href="/employer/dashboard">
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 -ml-2 mb-2">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to dashboard
            </Button>
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Register your company</h1>
          <p className="text-sm text-slate-300 mt-0.5">
            For companies not yet on Kenya Careers. We'll verify your business and grant you posting access within 1-2 business days.
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 mt-4">
        {submitted ? (
          <Card>
            <CardContent className="p-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-3" />
              <h2 className="font-semibold mb-1">Registration received</h2>
              <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">{submitted.message}</p>
              <div className="flex flex-wrap gap-2 justify-center">
                <Link href="/employer/dashboard"><Button>Go to dashboard</Button></Link>
                <Link href="/kenya-careers"><Button variant="outline">Browse Kenya Careers</Button></Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                <Building2 className="h-4 w-4" />
                <p className="text-sm font-medium">New company registration</p>
              </div>

              <div>
                <label htmlFor="rc-name" className="text-sm font-medium block mb-1">Company name *</label>
                <Input id="rc-name" value={name} onChange={(e) => setName(e.target.value.slice(0, 160))} placeholder="e.g. Tropikal Plumbing Ltd" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rc-industry" className="text-sm font-medium block mb-1">Industry</label>
                  <Input id="rc-industry" value={industry} onChange={(e) => setIndustry(e.target.value.slice(0, 80))} placeholder="Construction" />
                </div>
                <div>
                  <label htmlFor="rc-county" className="text-sm font-medium block mb-1">HQ county</label>
                  <select id="rc-county" value={county} onChange={(e) => setCounty(e.target.value)} className="w-full text-sm border rounded-md px-3 py-2 bg-background">
                    <option value="">Select…</option>
                    {KENYA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="rc-desc" className="text-sm font-medium block mb-1">Company description</label>
                <Textarea id="rc-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value.slice(0, 2000))} placeholder="What does your company do?" />
              </div>

              <div>
                <label htmlFor="rc-website" className="text-sm font-medium block mb-1">Website</label>
                <Input id="rc-website" type="url" value={website} onChange={(e) => setWebsite(e.target.value.slice(0, 240))} placeholder="https://yourcompany.co.ke" />
              </div>

              <hr />
              <p className="text-sm font-medium">Your details (for verification)</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rc-yname" className="text-sm font-medium block mb-1">Your full name *</label>
                  <Input id="rc-yname" value={contactName} onChange={(e) => setContactName(e.target.value.slice(0, 120))} placeholder="Jane Wanjiku" />
                </div>
                <div>
                  <label htmlFor="rc-yrole" className="text-sm font-medium block mb-1">Your role</label>
                  <Input id="rc-yrole" value={role} onChange={(e) => setRole(e.target.value.slice(0, 120))} placeholder="HR Manager" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rc-email" className="text-sm font-medium block mb-1">Work email *</label>
                  <Input id="rc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value.slice(0, 160))} placeholder="you@yourcompany.co.ke" />
                </div>
                <div>
                  <label htmlFor="rc-phone" className="text-sm font-medium block mb-1">Your phone</label>
                  <Input id="rc-phone" value={phone} onChange={(e) => setPhone(e.target.value.slice(0, 40))} placeholder="07XX XXX XXX" />
                </div>
              </div>

              <div>
                <label htmlFor="rc-evidence" className="text-sm font-medium block mb-1">Business cert / license URL (optional)</label>
                <Input id="rc-evidence" type="url" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value.slice(0, 500))} placeholder="Paste a Google Drive / Dropbox link to a scan of your business permit" />
                <p className="text-[10px] text-muted-foreground mt-0.5">Speeds up verification. Optional — we can also verify via your work email domain.</p>
              </div>

              {error && <div className="text-sm text-rose-700 bg-rose-50 rounded-md p-2">{error}</div>}

              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={submit}
                disabled={submitting || !name.trim() || !email.trim() || !contactName.trim()}
                data-testid="btn-register-company"
              >
                {submitting
                  ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Submitting…</>
                  : <><Sparkles className="h-4 w-4 mr-1.5" /> Register company</>}
              </Button>
              <p className="text-[11px] text-center text-muted-foreground">
                We'll review your registration and email you within 1-2 business days. Once verified, you'll be able to post jobs immediately.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
