/**
 * "Write from Scratch" — AI document generator.
 *
 * Fills the gap in the tools suite: every other AI tool forces the user to
 * upload something first. This one lets them start from zero: fill a short
 * form describing themselves, pay KES 300 (or free for Pro), get a
 * downloadable Word + PDF document.
 *
 * v1 documents: CV, cover letter, recruitment CV (Kenyan-agency Gulf format),
 * reference letter.
 *
 * States (finite-state UI):
 *   pick     — user chooses which doc type
 *   fill     — user fills the form for that type
 *   paying   — waiting for M-Pesa STK confirmation (free users only)
 *   generating — server is running the AI
 *   result   — body rendered, download buttons available
 *   error    — something failed; recover buttons shown
 */

import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { SeoHead } from "@/components/seo-head";
import {
  ArrowLeft,
  FileText,
  Mail,
  Briefcase,
  UserCheck,
  Loader2,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type DocType = "cv" | "cover_letter" | "recruitment_cv" | "reference_letter";

type UiState = "pick" | "fill" | "paying" | "generating" | "result" | "error";

interface DocTypeMeta {
  key: DocType;
  title: string;
  blurb: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const DOC_TYPES: DocTypeMeta[] = [
  {
    key: "cv",
    title: "CV / Resume",
    blurb: "One-page ATS-friendly CV built from your name, role, and years of experience.",
    icon: FileText,
    color: "text-blue-600",
  },
  {
    key: "cover_letter",
    title: "Cover Letter",
    blurb: "Job-specific letter addressed to a real employer, in Kenyan English.",
    icon: Mail,
    color: "text-emerald-600",
  },
  {
    key: "recruitment_cv",
    title: "Recruitment CV",
    blurb: "Gulf/Saudi format with the Personal Data block Kenyan agencies expect.",
    icon: Briefcase,
    color: "text-amber-600",
  },
  {
    key: "reference_letter",
    title: "Reference Letter",
    blurb: "Employer-style letter of recommendation for domestic-worker / hospitality routes.",
    icon: UserCheck,
    color: "text-purple-600",
  },
];

const PRICE_KES = 300;

// ─── Component ──────────────────────────────────────────────────────────────

export default function WriteFromScratchPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [state, setState] = useState<UiState>("pick");
  const [docType, setDocType] = useState<DocType | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [phone, setPhone] = useState("");
  // Set when the server responds { needsPhone: true } — flips the form into
  // "please give us a phone" mode so the user has something actionable to do.
  const [needsPhone, setNeedsPhone] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 2026-07 recovery: on page mount, if the URL carries ?draftId=… restore
  // whatever the server has for that draft — the user's internet dropped
  // mid-generation, or they refreshed, or they came back later. Nobody
  // loses their paid document again.
  //
  // Resume rules:
  //   status = generated → jump straight to result state, load body
  //   status = paid       → fire runGeneration so they get their doc now
  //   status = pending_payment → show the payment-waiting screen again;
  //     the existing 4-second poll picks up when M-Pesa confirms
  //   status = failed     → put them into the error state with a retry
  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get("draftId");
    if (!id) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/write-from-scratch/${id}/body`);
        if (!res.ok) return;
        const j = await res.json();
        if (cancelled) return;

        // Restore the doctype so the header + result-view meta look right.
        if (j.docType && DOC_TYPES.some((d) => d.key === j.docType)) {
          setDocType(j.docType);
        }
        setDraftId(id);

        if (j.status === "generated" && j.body) {
          setBody(j.body);
          setState("result");
        } else if (j.status === "paid") {
          setState("generating");
          runGeneration(id);
        } else if (j.status === "pending_payment") {
          setState("paying");
        } else if (j.status === "failed") {
          setErrorMsg(j.error ?? "Generation didn't complete last time. Try again.");
          setState("error");
        }
      } catch {
        // Silent — the user can pick a new doc if the resume fetch fails
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the URL in sync with the current draftId so a refresh keeps working.
  useEffect(() => {
    if (!draftId) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("draftId") === draftId) return;
    url.searchParams.set("draftId", draftId);
    // Replace (not push) so the back button skips through the state changes.
    window.history.replaceState({}, "", url.toString());
  }, [draftId]);

  const meta = useMemo(() => DOC_TYPES.find((d) => d.key === docType) ?? null, [docType]);

  // Poll payment status while we're waiting for M-Pesa
  useEffect(() => {
    if (state !== "paying" || !draftId) return;
    let stopped = false;

    const tick = async () => {
      try {
        const res = await fetch(`/api/write-from-scratch/${draftId}/status`);
        const j = await res.json();
        if (stopped) return;
        if (j.status === "paid") {
          setState("generating");
          runGeneration(draftId);
        } else if (j.status === "generated" && j.hasBody) {
          setState("result");
        } else if (j.status === "failed") {
          setErrorMsg(j.error ?? "The document could not be generated.");
          setState("error");
        }
      } catch {
        // Silent — will retry next tick
      }
    };
    pollingRef.current = setInterval(tick, 4000);
    return () => {
      stopped = true;
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, draftId]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const pickDoc = (t: DocType) => {
    setDocType(t);
    setForm({});
    setState("fill");
    setErrorMsg(null);
  };

  const startPaymentOrGeneration = async () => {
    if (!docType) return;
    const missing = requiredFields(docType).find((f) => !(form[f] ?? "").trim());
    if (missing) {
      toast({
        title: "Please fill this in",
        description: `"${labelFor(missing)}" is required.`,
        variant: "destructive",
      });
      return;
    }

    setErrorMsg(null);

    try {
      const res = await apiRequest("POST", "/api/write-from-scratch/init", {
        docType,
        input: buildInput(docType, form),
        // Only send an explicit phone if the user typed one in the fallback
        // input (guest users, or logged-in users overriding). If empty, the
        // server auto-uses their registered phone from users.phone.
        phone: phone.trim() || undefined,
      });
      const j = await res.json();

      if (!res.ok) {
        // If the server told us it needs a phone (no phone on file, guest
        // user, whatever) — flip the UI into "collect phone" mode instead of
        // just toasting an error the user can't act on.
        if (j.needsPhone) {
          setNeedsPhone(true);
          toast({
            title: "Please enter your M-Pesa phone",
            description: "We couldn't find a phone on file — add one below and try again.",
            variant: "destructive",
          });
          return;
        }
        toast({
          title: "Could not start",
          description: j.error ?? "Please try again.",
          variant: "destructive",
        });
        return;
      }

      setDraftId(j.draftId);

      {
        // Payment mode — everyone pays KES 300. STK prompt is on the way.
        setState("paying");
        toast({
          title: "Check your phone",
          description: "M-Pesa prompt has been sent. Enter your PIN to complete payment.",
        });
      }
    } catch (err: any) {
      toast({
        title: "Something went wrong",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    }
  };

  const runGeneration = async (id: string) => {
    setState("generating");
    try {
      const res = await apiRequest("POST", `/api/write-from-scratch/${id}/generate`, {});
      const j = await res.json();
      if (!res.ok || !j.body) {
        setErrorMsg(j.error ?? "Generation failed.");
        setState("error");
        return;
      }
      setBody(j.body);
      setState("result");
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Generation failed.");
      setState("error");
    }
  };

  const regenerate = async () => {
    if (!draftId) return;
    // We re-run generate; server clears the failed state before retrying.
    await runGeneration(draftId);
  };

  const downloadFile = (format: "docx" | "pdf") => {
    if (!draftId) return;
    // Trigger a real browser download via window.location so headers are honoured.
    window.location.href = `/api/write-from-scratch/${draftId}/download.${format}`;
  };

  const startOver = () => {
    setState("pick");
    setDocType(null);
    setForm({});
    setPhone("");
    setDraftId(null);
    setBody(null);
    setErrorMsg(null);
    // Clear ?draftId=… so the resume useEffect doesn't ghost-load the
    // previous draft on the next refresh.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("draftId")) {
        url.searchParams.delete("draftId");
        window.history.replaceState({}, "", url.toString());
      }
    } catch { /* ignore */ }
  };

  // ─── Render helpers ──────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <SeoHead
        title="Write CV / Cover Letter From Scratch — WorkAbroad Hub"
        description="Generate a professional CV, cover letter, recruitment CV, or reference letter from just a short description of yourself. No upload required. Word + PDF download."
        canonical="https://workabroadhub.tech/tools/write-from-scratch"
      />
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/tools">
              <Button variant="ghost" size="icon" data-testid="button-back-to-tools">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="font-bold text-lg" data-testid="page-title">
                Write from Scratch
              </h1>
              <p className="text-xs text-muted-foreground">
                {state === "pick"
                  ? "Choose what to generate"
                  : meta
                  ? meta.title
                  : ""}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {state === "pick" && <PickView onPick={pickDoc} />}

        {state === "fill" && meta && (
          <FillView
            meta={meta}
            form={form}
            setForm={setForm}
            phone={phone}
            setPhone={setPhone}
            registeredPhone={(user as any)?.phone ?? null}
            needsPhone={needsPhone}
            onSubmit={startPaymentOrGeneration}
            onBack={() => setState("pick")}
          />
        )}

        {state === "paying" && (
          <WaitView
            title="Waiting for your payment"
            body="Check your phone and enter your M-Pesa PIN. We'll start generating as soon as the payment is confirmed."
            spinner
          />
        )}

        {state === "generating" && (
          <WaitView
            title="Generating your document"
            body="This usually takes 10–20 seconds. Please don't close this page."
            spinner
          />
        )}

        {state === "result" && body && meta && (
          <ResultView
            body={body}
            meta={meta}
            onDownloadDocx={() => downloadFile("docx")}
            onDownloadPdf={() => downloadFile("pdf")}
            onRegenerate={regenerate}
            onStartOver={startOver}
          />
        )}

        {state === "error" && (
          <ErrorView
            message={errorMsg ?? "Something went wrong."}
            onRetry={() => (draftId ? regenerate() : startOver())}
            onStartOver={startOver}
          />
        )}
      </main>
    </div>
  );
}

// ─── Pick view — 4 doc-type tiles ───────────────────────────────────────────

function PickView({ onPick }: { onPick: (t: DocType) => void }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6">
          <h2 className="font-semibold text-lg mb-1">Start from zero — no upload required</h2>
          <p className="text-sm text-muted-foreground">
            Tell us who you are and what you need. We'll write it. Download as Word or PDF.
            <strong>KES {PRICE_KES}</strong> per document, paid via M-Pesa STK prompt to your
            registered phone.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {DOC_TYPES.map((d) => {
          const Icon = d.icon;
          return (
            <Card
              key={d.key}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => onPick(d.key)}
              data-testid={`card-doctype-${d.key}`}
            >
              <CardContent className="p-6 flex items-start gap-4">
                <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                  <Icon className={`h-6 w-6 ${d.color}`} />
                </div>
                <div>
                  <h3 className="font-semibold">{d.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{d.blurb}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Fill view — form for the chosen doc type ───────────────────────────────

function FillView({
  meta,
  form,
  setForm,
  phone,
  setPhone,
  registeredPhone,
  needsPhone,
  onSubmit,
  onBack,
}: {
  meta: DocTypeMeta;
  form: Record<string, string>;
  setForm: (next: Record<string, string>) => void;
  phone: string;
  setPhone: (p: string) => void;
  registeredPhone: string | null;
  needsPhone: boolean;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const fields = fieldsFor(meta.key);

  const set = (name: string, value: string) => setForm({ ...form, [name]: value });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <meta.icon className={`h-5 w-5 ${meta.color}`} />
            </div>
            <div>
              <h2 className="font-semibold">{meta.title}</h2>
              <p className="text-xs text-muted-foreground">{meta.blurb}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.name} className={f.wide ? "sm:col-span-2" : ""}>
                <Label htmlFor={`field-${f.name}`}>
                  {f.label}
                  {f.required && <span className="text-red-500 ml-0.5">*</span>}
                </Label>
                {f.multiline ? (
                  <Textarea
                    id={`field-${f.name}`}
                    value={form[f.name] ?? ""}
                    onChange={(e) => set(f.name, e.target.value)}
                    placeholder={f.placeholder}
                    rows={3}
                    className="mt-1"
                    data-testid={`input-${f.name}`}
                  />
                ) : (
                  <Input
                    id={`field-${f.name}`}
                    type={f.type ?? "text"}
                    value={form[f.name] ?? ""}
                    onChange={(e) => set(f.name, e.target.value)}
                    placeholder={f.placeholder}
                    className="mt-1"
                    data-testid={`input-${f.name}`}
                  />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Payment card — everyone pays KES 300. If we have a phone on file
          from signup we just tell the user which phone we'll charge; otherwise
          collect one inline. */}
      <Card>
        <CardContent className="p-6 space-y-3">
          <div>
            <h3 className="font-semibold text-sm">Payment</h3>
            <p className="text-xs text-muted-foreground">
              One-off <strong>KES {PRICE_KES}</strong> via M-Pesa. You'll get an STK
              prompt on your phone — enter your PIN to authorise.
            </p>
          </div>

          {registeredPhone && !needsPhone ? (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm" data-testid="registered-phone">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
              <span>
                Charging your registered M-Pesa: <strong>{maskPhone(registeredPhone)}</strong>
              </span>
            </div>
          ) : (
            <div>
              <Label htmlFor="field-phone">M-Pesa phone number</Label>
              <Input
                id="field-phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07XX XXX XXX or 2547XX XXX XXX"
                className="mt-1"
                data-testid="input-phone"
              />
              {needsPhone && (
                <p className="text-xs text-red-600 mt-1">
                  We couldn't find a phone on file for your account. Please enter one.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} data-testid="button-back">
          Back
        </Button>
        <Button
          className="flex-1"
          onClick={async () => {
            setSubmitting(true);
            try {
              await onSubmit();
            } finally {
              setSubmitting(false);
            }
          }}
          disabled={submitting}
          data-testid="button-submit"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : null}
          Pay KES {PRICE_KES} via M-Pesa
        </Button>
      </div>
    </div>
  );
}

/**
 * Mask a phone so we show enough for the user to recognise their own number
 * without leaking it in screenshots or shoulder-surfing. "254712345678"
 * becomes "0712 *** 678"; short/odd formats fall back to the raw string.
 */
function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  let normalised = digits;
  if (normalised.startsWith("254")) normalised = "0" + normalised.slice(3);
  if (normalised.length !== 10) return raw;
  return `${normalised.slice(0, 4)} *** ${normalised.slice(7)}`;
}

// ─── Wait view — used for both paying + generating ──────────────────────────

function WaitView({
  title,
  body,
  spinner,
}: {
  title: string;
  body: string;
  spinner?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-8 text-center space-y-4">
        {spinner && <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto" />}
        <h2 className="font-semibold text-lg">{title}</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">{body}</p>
      </CardContent>
    </Card>
  );
}

// ─── Result view — preview + download ───────────────────────────────────────

function ResultView({
  body,
  meta,
  onDownloadDocx,
  onDownloadPdf,
  onRegenerate,
  onStartOver,
}: {
  body: string;
  meta: DocTypeMeta;
  onDownloadDocx: () => void;
  onDownloadPdf: () => void;
  onRegenerate: () => void;
  onStartOver: () => void;
}) {
  return (
    <div className="space-y-4">
      <Card className="bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900">
        <CardContent className="p-4 flex items-start gap-3">
          <CheckCircle2 className="h-6 w-6 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-emerald-800 dark:text-emerald-200">
              Your {meta.title.toLowerCase()} is ready
            </p>
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              Preview below. Download as Word (editable) or PDF (send-ready).
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onDownloadDocx} data-testid="button-download-docx">
          <Download className="h-4 w-4 mr-2" /> Download Word
        </Button>
        <Button onClick={onDownloadPdf} variant="secondary" data-testid="button-download-pdf">
          <Download className="h-4 w-4 mr-2" /> Download PDF
        </Button>
        <Button
          variant="outline"
          onClick={onRegenerate}
          data-testid="button-regenerate"
        >
          <RefreshCw className="h-4 w-4 mr-2" /> Regenerate
        </Button>
        <Button variant="ghost" onClick={onStartOver} data-testid="button-start-over">
          Start over
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed" data-testid="text-preview">
            {body}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Error view ─────────────────────────────────────────────────────────────

function ErrorView({
  message,
  onRetry,
  onStartOver,
}: {
  message: string;
  onRetry: () => void;
  onStartOver: () => void;
}) {
  return (
    <Card className="border-amber-300">
      <CardContent className="p-8 text-center space-y-4">
        <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
        <h2 className="font-semibold text-lg">Something didn't work</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">{message}</p>
        <div className="flex flex-wrap gap-2 justify-center">
          <Button onClick={onRetry} data-testid="button-retry">Try again</Button>
          <Button variant="outline" onClick={onStartOver} data-testid="button-start-over-error">
            Start over
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Field definitions per doc type ─────────────────────────────────────────

interface Field {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  wide?: boolean;
  type?: string;
}

function fieldsFor(t: DocType): Field[] {
  const common: Field[] = [
    { name: "fullName",       label: "Full name",        placeholder: "e.g. Anthony Mulaanthonyke", required: true },
    { name: "role",           label: "Target role",      placeholder: "e.g. Registered Nurse, Truck Driver, Marketing Manager", required: true },
    { name: "yearsExperience",label: "Years of experience", placeholder: "e.g. 5", required: true, type: "number" },
    { name: "keySkills",      label: "Key skills",       placeholder: "Comma-separated. e.g. patient care, IV therapy, mentoring juniors", required: true, multiline: true, wide: true },
    { name: "location",       label: "Current location", placeholder: "e.g. Nairobi, Kenya" },
    { name: "targetCountry",  label: "Target country",   placeholder: "e.g. Saudi Arabia, UK" },
    { name: "phone",          label: "Phone",            placeholder: "+254 7XX XXX XXX" },
    { name: "email",          label: "Email",            placeholder: "you@example.com", type: "email" },
    { name: "education",      label: "Education",        placeholder: "e.g. BSc Nursing, Kenyatta University, 2018", multiline: true, wide: true },
    { name: "extras",         label: "Extras (certs, languages, awards)", placeholder: "e.g. BLS-certified 2024, fluent in Swahili + English + basic Arabic", multiline: true, wide: true },
  ];

  switch (t) {
    case "cv":
      return common;
    case "cover_letter":
      return [
        ...common,
        { name: "employerName", label: "Employer name",  placeholder: "e.g. Al Ahli Hospital", wide: true },
        { name: "jobTitle",     label: "Exact job title", placeholder: "e.g. Staff Nurse — ICU" },
        { name: "jobSource",    label: "Where you saw the job", placeholder: "e.g. LinkedIn, hospital website" },
      ];
    case "recruitment_cv":
      return [
        ...common.filter((f) => f.name !== "targetCountry"),
        { name: "destinationCountry", label: "Destination country", placeholder: "e.g. Saudi Arabia, UAE, Qatar", required: true },
        { name: "agencyName",    label: "Kenyan recruitment agency", placeholder: "e.g. XYZ Recruiters Ltd (optional)" },
      ];
    case "reference_letter":
      return [
        { name: "employerName",     label: "Your name (author of the letter)", placeholder: "e.g. James Kamau", required: true },
        { name: "employerTitle",    label: "Your title",                      placeholder: "e.g. General Manager", required: true },
        { name: "employerCompany",  label: "Company",                          placeholder: "e.g. ABC Restaurant Nairobi", required: true },
        { name: "employerCountry",  label: "Company country",                  placeholder: "e.g. Kenya" },
        { name: "candidateName",    label: "Person being referenced",          placeholder: "e.g. Anthony Mulaanthonyke", required: true },
        { name: "candidateRole",    label: "Their role at your company",       placeholder: "e.g. Head Chef", required: true },
        { name: "yearsWorked",      label: "Years they worked with you",       placeholder: "e.g. 3", required: true, type: "number" },
        { name: "relationship",     label: "Your relationship",                placeholder: "e.g. direct supervisor for 3 years" },
        { name: "keyStrengths",     label: "Their key strengths",              placeholder: "Free text — what they were great at", required: true, multiline: true, wide: true },
      ];
  }
}

function requiredFields(t: DocType): string[] {
  return fieldsFor(t).filter((f) => f.required).map((f) => f.name);
}

function labelFor(name: string): string {
  const all = DOC_TYPES.flatMap((d) => fieldsFor(d.key));
  return all.find((f) => f.name === name)?.label ?? name;
}

// Convert form key/value strings into the shape the server prompts expect.
function buildInput(t: DocType, form: Record<string, string>): any {
  const out: any = { ...form };
  if (out.yearsExperience) out.yearsExperience = Number(out.yearsExperience);
  if (out.yearsWorked) out.yearsWorked = Number(out.yearsWorked);
  return out;
}
