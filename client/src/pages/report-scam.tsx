/**
 * /report-scam — Community Fraud Intelligence Platform v2 submission form.
 *
 * 6-step wizard:
 *   1. WHO        agency + destination + socials + contact fingerprints
 *   2. MONEY      payment method + amount + bank/mpesa/crypto (if applicable)
 *   3. STORY      description + optional timeline
 *   4. EVIDENCE   drag-drop / camera / gallery — up to 50 files
 *   5. YOU        anonymous OR give your email for updates (optional)
 *   6. REVIEW     recap + legal disclaimer + submit
 *
 * Autosaves to localStorage on every field change. Resume from any step
 * after a page refresh. Fully mobile-friendly.
 *
 * Backend: POST /api/scam-reports/v2 (structured) + POST /api/scam-reports/evidence.
 */

import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Loader2, ChevronRight, ChevronLeft, Check,
  Building2, DollarSign, MessageSquare, Camera, User, FileCheck,
  Info, Upload, Trash2, Flag, AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fetchCsrfToken } from "@/lib/queryClient";

interface FormData {
  agencyName: string; country: string; destinationCountry: string; officeLocation: string;
  website: string; facebookUrl: string; instagramUrl: string; tiktokUrl: string; linkedinUrl: string;
  whatsappNumber: string; phoneNumbers: string; emailAddresses: string;
  recruitmentLicence: string; employerName: string; jobApplied: string; incidentDate: string;
  paymentMethod: string; amountLost: string; currency: string;
  bankAccount: string; mpesaNumber: string; cryptoWallet: string; transactionReference: string;
  description: string;
  reporterEmail: string; isAnonymous: boolean;
  agreedToTerms: boolean;
}

const EMPTY_FORM: FormData = {
  agencyName: "", country: "", destinationCountry: "", officeLocation: "",
  website: "", facebookUrl: "", instagramUrl: "", tiktokUrl: "", linkedinUrl: "",
  whatsappNumber: "", phoneNumbers: "", emailAddresses: "",
  recruitmentLicence: "", employerName: "", jobApplied: "", incidentDate: "",
  paymentMethod: "", amountLost: "", currency: "KES",
  bankAccount: "", mpesaNumber: "", cryptoWallet: "", transactionReference: "",
  description: "",
  reporterEmail: "", isAnonymous: false,
  agreedToTerms: false,
};

const DRAFT_KEY = "wah_scam_report_draft_v2";
const BATCH_KEY = "wah_scam_report_batch_v2";

const STEPS = [
  { id: 1, label: "Who",      icon: Building2 },
  { id: 2, label: "Money",    icon: DollarSign },
  { id: 3, label: "Story",    icon: MessageSquare },
  { id: 4, label: "Evidence", icon: Camera },
  { id: 5, label: "You",      icon: User },
  { id: 6, label: "Review",   icon: FileCheck },
] as const;

export default function ReportScamPage() {
  const [, navigate] = useLocation();
  const searchParams = useSearch();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadBatchId, setUploadBatchId] = useState<string | null>(null);
  const [uploadedFileNames, setUploadedFileNames] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    reportId: string; agencySlug: string; headline: string;
    clusters: Array<{ kind: string; display: string; otherReportCount: number }>;
    disclaimer: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft?.form) setForm({ ...EMPTY_FORM, ...draft.form });
        if (draft?.step) setStep(draft.step);
      }
      const batch = localStorage.getItem(BATCH_KEY);
      if (batch) {
        const b = JSON.parse(batch);
        if (b?.id) setUploadBatchId(b.id);
        if (Array.isArray(b?.fileNames)) setUploadedFileNames(b.fileNames);
      }
    } catch { /* ignore corrupt draft */ }
    const params = new URLSearchParams(searchParams);
    const prefill = params.get("agency");
    if (prefill) setForm((f) => ({ ...f, agencyName: prefill }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (result) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, step, savedAt: Date.now() }));
    } catch { /* noop */ }
  }, [form, step, result]);

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleFilesPicked(picked: FileList | null) {
    if (!picked) return;
    const accepted = Array.from(picked).filter((f) => {
      if (f.size > 8 * 1024 * 1024) {
        toast({ title: `"${f.name}" is too large`, description: "Each file must be under 8 MB.", variant: "destructive" });
        return false;
      }
      const okMime = f.type.startsWith("image/") || f.type === "application/pdf" ||
                     f.type === "application/msword" ||
                     f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      if (!okMime) {
        toast({ title: `"${f.name}" not supported`, description: "Please attach JPG, PNG, WEBP, PDF, DOC or DOCX.", variant: "destructive" });
        return false;
      }
      return true;
    });
    if (files.length + accepted.length + uploadedFileNames.length > 50) {
      toast({ title: "Too many files", description: "Up to 50 files per report.", variant: "destructive" });
      return;
    }
    setFiles((prev) => [...prev, ...accepted]);
  }

  async function uploadEvidence(): Promise<string | null> {
    if (files.length === 0) return uploadBatchId;
    setUploading(true);
    try {
      const fd = new FormData();
      if (uploadBatchId) fd.append("uploadBatchId", uploadBatchId);
      for (const f of files) fd.append("files", f);
      const csrf = await fetchCsrfToken();
      const res = await fetch("/api/scam-reports/evidence", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrf },
        body: fd,
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.message || "Upload failed");
      const newBatchId = data.uploadBatchId || uploadBatchId || null;
      const names = (data.files ?? []).map((x: any) => x.fileName);
      setUploadBatchId(newBatchId);
      setUploadedFileNames((prev) => [...prev, ...names]);
      setFiles([]);
      try { localStorage.setItem(BATCH_KEY, JSON.stringify({ id: newBatchId, fileNames: [...uploadedFileNames, ...names] })); } catch { /* noop */ }
      toast({ title: "Evidence uploaded", description: `${names.length} file${names.length === 1 ? "" : "s"} added.` });
      return newBatchId;
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message || "Please try again.", variant: "destructive" });
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    if (!form.agencyName.trim() || form.agencyName.trim().length < 2) {
      toast({ title: "Agency name required", description: "Go back to Step 1 and add the agency name.", variant: "destructive" });
      return;
    }
    if (!form.description.trim() || form.description.trim().length < 30) {
      toast({ title: "Story too short", description: "Please describe what happened in at least 30 characters.", variant: "destructive" });
      return;
    }
    if (!form.agreedToTerms) {
      toast({ title: "Please confirm", description: "Check the confirmation box before submitting.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      let batchId = uploadBatchId;
      if (files.length > 0) batchId = await uploadEvidence();
      const csrf = await fetchCsrfToken();
      const payload: any = {
        agencyName: form.agencyName.trim(),
        country: form.country || null,
        officeLocation: form.officeLocation || null,
        website: form.website || null,
        facebookUrl: form.facebookUrl || null,
        instagramUrl: form.instagramUrl || null,
        tiktokUrl: form.tiktokUrl || null,
        linkedinUrl: form.linkedinUrl || null,
        whatsappNumber: form.whatsappNumber || null,
        phoneNumbers: form.phoneNumbers || null,
        emailAddresses: form.emailAddresses || null,
        recruitmentLicence: form.recruitmentLicence || null,
        employerName: form.employerName || null,
        destinationCountry: form.destinationCountry || null,
        jobApplied: form.jobApplied || null,
        incidentDate: form.incidentDate || null,
        amountLostKes: form.amountLost ? Number(form.amountLost) : null,
        currency: form.currency,
        paymentMethod: form.paymentMethod || null,
        bankAccount: form.bankAccount || null,
        mpesaNumber: form.mpesaNumber || null,
        cryptoWallet: form.cryptoWallet || null,
        transactionReference: form.transactionReference || null,
        description: form.description.trim(),
        reporterEmail: form.isAnonymous ? null : (form.reporterEmail || null),
        timelineJson: batchId ? { uploadBatchId: batchId } : null,
      };
      const res = await fetch("/api/scam-reports/v2", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.message || "Submission failed");
      setResult(data);
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(BATCH_KEY);
    } catch (err: any) {
      toast({ title: "Couldn't submit", description: err?.message || "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 py-8 px-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <Card className="border-2 border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900">
            <CardContent className="pt-8 pb-8 text-center space-y-3">
              <div className="mx-auto h-14 w-14 rounded-full bg-emerald-500 flex items-center justify-center">
                <Check className="h-7 w-7 text-white" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Report submitted — thank you.</h1>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed max-w-md mx-auto">{result.headline}</p>
              {result.clusters.length > 0 && (
                <div className="bg-amber-100 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-md p-3 text-left mt-4">
                  <p className="text-xs font-bold text-amber-900 dark:text-amber-200 mb-2 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Contacts you reported also appear in other reports:
                  </p>
                  <ul className="text-xs text-amber-900 dark:text-amber-200 space-y-1">
                    {result.clusters.map((c) => (
                      <li key={c.display}>
                        <strong>{c.otherReportCount}</strong> other report{c.otherReportCount === 1 ? "" : "s"} share this {c.kind}: <span className="font-mono">{c.display}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => navigate(`/agencies-reported/${result.agencySlug}`)}>View agency profile</Button>
            <Button onClick={() => navigate("/agencies")}>Browse all reports</Button>
          </div>
          <p className="text-[11px] text-center text-gray-500 dark:text-gray-400 leading-relaxed">{result.disclaimer}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs font-semibold">
            <Flag className="h-3.5 w-3.5" /> REPORT RECRUITMENT FRAUD
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Help us protect the next job seeker</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-lg mx-auto leading-relaxed">
            Your report is reviewed by our team and — if approved — published on a warning page other Kenyans see before they send money.
          </p>
        </div>

        <StepIndicator current={step} />

        <Card>
          <CardContent className="pt-6 pb-6 space-y-4">
            {step === 1 && <StepWho form={form} update={update} />}
            {step === 2 && <StepMoney form={form} update={update} />}
            {step === 3 && <StepStory form={form} update={update} />}
            {step === 4 && (
              <StepEvidence
                files={files}
                setFiles={setFiles}
                uploadedFileNames={uploadedFileNames}
                uploading={uploading}
                onUpload={uploadEvidence}
                onPick={() => fileInputRef.current?.click()}
                inputRef={fileInputRef}
                onFiles={handleFilesPicked}
              />
            )}
            {step === 5 && <StepYou form={form} update={update} />}
            {step === 6 && <StepReview form={form} update={update} filesCount={files.length + uploadedFileNames.length} />}

            <div className="flex justify-between pt-4 border-t border-gray-200 dark:border-gray-800">
              <Button
                variant="outline"
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                disabled={step === 1 || submitting}
                data-testid="button-back-step"
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              {step < 6 ? (
                <Button onClick={() => setStep((s) => Math.min(6, s + 1))} data-testid="button-next-step">
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || !form.agreedToTerms}
                  className="bg-red-600 hover:bg-red-700 text-white font-semibold"
                  data-testid="button-submit-report"
                >
                  {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</> : <><Flag className="h-4 w-4 mr-2" /> Submit report</>}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="bg-gray-100 dark:bg-gray-900 rounded-md p-3 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
            Your report is saved as a draft in this browser as you type — you can safely close this tab and come back. Reports go through moderation before publication. For urgent cases, also report to Kenya DCI at reportscam@dci.go.ke.
          </p>
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-between overflow-x-auto pb-1">
      {STEPS.map((s, idx) => {
        const done = current > s.id;
        const active = current === s.id;
        const Icon = s.icon;
        return (
          <div key={s.id} className="flex items-center flex-shrink-0">
            <div className={`flex flex-col items-center gap-1 ${active ? "opacity-100" : done ? "opacity-90" : "opacity-40"}`}>
              <div className={`h-8 w-8 rounded-full flex items-center justify-center ${done ? "bg-emerald-500" : active ? "bg-teal-500" : "bg-gray-300 dark:bg-gray-700"}`}>
                {done ? <Check className="h-4 w-4 text-white" /> : <Icon className="h-4 w-4 text-white" />}
              </div>
              <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">{s.label}</span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`w-6 h-0.5 mx-1 sm:mx-2 ${done ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-700"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepWho({ form, update }: { form: FormData; update: <K extends keyof FormData>(k: K, v: FormData[K]) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-bold text-lg text-gray-900 dark:text-white">Who is being reported?</h2>
        <p className="text-xs text-gray-600 dark:text-gray-400">Fill every field you know — leave blank if unsure.</p>
      </div>
      <Field label="Agency or recruiter name *" value={form.agencyName} onChange={(v) => update("agencyName", v)} placeholder="e.g. Kingsway Recruitment Ltd" testId="input-agency-name" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Their country" value={form.country} onChange={(v) => update("country", v)} placeholder="Kenya, UAE" testId="input-agency-country" />
        <Field label="Office location" value={form.officeLocation} onChange={(v) => update("officeLocation", v)} placeholder="Nairobi CBD" testId="input-office-location" />
      </div>
      <Field label="Destination country you were promised" value={form.destinationCountry} onChange={(v) => update("destinationCountry", v)} placeholder="e.g. UAE, Saudi Arabia" testId="input-destination-country" />
      <Field label="Job promised" value={form.jobApplied} onChange={(v) => update("jobApplied", v)} placeholder="e.g. Care worker, Truck driver" testId="input-job-applied" />
      <Field label="Recruitment licence number (if provided)" value={form.recruitmentLicence} onChange={(v) => update("recruitmentLicence", v)} placeholder="NEA/PLR-XXXXX" testId="input-licence" />
      <Field label="Employer name (if different from agency)" value={form.employerName} onChange={(v) => update("employerName", v)} placeholder="e.g. Alfardan Group" testId="input-employer-name" />
      <div className="pt-3 border-t border-gray-200 dark:border-gray-800">
        <p className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">Contact fingerprints</p>
        <p className="text-[11px] text-gray-600 dark:text-gray-400 mb-3">Most valuable field — helps us catch repeat scammers across many reports.</p>
        <Field label="WhatsApp number" value={form.whatsappNumber} onChange={(v) => update("whatsappNumber", v)} placeholder="+254 7XX XXX XXX" testId="input-whatsapp" />
        <Field label="Other phone numbers" value={form.phoneNumbers} onChange={(v) => update("phoneNumbers", v)} placeholder="Comma-separated" testId="input-phones" />
        <Field label="Email addresses" value={form.emailAddresses} onChange={(v) => update("emailAddresses", v)} placeholder="Comma-separated" testId="input-emails" />
        <Field label="Website" value={form.website} onChange={(v) => update("website", v)} placeholder="https://..." testId="input-website" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Facebook" value={form.facebookUrl} onChange={(v) => update("facebookUrl", v)} placeholder="fb.com/..." testId="input-facebook" />
          <Field label="Instagram" value={form.instagramUrl} onChange={(v) => update("instagramUrl", v)} placeholder="@handle" testId="input-instagram" />
          <Field label="TikTok" value={form.tiktokUrl} onChange={(v) => update("tiktokUrl", v)} placeholder="@handle" testId="input-tiktok" />
          <Field label="LinkedIn" value={form.linkedinUrl} onChange={(v) => update("linkedinUrl", v)} placeholder="linkedin.com/..." testId="input-linkedin" />
        </div>
      </div>
      <Field label="Date of incident" value={form.incidentDate} onChange={(v) => update("incidentDate", v)} type="date" testId="input-incident-date" />
    </div>
  );
}

function StepMoney({ form, update }: { form: FormData; update: <K extends keyof FormData>(k: K, v: FormData[K]) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-bold text-lg text-gray-900 dark:text-white">Did money change hands?</h2>
        <p className="text-xs text-gray-600 dark:text-gray-400">Skip fields that don't apply. Even "they demanded money but I didn't pay" is worth reporting.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount lost" value={form.amountLost} onChange={(v) => update("amountLost", v)} type="number" placeholder="0" testId="input-amount" />
        <div className="space-y-1.5">
          <Label>Currency</Label>
          <select
            value={form.currency}
            onChange={(e) => update("currency", e.target.value)}
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            data-testid="select-currency"
          >
            {["KES","USD","AED","SAR","QAR","OMR","GBP","EUR","CAD"].map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>How did you pay?</Label>
        <select
          value={form.paymentMethod}
          onChange={(e) => update("paymentMethod", e.target.value)}
          className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
          data-testid="select-payment-method"
        >
          <option value="">— Choose —</option>
          <option value="mpesa">M-Pesa</option>
          <option value="bank">Bank transfer</option>
          <option value="cash">Cash</option>
          <option value="western_union">Western Union / MoneyGram</option>
          <option value="crypto">Cryptocurrency</option>
          <option value="other">Other</option>
        </select>
      </div>
      {form.paymentMethod === "mpesa" && (
        <Field label="M-Pesa number they used" value={form.mpesaNumber} onChange={(v) => update("mpesaNumber", v)} placeholder="+254 7XX XXX XXX" testId="input-mpesa" />
      )}
      {form.paymentMethod === "bank" && (
        <Field label="Bank account number" value={form.bankAccount} onChange={(v) => update("bankAccount", v)} placeholder="Account number" testId="input-bank" />
      )}
      {form.paymentMethod === "crypto" && (
        <Field label="Crypto wallet address" value={form.cryptoWallet} onChange={(v) => update("cryptoWallet", v)} placeholder="0x... or bc1..." testId="input-crypto" />
      )}
      <Field label="Transaction reference (M-Pesa code, wire ref, etc.)" value={form.transactionReference} onChange={(v) => update("transactionReference", v)} placeholder="e.g. QG5XT2ABCD" testId="input-tx-ref" />
    </div>
  );
}

function StepStory({ form, update }: { form: FormData; update: <K extends keyof FormData>(k: K, v: FormData[K]) => void }) {
  const len = form.description.trim().length;
  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-bold text-lg text-gray-900 dark:text-white">What happened?</h2>
        <p className="text-xs text-gray-600 dark:text-gray-400">Specifics help other Kenyans avoid the same trap.</p>
      </div>
      <Textarea
        value={form.description}
        onChange={(e) => update("description", e.target.value)}
        rows={10}
        placeholder="e.g. On 12 July, someone claiming to be from XYZ Recruitment WhatsApp'd me offering a driver job in Dubai for KES 350,000/month. They asked me to send KES 15,000 to a personal M-Pesa number for 'visa processing.' I paid on 14 July but they stopped responding. The phone is now switched off. I never got any offer letter or receipt."
        className="text-sm"
        data-testid="input-description"
      />
      <p className={`text-xs ${len >= 30 ? "text-emerald-600" : "text-red-500"}`}>
        {len < 30 ? `${30 - len} more characters needed.` : `✓ ${len} characters — good.`}
      </p>
    </div>
  );
}

function StepEvidence({
  files, setFiles, uploadedFileNames, uploading, onUpload, onPick, inputRef, onFiles,
}: {
  files: File[]; setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  uploadedFileNames: string[]; uploading: boolean; onUpload: () => Promise<string | null>;
  onPick: () => void; inputRef: React.RefObject<HTMLInputElement>;
  onFiles: (files: FileList | null) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-bold text-lg text-gray-900 dark:text-white">Evidence (optional but powerful)</h2>
        <p className="text-xs text-gray-600 dark:text-gray-400">WhatsApp screenshots, receipts, offer letters, M-Pesa messages. Up to 50 files · 8 MB each · JPG/PNG/PDF/DOC/DOCX.</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(e) => onFiles(e.target.files)}
        className="hidden"
        data-testid="input-evidence-files"
      />
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}
        className="border-2 border-dashed border-teal-300 dark:border-teal-800 rounded-lg py-6 text-center cursor-pointer hover:bg-teal-50/50 dark:hover:bg-teal-950/20 transition"
        onClick={onPick}
      >
        <Upload className="h-8 w-8 text-teal-500 mx-auto mb-1" />
        <p className="text-sm text-gray-900 dark:text-white font-medium">Tap to attach — or drag files here</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">On mobile, tapping opens the camera + gallery.</p>
      </div>
      {uploadedFileNames.length > 0 && (
        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-md p-3">
          <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200 mb-1">✓ {uploadedFileNames.length} already uploaded</p>
          <ul className="text-[11px] text-emerald-800 dark:text-emerald-300 space-y-0.5 max-h-24 overflow-y-auto">
            {uploadedFileNames.map((n, i) => <li key={i}>· {n}</li>)}
          </ul>
        </div>
      )}
      {files.length > 0 && (
        <>
          <p className="text-xs text-gray-700 dark:text-gray-300 font-semibold">Ready to upload ({files.length}):</p>
          <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-50 dark:bg-gray-900 rounded-md px-2 py-1 text-xs">
                <span className="truncate flex-1">{f.name}</span>
                <span className="text-gray-500 dark:text-gray-400 flex-shrink-0 ml-2">{Math.round(f.size / 1024)} KB</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setFiles((prev) => prev.filter((_, idx) => idx !== i)); }}
                  className="ml-2 text-red-500 hover:text-red-700"
                  data-testid={`button-remove-file-${i}`}
                  type="button"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <Button
            onClick={onUpload}
            disabled={uploading}
            className="w-full"
            data-testid="button-upload-evidence"
          >
            {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…</> : <><Upload className="h-4 w-4 mr-2" /> Upload {files.length} file{files.length === 1 ? "" : "s"}</>}
          </Button>
        </>
      )}
    </div>
  );
}

function StepYou({ form, update }: { form: FormData; update: <K extends keyof FormData>(k: K, v: FormData[K]) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-bold text-lg text-gray-900 dark:text-white">About you (optional)</h2>
        <p className="text-xs text-gray-600 dark:text-gray-400">Anonymous is fine. Giving your email lets us notify you when the report is published or if we need more info.</p>
      </div>
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.isAnonymous}
          onChange={(e) => update("isAnonymous", e.target.checked)}
          className="mt-1"
          data-testid="checkbox-anonymous"
        />
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Submit anonymously</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">No contact info from you.</p>
        </div>
      </label>
      {!form.isAnonymous && (
        <Field label="Your email (for updates)" value={form.reporterEmail} onChange={(v) => update("reporterEmail", v)} type="email" placeholder="you@example.com" testId="input-reporter-email" />
      )}
    </div>
  );
}

function StepReview({
  form, update, filesCount,
}: {
  form: FormData;
  update: <K extends keyof FormData>(k: K, v: FormData[K]) => void;
  filesCount: number;
}) {
  const bits: [string, string | null][] = [
    ["Agency",         form.agencyName || null],
    ["Country",        form.country || null],
    ["Destination",    form.destinationCountry || null],
    ["Job promised",   form.jobApplied || null],
    ["WhatsApp",       form.whatsappNumber || null],
    ["Amount lost",    form.amountLost ? `${form.currency} ${Number(form.amountLost).toLocaleString()}` : null],
    ["Payment method", form.paymentMethod || null],
    ["Evidence files", filesCount > 0 ? String(filesCount) : null],
    ["Submitted by",   form.isAnonymous ? "Anonymous" : (form.reporterEmail || "Anonymous")],
  ];
  const populated = bits.filter(([, v]) => v);
  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-bold text-lg text-gray-900 dark:text-white">Review + submit</h2>
        <p className="text-xs text-gray-600 dark:text-gray-400">Check everything looks right. Go back to any step to edit.</p>
      </div>
      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 space-y-1.5">
        {populated.map(([label, value]) => (
          <div key={label} className="grid grid-cols-3 gap-2 text-sm">
            <span className="text-gray-500 dark:text-gray-400 font-semibold col-span-1">{label}</span>
            <span className="text-gray-900 dark:text-white col-span-2 break-words">{value}</span>
          </div>
        ))}
      </div>
      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-800 rounded-md p-3 space-y-2">
        <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
          <strong>Legal notice:</strong> Your submission is an allegation, not a court finding. WorkAbroadHub publishes reports only after evidence review. False or malicious reports may be removed and reporters may be banned.
        </p>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.agreedToTerms}
            onChange={(e) => update("agreedToTerms", e.target.checked)}
            className="mt-1"
            data-testid="checkbox-agree-terms"
          />
          <span className="text-xs text-amber-900 dark:text-amber-200">
            I confirm the information in this report is truthful to the best of my knowledge, and I understand it may be published after moderation review.
          </span>
        </label>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = "text", testId,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; testId?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10"
        data-testid={testId}
      />
    </div>
  );
}
