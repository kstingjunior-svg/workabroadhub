/**
 * Unified service-order flow — handles every paid AI service via one component.
 *
 * Route: /services/order/:slug   (e.g. /services/order/cv_fix_lite)
 *
 * Three stages:
 *   1. UPLOAD     — pick CV + optional inputs (job desc, target country)
 *   2. PROCESSING — AI is generating; polls /status every 2.5s
 *   3. DONE       — download buttons (PDF + Word)
 */
import { useEffect, useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Upload,
  FileText,
  Loader2,
  Download,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Sparkles,
  Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fetchCsrfToken } from "@/lib/queryClient";
import { StkReadyModal } from "@/components/stk-ready-modal";
import { useAuth } from "@/hooks/use-auth";
import { ShareSuccessModal } from "@/components/share-success-modal";
import type { ShareCardProps } from "@/components/share-success-card";
import { captureRefFromUrl, getStoredRef, clearStoredRef } from "@/lib/referral";
import { PhotoUploadField } from "@/components/photo-upload-field";
import { DeliveryBanner, triggerDownload, type DeliveryBannerStage } from "@/components/delivery-banner";

interface ServiceMeta {
  name: string;
  needsCv: boolean;
  needsCountry: boolean;
  needsJobDescription: boolean;
  description: string;
}

const SERVICE_META: Record<string, ServiceMeta> = {
  cv_fix_lite: {
    name: "CV Revamp",
    needsCv: true,
    needsCountry: false,
    needsJobDescription: false,
    description: "We'll clean up grammar, formatting and structure on your CV. Same content — sharper presentation.",
  },
  ats_cv_optimization: {
    name: "ATS CV Optimization",
    needsCv: true,
    needsCountry: false,
    needsJobDescription: true,
    description: "We'll rewrite your CV with industry keywords + clean ATS-safe format so it passes recruiter filters.",
  },
  cv_rewrite: {
    name: "Country-Specific CV Rewrite",
    needsCv: true,
    needsCountry: true,
    needsJobDescription: false,
    description: "We'll restructure your CV to match the format and conventions of your target country.",
  },
  cover_letter: {
    name: "Cover Letter",
    needsCv: true,
    needsCountry: false,
    needsJobDescription: true,
    description: "A custom 300-word cover letter tailored to your CV and the job you're applying for.",
  },
  sop_writing: {
    name: "Statement of Purpose",
    needsCv: false,
    needsCountry: true,
    needsJobDescription: true,
    description: "A compelling 800-1000 word SOP for university or scholarship applications.",
  },
  motivation_letter: {
    name: "Motivation Letter",
    needsCv: false,
    needsCountry: true,
    needsJobDescription: true,
    description: "A formal motivation letter for EU programs, scholarships, or work permit applications.",
  },
  linkedin_optimization: {
    name: "LinkedIn Profile Optimization",
    needsCv: true,
    needsCountry: false,
    needsJobDescription: false,
    description: "Optimised headline, summary, skill keywords and experience bullets for your LinkedIn profile.",
  },
  interview_coaching: {
    name: "Interview Coaching Pack",
    needsCv: true,
    needsCountry: false,
    needsJobDescription: true,
    description: "Likely questions, STAR-method sample answers, and what to ask the interviewer.",
  },
  ats_cover_bundle: {
    name: "ATS + Cover Letter Bundle",
    needsCv: true,
    needsCountry: false,
    needsJobDescription: true,
    description: "An ATS-optimized CV plus a matching cover letter — one package, best value deal.",
  },
};

type Stage = "upload" | "paying" | "processing" | "done" | "failed" | "awaiting_review";

export default function ServiceOrderFlow() {
  const [match, params] = useRoute<{ slug: string }>("/services/order/:slug");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const slug = params?.slug ?? "";
  const meta = SERVICE_META[slug];

  const [stage, setStage] = useState<Stage>("upload");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [serviceName, setServiceName] = useState<string>("");
  const [estSeconds, setEstSeconds] = useState<number>(60);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [cvFile, setCvFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [targetCountry, setTargetCountry] = useState("");
  const [extraInput, setExtraInput] = useState("");
  // 2026-07 (Tony's founder ask): optional passport-style photo the user
  // wants embedded in the delivered CV. Blob (compressed JPEG), not File —
  // PhotoUploadField handles the compression. Null when skipped.
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);

  // ── Payment-stage state (standalone M-Pesa STK on the same page) ─────────
  const [amount, setAmount] = useState<number>(0);
  const [mpesaPhone, setMpesaPhone] = useState<string>("");
  const [payingNow, setPayingNow] = useState<boolean>(false);
  const [stkSent, setStkSent] = useState<boolean>(false);

  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Guest checkout (2026-08, Tony's anonymous-purchase directive) ────────
  // If not signed in, collect name/email/phone at checkout so we can deliver
  // the finished document via email magic-link (no account required). Server
  // returns a downloadToken we then use to poll /status and download files.
  const { user } = useAuth();
  const isAnonymous = !user;
  const [guestName, setGuestName] = useState<string>("");
  const [guestEmail, setGuestEmail] = useState<string>("");
  const [guestPhone, setGuestPhone] = useState<string>("");
  const [downloadToken, setDownloadToken] = useState<string | null>(null);

  // Restore token from localStorage on mount so refreshes / return visits
  // keep working. Keyed by orderId (set once we have one).
  useEffect(() => {
    if (!orderId) return;
    try {
      const stored = localStorage.getItem(`wah_download_token:${orderId}`);
      if (stored && !downloadToken) setDownloadToken(stored);
    } catch { /* private mode / quota — silent */ }
  }, [orderId, downloadToken]);

  // ── Viral share loop ─────────────────────────────────────────────────────
  // 2026-07 (growth): after a successful order, auto-open the ShareSuccessModal.
  // Every paying user becomes a billboard — see /components/share-success-modal.tsx.
  const [shareOpen, setShareOpen] = useState(false);
  const [autoOpenedShare, setAutoOpenedShare] = useState(false);
  const [deliveredScore, setDeliveredScore] = useState<number | null>(null);
  // Success-screen download state (mobile-safe fetch → blob → save)
  const [downloadBusy, setDownloadBusy] = useState<"pdf" | "docx" | null>(null);
  const [downloadErrorMsg, setDownloadErrorMsg] = useState<string | null>(null);
  // Flips true after the FIRST successful download — used to gate the
  // share modal so we never cover the download buttons pre-download.
  const [downloadedOnce, setDownloadedOnce] = useState(false);

  useEffect(() => () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
  }, []);

  // ── Auto-save intake draft (2026-08, Tony's Kenyan mobile UX ask) ────────
  // Kenyans on 3G lose network mid-form all the time. Save every keystroke
  // to localStorage (throttled to 500ms) so a page refresh or dropped signal
  // doesn't wipe out target country + job description + extras. Restored on
  // mount so returning users pick up right where they left off.
  //
  // Per-slug key so different services don't stomp each other. Draft is
  // cleared once the order successfully submits. Never includes the CV file
  // or photo — those are handled separately and would blow through the
  // ~5 MB localStorage quota.
  const DRAFT_KEY = `wah_service_intake_draft:${slug}`;
  const [draftSaved, setDraftSaved] = useState<boolean>(false);

  // Restore on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (typeof draft?.jobDescription === "string" && draft.jobDescription) setJobDescription(draft.jobDescription);
      if (typeof draft?.targetCountry === "string"  && draft.targetCountry)  setTargetCountry(draft.targetCountry);
      if (typeof draft?.extraInput === "string"     && draft.extraInput)     setExtraInput(draft.extraInput);
      if (draft?.jobDescription || draft?.targetCountry || draft?.extraInput) {
        setDraftSaved(true);
      }
    } catch { /* corrupted draft — treat as no draft */ }
    // Only run on mount / slug change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Save with a small debounce so we don't hit localStorage on every keystroke
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        const anyContent = !!(jobDescription || targetCountry || extraInput);
        if (!anyContent) {
          localStorage.removeItem(DRAFT_KEY);
          setDraftSaved(false);
          return;
        }
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          jobDescription, targetCountry, extraInput, savedAt: Date.now(),
        }));
        setDraftSaved(true);
      } catch { /* quota exceeded / private mode — silent */ }
    }, 500);
    return () => window.clearTimeout(t);
  }, [jobDescription, targetCountry, extraInput, DRAFT_KEY]);

  // Clear draft the moment we successfully move to payment/generating stage —
  // the intake is already captured server-side by then.
  useEffect(() => {
    if (stage === "generating" || stage === "done") {
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
      setDraftSaved(false);
    }
  }, [stage, DRAFT_KEY]);

  // Resume a returning user (after payment redirect) if URL has ?order=<id>
  useEffect(() => {
    const urlOrder = new URLSearchParams(window.location.search).get("order");
    if (urlOrder && !orderId) {
      setOrderId(urlOrder);
      setStage("processing");
      startPolling(urlOrder);
    }
    // 2026-07 (viral share loop): capture any ?ref=X on this page too so
    // users who deep-link into a service page still carry the attribution.
    captureRefFromUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2026-08 (Tony): the share modal used to auto-open ~1.2s after "done".
  // That was blocking the red/blue download buttons on mobile — users
  // couldn't reach them, couldn't scroll it away, and left without their
  // CV. Now the share modal only opens after the user has clicked at
  // least one download button. `autoOpenedShare` still guards it firing
  // more than once so we never nag people.
  useEffect(() => {
    if (stage !== "done" || !orderId || autoOpenedShare) return;
    if (downloadBusy !== null) return;                 // still downloading
    if (!downloadedOnce) return;                       // haven't downloaded yet
    const t = window.setTimeout(() => {
      setShareOpen(true);
      setAutoOpenedShare(true);
    }, 900);
    return () => window.clearTimeout(t);
  }, [stage, orderId, autoOpenedShare, downloadedOnce, downloadBusy]);

  // Compute the ShareCard variant from the slug so the accent colour + copy
  // fit the actual service the user just paid for.
  function cardVariantFromSlug(): ShareCardProps["variant"] {
    if (slug.startsWith("cv_") || slug.startsWith("ats_cv")) return "cv";
    if (slug.startsWith("linkedin"))                          return "linkedin";
    if (slug.startsWith("cover"))                             return "cover";
    if (slug.startsWith("sop") || slug.startsWith("motivation")) return "sop";
    return "generic";
  }

  if (!match || !meta) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground mb-3" />
        <h2 className="text-lg font-semibold">Service not found</h2>
        <p className="text-sm text-muted-foreground mb-4">We couldn't find the service "{slug}".</p>
        <Button variant="outline" onClick={() => navigate("/services")}>Browse services</Button>
      </div>
    );
  }

  function handleFile(f: File) {
    // 2026-07: matches the loosened server-side multer config — 10 MB cap,
    // accepts PDF, Word, AND phone-camera images (JPG/PNG/WEBP/HEIC).
    // Previously blocked users who tried to upload a photo of their CV
    // or a slightly-large scan.
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif",
    ];
    if (!allowed.includes(f.type)) {
      toast({
        title: "File type not supported",
        description: "Please upload a PDF, Word document, or a clear photo of your CV.",
        variant: "destructive",
      });
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please compress your CV under 10 MB or upload a smaller version.",
        variant: "destructive",
      });
      return;
    }
    setCvFile(f);
  }

  function startPolling(id: string) {
    if (pollRef.current) window.clearInterval(pollRef.current);
    // 2026-06 RESILIENCE: track when polling started so we can show a clear
    // "still working — we'll email you" message after 2 min instead of
    // letting the user stare at an infinite spinner if the AI step hangs.
    const startedAt = Date.now();
    let slowMessageShown = false;
    pollRef.current = window.setInterval(async () => {
      try {
        // 2026-08 (guest orders): append ?token=xxx when we have one so
        // anonymous polls still work — server accepts token as auth alt.
        const statusUrl = downloadToken
          ? `/api/services/order/${id}/status?token=${encodeURIComponent(downloadToken)}`
          : `/api/services/order/${id}/status`;
        const res = await fetch(statusUrl, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "completed") {
          if (pollRef.current) window.clearInterval(pollRef.current);
          setServiceName(data.serviceName || meta.name);
          // Capture any delivered ATS score so the share card can display it.
          // Server may report it as `deliveredScore` or `atsScore` — accept both.
          const score = Number(data.deliveredScore ?? data.atsScore ?? 0);
          if (Number.isFinite(score) && score > 0) setDeliveredScore(score);
          setStage("done");
        } else if (data.status === "failed") {
          if (pollRef.current) window.clearInterval(pollRef.current);
          setErrorMsg(data.error ?? "Processing failed. We'll keep retrying and email you when it's ready — or contact support and we'll regenerate it immediately.");
          setStage("failed");
        } else if (data.status === "awaiting_review") {
          // 2026-08 (Tony bug fix): quality guardrail caught the AI producing
          // a substandard output (usually input too complex — heavy technical
          // content, long CV, or mixed script). Terminal state — stop polling,
          // show the friendly "under review" screen. Team follow-up within 4h.
          if (pollRef.current) window.clearInterval(pollRef.current);
          setServiceName(data.serviceName || meta.name);
          setStage("awaiting_review");
        } else {
          // Still pending or processing — surface a softer message after 2 min
          // so the user knows we haven't forgotten them.
          const elapsedSec = (Date.now() - startedAt) / 1000;
          if (elapsedSec > 120 && !slowMessageShown) {
            slowMessageShown = true;
            toast({
              title: "Still working on it",
              description: "Taking longer than usual. We'll keep trying in the background and email/WhatsApp you the moment it's ready. You can safely close this tab.",
              duration: 12000,
            });
          }
        }
      } catch {
        /* transient — keep polling */
      }
    }, 2500);
  }

  async function handleSubmit() {
    if (meta.needsCv && !cvFile) {
      toast({ title: "Upload your CV", description: "We need your CV to generate the document.", variant: "destructive" });
      return;
    }
    // Guest checkout: name/email/phone all required (server double-validates).
    // We front-load the check so the user sees the error inline before waiting
    // for a network round-trip.
    if (isAnonymous) {
      if (!guestName.trim() || !guestEmail.trim() || !guestPhone.trim()) {
        toast({
          title: "A few quick details",
          description: "Please enter your name, email, and phone so we can email you your finished document.",
          variant: "destructive",
        });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) {
        toast({ title: "Check your email", description: "That email doesn't look right — please double-check it.", variant: "destructive" });
        return;
      }
    }
    setSubmitting(true);
    try {
      const csrf = await fetchCsrfToken();
      const form = new FormData();
      if (cvFile) form.append("cv", cvFile);
      if (jobDescription) form.append("jobDescription", jobDescription);
      if (targetCountry)  form.append("targetCountry", targetCountry);
      if (extraInput)     form.append("extraInput", extraInput);
      // Guest fields — server ignores these when a session cookie is present.
      if (isAnonymous) {
        form.append("guestName",  guestName.trim());
        form.append("guestEmail", guestEmail.trim().toLowerCase());
        form.append("guestPhone", guestPhone.trim());
      }
      // 2026-07 (photo embed): attach optional headshot for top-right
      // placement in the delivered PDF/DOCX. Named "photo" per multer field.
      if (photoBlob) {
        // Give it a friendly filename with the right extension so the server's
        // multer error messages (if any) mention a sensible name.
        const photoFile = new File([photoBlob], "photo.jpg", { type: photoBlob.type || "image/jpeg" });
        form.append("photo", photoFile);
      }
      // 2026-07 (viral share loop): attach the stored referrer if present.
      // Server re-validates + attributes on successful order creation.
      const referrer = getStoredRef();
      if (referrer) {
        form.append("referrerOrderId", referrer);
        // Clear immediately so a subsequent unrelated order doesn't
        // double-attribute. If order creation fails, the client can still
        // recover the ref from the /share/:token localStorage capture on
        // the visitor's next page load — but this order's attempt is done.
        clearStoredRef();
      }

      // 2026-06: was failing as "Failed to fetch" (raw browser TypeError) on
      // flaky mobile networks + Render cold starts. Now we retry once with
      // a 2.5s wait on the specific TypeError, and surface a HUMAN error
      // message with an actionable next step if both attempts fail. Susan
      // reported this on a 24KB file — clearly network, not size. Reported
      // by founder via screenshot 2026-06.
      async function postOnce(): Promise<Response> {
        return fetch(`/api/services/order/${slug}`, {
          method: "POST",
          credentials: "include",
          headers: { "X-CSRF-Token": csrf },
          body: form,
        });
      }

      // 2026-07 v2 (Tony's "Connection issue" user report): 8 attempts with
      // exponential backoff (0/1/4/8/15/25/30/30s = 113s total window).
      // Render free-tier cold starts routinely hit 60-90s and the previous
      // 53s window would time out with the server still warming up. New
      // ladder covers the worst realistic cold-start case.
      let res: Response | null = null;
      const backoffs = [0, 1000, 4000, 8000, 15000, 25000, 30000, 30000];
      let lastNetErr: any = null;
      let warmingToastShown = false;
      for (let attempt = 0; attempt < backoffs.length; attempt++) {
        if (backoffs[attempt] > 0) {
          console.warn(`[service-order] attempt ${attempt + 1}: waiting ${backoffs[attempt]}ms before retry (last error: ${lastNetErr?.message ?? "unknown"})`);
          if (!warmingToastShown && attempt >= 1) {
            toast({
              title: "Warming up…",
              description: "Our server is just waking up — this can take up to a minute. We are retrying automatically, please don't refresh.",
              duration: 45000,
            });
            warmingToastShown = true;
          }
          await new Promise((r) => setTimeout(r, backoffs[attempt]));
        }
        try {
          res = await postOnce();
          break; // success — got a Response (even 4xx/5xx is a Response, not a network error)
        } catch (netErr: any) {
          lastNetErr = netErr;
          const isNet = netErr?.name === "TypeError" || /failed to fetch|networkerror|network request failed/i.test(netErr?.message ?? "");
          if (!isNet || attempt === backoffs.length - 1) {
            throw netErr;
          }
          // else: fall through and retry
        }
      }
      if (!res) throw lastNetErr ?? new Error("Failed to reach server after multiple attempts");
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 && /verify/i.test(data?.message ?? "")) {
          // 2026-07 (Tony's conversion audit): thread returnTo so users land
          // right back on THIS order page after verifying — no lost intent.
          toast({ title: "Verify your account", description: "Redirecting…" });
          const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
          setTimeout(() => navigate(`/account/verify?returnTo=${returnTo}`), 1200);
          return;
        }
        throw new Error(data?.message || "Could not create order.");
      }

      setOrderId(data.orderId);
      setServiceName(data.serviceName);
      setEstSeconds(data.estSeconds || 60);
      setAmount(data.price ?? 0);

      // 2026-08 (guest orders): persist the download token so refresh doesn't
      // orphan the order. Also auto-fill the M-Pesa phone field so the guest
      // doesn't have to type it twice.
      if (data.downloadToken && data.orderId) {
        setDownloadToken(data.downloadToken);
        try {
          localStorage.setItem(`wah_download_token:${data.orderId}`, data.downloadToken);
        } catch { /* private mode — token still lives in state for this session */ }
      }
      if (isAnonymous && guestPhone && !mpesaPhone) {
        setMpesaPhone(guestPhone.trim());
      }

      if (data.needsPayment && data.price > 0) {
        // Stay on the SAME page — show the inline M-Pesa STK pay UI so the
        // user pays for THIS service (not pushed to the Pro Plan upgrade).
        setStage("paying");
      } else {
        setStage("processing");
        startPolling(data.orderId);
      }
    } catch (err: any) {
      // 2026-06: friendlier copy. Founder reported "Failed to fetch" was
      // surfacing as-is to users. Translate it into a Kenyan-friendly line.
      const isNetwork =
        err?.name === "TypeError" ||
        /failed to fetch|networkerror|network request failed/i.test(err?.message ?? "");
      // 2026-07: reframed error UX. If the network truly could not be
      // reached after 6 attempts (53s), we show a soft "connection issue"
      // banner (not destructive red) with a Retry button implied via
      // the button they can tap again. The scary "Couldn't reach our
      // server" title is gone — Tony's screenshot showed users freaking
      // out because it looked like the app was broken.
      // 2026-07 v3 (Tony's user stuck in retry loop): reframed message so
      // the user knows it's the server warming up (not their fault) and
      // gives them a specific action: wait 30 sec then retry. Also fires
      // a background health-ping so the next attempt hits a warm server.
      fetch("/api/health/live").catch(() => {});   // wake it up NOW for the next tap
      toast({
        title: isNetwork ? "Our server is waking up — one more try" : "Order couldn't be created",
        description: isNetwork
          ? "This happens on the first request after a quiet period. Wait 30 seconds, then tap Continue to Payment. The next try almost always works. Still stuck? WhatsApp +254 111 467 601."
          : (err?.message || "Something went wrong. Please try again."),
        variant: isNetwork ? "default" : "destructive",
        duration: 12_000,
      });
    } finally {
      setSubmitting(false);
    }
  }

  // 2026-08 (Tony's payment-failure audit): pre-STK Get Ready gate. The
  // "Pay KES X" button now opens the Get Ready modal instead of firing STK
  // directly. onConfirmed runs the actual payForService function below.
  const [readyOpen, setReadyOpen] = useState(false);
  function openReadyGate() {
    // Cheap client-side phone validity check first so we don't gate the user
    // through the modal only to bounce them on invalid phone.
    const phoneClean = mpesaPhone.replace(/\s+/g, "").trim();
    if (!/^(?:0|254|\+254)?7\d{8}$/.test(phoneClean) && !/^(?:0|254|\+254)?1\d{8}$/.test(phoneClean)) {
      toast({
        title: "Invalid M-Pesa number",
        description: "Use 07XXXXXXXX, 01XXXXXXXX, or +254XXXXXXXXX",
        variant: "destructive",
      });
      return;
    }
    setReadyOpen(true);
  }

  // ── STANDALONE M-PESA STK PUSH ──────────────────────────────────────────────
  // Triggered by the "Pay KES X via M-Pesa" button on the paying stage. Calls
  // /api/payments/initiate with the service slug as the serviceId so the
  // payment pipeline knows to mark THIS service order as paid (and not treat
  // it as a Pro Plan upgrade). On success we transition to processing and
  // poll the order status — once the M-Pesa callback marks it 'paid', the
  // server's processOrder() runs the AI generation, and status flips to
  // 'completed', at which point this same page shows the download buttons.
  async function payForService() {
    if (!orderId) return;
    const phoneClean = mpesaPhone.replace(/\s+/g, "").trim();
    if (!/^(?:0|254|\+254)?7\d{8}$/.test(phoneClean) && !/^(?:0|254|\+254)?1\d{8}$/.test(phoneClean)) {
      toast({
        title: "Invalid M-Pesa number",
        description: "Use 07XXXXXXXX, 01XXXXXXXX, or +254XXXXXXXXX",
        variant: "destructive",
      });
      return;
    }
    setPayingNow(true);
    try {
      const csrf = await fetchCsrfToken();

      // 2026-08 (guest orders): TWO payment paths, one UX.
      //   Logged-in path: /api/payments/initiate + /api/mpesa/stk (2 hops,
      //                   fraud checks, account-lockout guards, all the
      //                   existing enterprise machinery).
      //   Guest path:     /api/services/order/:id/pay-guest (1 hop, auth'd
      //                   by the download token minted at order creation,
      //                   fires STK push directly with the guest's phone).
      if (isAnonymous) {
        if (!downloadToken) {
          throw new Error("Payment link expired. Please refresh the page and try again.");
        }
        const payRes = await fetch(`/api/services/order/${orderId}/pay-guest`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
          body: JSON.stringify({ token: downloadToken, phone: phoneClean }),
        });
        const payData = await payRes.json();
        if (!payRes.ok || payData?.success === false) {
          throw new Error(payData?.message || "Could not send M-Pesa prompt. Please try again.");
        }
      } else {
        // ─── STEP 1: create the pending payment row (DB) ────────────────────
        // Returns paymentId / checkoutRequestId — but does NOT send STK push yet.
        const initRes = await fetch("/api/payments/initiate", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
          body: JSON.stringify({
            method: "mpesa",
            phoneNumber: phoneClean,
            serviceId: slug,
            serviceName: serviceName || meta.name,
            serviceOrderId: orderId,            // payment pipeline reads this to mark THIS order paid
          }),
        });
        const initData = await initRes.json();
        if (!initRes.ok || initData?.success === false) {
          if (initRes.status === 403 && /verify/i.test(initData?.message ?? "")) {
            toast({ title: "Verify your account first", description: "Redirecting…" });
            const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
            setTimeout(() => navigate(`/account/verify?returnTo=${returnTo}`), 1200);
            return;
          }
          throw new Error(initData?.message || initData?.error || "Could not create payment record.");
        }
        const paymentId = initData?.paymentId ?? initData?.checkoutRequestId ?? initData?.checkout_request_id;
        if (!paymentId) {
          throw new Error("Server did not return a paymentId. Cannot trigger STK push.");
        }

        // ─── STEP 2: actually trigger the Safaricom STK push ────────────────
        // This is what makes the M-Pesa prompt appear on the user's phone.
        const stkRes = await fetch("/api/mpesa/stk", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
          body: JSON.stringify({ checkoutRequestId: paymentId }),
        });
        const stkData = await stkRes.json();
        if (!stkRes.ok || stkData?.success === false) {
          throw new Error(stkData?.message || stkData?.error || "Safaricom STK push failed. Try again.");
        }
      }

      setStkSent(true);
      toast({
        title: "STK push sent to your phone",
        description: "Check your phone now — enter your M-Pesa PIN to complete payment.",
      });
      // Transition to processing. The M-Pesa callback marks the order paid
      // which triggers AI generation. We poll for status="completed".
      setStage("processing");
      startPolling(orderId);
    } catch (err: any) {
      toast({ title: "Payment failed", description: err.message, variant: "destructive" });
    } finally {
      setPayingNow(false);
    }
  }

  // ── PAYPAL FLOW (any country) ────────────────────────────────────────────
  // For users outside Kenya (Zimbabwe, Tanzania, South Africa, Egypt, etc.)
  // where M-Pesa isn't available. Creates a PayPal order, redirects the
  // user to PayPal's approval page, then processes the return via
  // /api/service-orders/:id/paypal-complete.
  async function payWithPayPal() {
    if (!orderId) return;
    setPayingNow(true);
    try {
      const csrf = await fetchCsrfToken();
      const res = await fetch("/api/paypal/create-order", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({
          amount:     amount,
          serviceId:  slug,
          serviceOrderId: orderId,
          description: serviceName || meta.name,
          returnUrl: window.location.origin + window.location.pathname + `?paypalReturn=1&orderId=${orderId}`,
          cancelUrl: window.location.origin + window.location.pathname,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Could not start PayPal payment. Please try again or use M-Pesa.");
      }
      if (!data?.approvalUrl) {
        throw new Error("PayPal did not return an approval URL. Please try again.");
      }
      // Redirect the whole tab to PayPal — user will complete payment there,
      // then PayPal redirects them back to the returnUrl above.
      window.location.href = data.approvalUrl;
    } catch (err: any) {
      toast({ title: "PayPal error", description: err.message, variant: "destructive" });
      setPayingNow(false);
    }
  }

  // 2026-07: silent pre-warm on mount. GET /api/health/live wakes the
  // Render container so by the time the user submits the CV, the server
  // is already warm. Fire-and-forget — errors are ignored.
  //
  // 2026-07 v2 (Tony's "Connection issue" report): bumped timeout 15s→45s.
  // Render free-tier cold starts routinely hit 30-60s and my previous 15s
  // ping was abandoning before the container was actually warm — meaning
  // by the time the user tapped Continue to Payment, the server was still
  // cold and their 53s retry window ran out. Second ping fires at 20s in
  // case the first fails.
  useEffect(() => {
    (async () => {
      try {
        const ctl = new AbortController();
        const to  = setTimeout(() => ctl.abort(), 45_000);
        await fetch("/api/health/live", { signal: ctl.signal }).catch(() => {});
        clearTimeout(to);
      } catch {}
    })();
    // Second warmup ping 20s later — belt-and-suspenders for the case where
    // the first ping itself was queued behind the cold start.
    const secondPing = setTimeout(() => {
      fetch("/api/health/live").catch(() => {});
    }, 20_000);
    return () => clearTimeout(secondPing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On mount: if we're returning from PayPal (?paypalReturn=1), capture the payment.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("paypalReturn") !== "1") return;
    const returnOrderId = params.get("orderId");
    const paypalOrderId = params.get("token") || params.get("paymentId");
    if (!returnOrderId || !paypalOrderId) return;

    (async () => {
      try {
        const csrf = await fetchCsrfToken();
        const captureRes = await fetch(`/api/paypal/capture-order`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
          body: JSON.stringify({ paypalOrderId }),
        });
        const cap = await captureRes.json();
        if (!captureRes.ok) throw new Error(cap?.message || "PayPal capture failed");
        // Then confirm at the service-order level
        await fetch(`/api/service-orders/${returnOrderId}/paypal-complete`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
          body: JSON.stringify({ transactionId: cap?.transactionId ?? paypalOrderId }),
        });
        toast({
          title: "PayPal payment received",
          description: "Your document is being generated now — this page will update in a few seconds.",
        });
        setStage("processing");
        startPolling(returnOrderId);
        // Clean the URL so a refresh doesn't re-capture
        window.history.replaceState({}, "", window.location.pathname);
      } catch (err: any) {
        toast({ title: "PayPal capture failed", description: err.message, variant: "destructive" });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2026-07 (Tony's founder ask): map the internal 5-stage state to the
  // banner's 4-state model. Users must NEVER see the banner during the
  // upload / paying stages — it only appears once processing starts.
  const bannerStage: DeliveryBannerStage =
    stage === "processing" ? "processing"
    : stage === "done"     ? "done"
    : stage === "failed"   ? "failed"
    : "idle";

  return (
    <>
      {/* Sticky "DO NOT CLOSE" → "READY TO DOWNLOAD" banner. Rendered
          OUTSIDE the page container so the sticky positioning latches to
          the viewport, not the max-w-2xl column. */}
      <DeliveryBanner
        stage={bannerStage}
        orderId={orderId}
        serviceName={serviceName || meta.name}
        errorMessage={errorMsg}
      />

      <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate("/services")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" /> All services
        </button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-500" />
              {meta.name}
            </CardTitle>
            <CardDescription>{meta.description}</CardDescription>
          </CardHeader>

          {stage === "upload" && (
            <CardContent className="space-y-4">
              {/* Auto-save indicator — reassures users on flaky Kenyan mobile
                  networks that their target country / job description survive
                  a refresh or dropped signal. */}
              {draftSaved && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium -mt-1 mb-1" data-testid="text-draft-saved">
                  <CheckCircle2 className="h-3 w-3" />
                  Draft saved — you can safely close and come back later
                </div>
              )}

              {/* 2026-08 (Tony's anonymous-checkout directive): guest fields
                  shown ONLY when not logged in. No signup, no login modal —
                  just three fields so we can email the finished document.
                  Auto-fills the M-Pesa STK phone at pay-time. */}
              {isAnonymous && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-start gap-2 -mt-1">
                    <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">No account needed</p>
                      <p className="text-xs text-muted-foreground leading-snug">
                        Just tell us where to send your finished document. Pay, download, done — we'll email your CV to the address below.
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label htmlFor="guest-name" className="text-xs">Full name</Label>
                      <Input
                        id="guest-name"
                        type="text"
                        autoComplete="name"
                        placeholder="Jane Wanjiku"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        data-testid="input-guest-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="guest-email" className="text-xs">Email (for delivery)</Label>
                      <Input
                        id="guest-email"
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        placeholder="you@example.com"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        data-testid="input-guest-email"
                      />
                    </div>
                    <div>
                      <Label htmlFor="guest-phone" className="text-xs">Phone (for M-Pesa)</Label>
                      <Input
                        id="guest-phone"
                        type="tel"
                        autoComplete="tel"
                        inputMode="tel"
                        placeholder="0712345678"
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(e.target.value)}
                        data-testid="input-guest-phone"
                      />
                    </div>
                  </div>
                </div>
              )}

              {meta.needsCv && (
                <div>
                  <Label className="block mb-2">Your CV (PDF or Word)</Label>
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const f = e.dataTransfer.files?.[0];
                      if (f) handleFile(f);
                    }}
                    className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      hidden
                      accept=".pdf,.docx,.doc"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFile(f);
                      }}
                    />
                    {cvFile ? (
                      <div className="flex items-center justify-center gap-2 text-sm">
                        <FileText className="h-5 w-5 text-green-600" />
                        <span className="font-medium">{cvFile.name}</span>
                        <span className="text-muted-foreground">({Math.round(cvFile.size / 1024)} KB)</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <Upload className="h-6 w-6 text-muted-foreground" />
                        <p className="text-sm font-medium">Click to upload or drag & drop</p>
                        <p className="text-xs text-muted-foreground">PDF or .docx, up to 5 MB</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 2026-07 (Tony's founder ask): passport-style photo for CV
                  services only. Shown between the CV upload and the country
                  field so it feels like a natural next step, not tacked on
                  at the end. Skipping is one tap — the field never blocks.
                  Restricted to CV-family services (needsCv AND slug matches). */}
              {meta.needsCv && /^(cv_|ats_cv|ats_cover_bundle)/.test(slug) && (
                <div className="rounded-xl border border-teal-200/60 dark:border-teal-900/40 bg-teal-50/30 dark:bg-teal-950/10 p-4">
                  <PhotoUploadField value={photoBlob} onChange={setPhotoBlob} />
                </div>
              )}

              {meta.needsCountry && (
                <div>
                  <Label htmlFor="country">Target country</Label>
                  <Input
                    id="country"
                    placeholder="e.g. UK, Canada, Germany, UAE"
                    value={targetCountry}
                    onChange={(e) => setTargetCountry(e.target.value)}
                  />
                </div>
              )}

              {meta.needsJobDescription && (
                <div>
                  <Label htmlFor="jd">Job description / role details</Label>
                  <Textarea
                    id="jd"
                    placeholder="Paste the job posting or describe the role you're targeting…"
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    rows={4}
                  />
                </div>
              )}

              <div>
                <Label htmlFor="extra">Anything else? (optional — all of this WILL be included in your final CV)</Label>
                <Textarea
                  id="extra"
                  placeholder={`Add anything you want on the final CV, e.g.\n• Target salary: KES 250,000/month or USD 3,500/month\n• Availability: 30-day notice\n• Open to relocation to Canada, UAE, UK\n• Languages: English (fluent), Swahili (native), French (intermediate)\n• Must-mention: led the 2024 Nairobi expansion project`}
                  value={extraInput}
                  onChange={(e) => setExtraInput(e.target.value)}
                  rows={4}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Every item you list here is treated as authoritative and will appear in the final CV. If you type a target salary, it appears. If you mention certifications, they're added.
                </p>
              </div>

              <Button onClick={handleSubmit} disabled={submitting} size="lg" className="w-full">
                {submitting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating order…</>
                ) : (
                  <>Continue to payment →</>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                We'll have your CV back to you in under {Math.ceil(estSeconds / 60) || 1} minute{estSeconds > 60 ? "s" : ""}. Your file stays private — we don't share it.
              </p>
            </CardContent>
          )}

          {/* ── PAYING STAGE — inline M-Pesa STK for THIS service (no Pro plan needed) ── */}
          {stage === "paying" && orderId && (
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4">
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                  ✅ Order created. Pay <strong>KES {amount.toLocaleString()}</strong> to start generation.
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                  This is a one-off payment for {serviceName || meta.name}. No subscription, no Pro Plan required.
                  Once payment confirms, your document is generated in ~{Math.round(estSeconds / 60) || 1} minute and
                  you'll download it from this same page.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mpesa-phone">Safaricom M-Pesa number</Label>
                <Input
                  id="mpesa-phone"
                  type="tel"
                  inputMode="numeric"
                  placeholder="07XXXXXXXX"
                  value={mpesaPhone}
                  onChange={(e) => setMpesaPhone(e.target.value)}
                  disabled={payingNow || stkSent}
                  data-testid="input-mpesa-phone"
                />
                <p className="text-[11px] text-muted-foreground">
                  Must be a Safaricom line (07XX or 01XX). M-Pesa STK push only works on Safaricom.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-2">
                <span>🇰🇪 M-Pesa (Safaricom lines only)</span>
              </div>

              <Button
                onClick={openReadyGate}
                disabled={payingNow || stkSent || !mpesaPhone}
                size="lg"
                className="w-full bg-green-600 hover:bg-green-700"
                data-testid="button-pay-mpesa"
              >
                {payingNow
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending STK push…</>
                  : stkSent
                  ? <>Waiting for M-Pesa PIN entry…</>
                  : <>Pay KES {amount.toLocaleString()} via M-Pesa</>}
              </Button>

              <p className="text-[11px] text-center text-muted-foreground">
                You'll receive an STK push on your phone. Enter your M-Pesa PIN to confirm.
                You stay on this page — the document downloads here once it's ready.
              </p>

              {/* ─── PayPal (any country) ─────────────────────────────────── */}
              <div className="flex items-center gap-3 pt-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or, not in Kenya?</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="rounded-xl border border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-[11px] text-blue-800 dark:text-blue-200 flex items-center gap-2">
                <span>🌍 Not in Kenya? Use PayPal — works with any card (Visa, Mastercard, PayPal balance)</span>
              </div>

              <Button
                onClick={payWithPayPal}
                disabled={payingNow}
                size="lg"
                className="w-full bg-gradient-to-r from-[#0070ba] to-[#003087] hover:from-[#005a99] hover:to-[#00246b] text-white font-bold"
                data-testid="button-pay-paypal"
              >
                {payingNow ? "Opening PayPal…" : "🌍 Pay with PayPal (any country)"}
              </Button>

              <p className="text-[11px] text-center text-muted-foreground">
                You'll be redirected to PayPal to complete payment, then brought back here automatically.
              </p>
            </CardContent>
          )}

          {stage === "processing" && (
            <CardContent className="text-center py-12 space-y-3">
              <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto" />
              <h3 className="font-semibold text-lg">Generating your {serviceName || meta.name}…</h3>
              <p className="text-sm text-muted-foreground">
                <Clock className="inline h-3.5 w-3.5 mr-1" />
                Usually takes under {Math.ceil(estSeconds / 60) || 1} minute. Keep this tab open.
              </p>
              {/* 2026-06 RESILIENCE: tell users they can safely close the tab —
                  the server's recovery sweep keeps retrying and we'll notify
                  them. No more "infinite spinner" panic. */}
              <p className="text-xs text-muted-foreground/80 pt-3 max-w-xs mx-auto">
                Safe to close — we'll email you and post it to your{" "}
                <button
                  onClick={() => navigate("/my-documents")}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  My Documents
                </button>{" "}
                page the moment it's ready.
              </p>
            </CardContent>
          )}

          {/* 2026-08 (Tony bug fix): quality guardrail terminal state.
              AI's output failed the length-preservation check even after
              retry (usually because the input CV is long / technical /
              mixed-language). Backend flipped needs_human_review=true and
              status='awaiting_review'; a WorkAbroad Hub team member will
              personally handle it within 4 hours. No refund needed — the
              user still gets a delivered CV. */}
          {stage === "awaiting_review" && (
            <CardContent className="text-center py-10 space-y-4">
              <div className="inline-flex h-14 w-14 rounded-full bg-amber-100 dark:bg-amber-900/30 items-center justify-center mx-auto">
                <Clock className="h-7 w-7 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Being personally reviewed</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto mt-2 leading-relaxed">
                  Our AI produced a first draft but the quality wasn't up to the
                  standard we promise you. Rather than send you something less
                  than perfect, our team is personally handling your{" "}
                  {serviceName || meta.name} right now.
                </p>
              </div>
              <div className="max-w-md mx-auto p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-900 dark:text-amber-200">
                <strong>Expected delivery:</strong> within 4 hours. Same day, no
                extra charge.
              </div>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                We'll email + WhatsApp you the moment it's ready. Safe to close
                this tab — your polished{" "}
                {serviceName || meta.name} will also appear in{" "}
                <button
                  onClick={() => navigate("/my-documents")}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  My Documents
                </button>.
              </p>
            </CardContent>
          )}

          {stage === "done" && orderId && (
            <CardContent className="text-center py-8 space-y-4">
              <CheckCircle2 className="h-14 w-14 text-green-600 mx-auto" />
              <div>
                <h3 className="font-semibold text-lg">Done! Your {serviceName || meta.name} is ready.</h3>
                <p className="text-sm text-muted-foreground mt-1">Download in the format that suits you best.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
                <button
                  type="button"
                  disabled={downloadBusy !== null}
                  onClick={async () => {
                    setDownloadErrorMsg(null);
                    setDownloadBusy("pdf");
                    try {
                      const slug = (serviceName || meta.name || "document").toLowerCase().replace(/\s+/g, "-");
                      // 2026-08 (guest orders): append ?token=xxx for anon downloads
                      const tokenQ = downloadToken ? `?token=${encodeURIComponent(downloadToken)}` : "";
                      await triggerDownload(`/api/services/order/${orderId}/download/pdf${tokenQ}`, `workabroadhub-${slug}.pdf`);
                      setDownloadedOnce(true);
                    } catch (e: any) {
                      setDownloadErrorMsg(e?.message || "Download failed. Please refresh and try again.");
                    } finally {
                      setDownloadBusy(null);
                    }
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-70 disabled:cursor-wait text-white font-semibold text-sm"
                  data-testid="success-download-pdf"
                >
                  {downloadBusy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} PDF
                </button>
                <button
                  type="button"
                  disabled={downloadBusy !== null}
                  onClick={async () => {
                    setDownloadErrorMsg(null);
                    setDownloadBusy("docx");
                    try {
                      const slug = (serviceName || meta.name || "document").toLowerCase().replace(/\s+/g, "-");
                      const tokenQ = downloadToken ? `?token=${encodeURIComponent(downloadToken)}` : "";
                      await triggerDownload(`/api/services/order/${orderId}/download/docx${tokenQ}`, `workabroadhub-${slug}.docx`);
                      setDownloadedOnce(true);
                    } catch (e: any) {
                      setDownloadErrorMsg(e?.message || "Download failed. Please refresh and try again.");
                    } finally {
                      setDownloadBusy(null);
                    }
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-70 disabled:cursor-wait text-white font-semibold text-sm"
                  data-testid="success-download-docx"
                >
                  {downloadBusy === "docx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Word
                </button>
              </div>
              {downloadErrorMsg && (
                <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-md px-3 py-2 max-w-sm mx-auto">
                  {downloadErrorMsg}{" "}
                  <a href="/my-documents" className="underline font-semibold">Open My Documents</a> instead.
                </div>
              )}
              <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-2">
                <Button
                  onClick={() => setShareOpen(true)}
                  className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-semibold"
                  data-testid="button-open-share-modal"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Share your win
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate("/my-documents")}>
                  See all my documents
                </Button>
              </div>
            </CardContent>
          )}

          {/* Share modal — always mounted at bottom of tree so it opens
              cleanly from both the auto-effect and the manual button.  */}
          {orderId && (
            <ShareSuccessModal
              open={shareOpen}
              onOpenChange={setShareOpen}
              orderId={orderId}
              card={{
                firstName:     user?.firstName ?? null,
                serviceName:   serviceName || meta.name,
                targetCountry: targetCountry || null,
                atsScore:      deliveredScore,
                variant:       cardVariantFromSlug(),
              }}
            />
          )}

          {stage === "failed" && (
            <CardContent className="text-center py-10 space-y-4 max-w-md mx-auto">
              {/* 2026-07 (Tony's founder ask): warm "we've got you" error card
                  instead of a bare "Something went wrong". The server already
                  translates raw provider errors (OpenAI quota, 429, timeouts)
                  into human copy via mapErrorForUser — this UI just presents
                  it kindly with clear next steps. */}
              <div className="mx-auto h-14 w-14 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center">
                <AlertCircle className="h-7 w-7 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">
                  We're on it — your payment is safe
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {errorMsg || "We had a small hiccup processing your order. Our team has been alerted and your document will be delivered within the hour by email and WhatsApp."}
                </p>
              </div>
              <div className="rounded-lg bg-teal-50 dark:bg-teal-950/20 border border-teal-200/60 dark:border-teal-900/40 px-4 py-3 text-left space-y-1.5">
                <p className="text-xs font-semibold text-teal-900 dark:text-teal-200">What happens next</p>
                <ul className="text-xs text-teal-800 dark:text-teal-300 space-y-1 list-disc pl-4">
                  <li>You'll get an email + WhatsApp the moment your document is ready</li>
                  <li>It'll also appear in your <button onClick={() => navigate("/my-documents")} className="underline font-medium">My Documents</button> page</li>
                  <li>Prefer a refund? Reply to your payment confirmation and we'll process it right away</li>
                </ul>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 justify-center pt-1">
                <Button
                  variant="outline"
                  onClick={() => { setStage("upload"); setErrorMsg(null); }}
                  data-testid="button-try-again"
                >
                  Try again
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => navigate("/my-documents")}
                  data-testid="button-view-documents"
                >
                  Check my documents →
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
      </div>

      {/* 2026-08: pre-STK Get Ready gate */}
      <StkReadyModal
        open={readyOpen}
        onOpenChange={setReadyOpen}
        onConfirmed={payForService}
        amountKes={typeof amount === "number" ? amount : 0}
        phone={mpesaPhone}
        productName={serviceName || meta?.name}
      />
    </>
  );
}
