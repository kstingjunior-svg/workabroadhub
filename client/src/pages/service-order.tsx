import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Globe, Loader2, CheckCircle, AlertTriangle, Phone, FileText, PhoneCall, RefreshCw, XCircle, ShieldCheck, Copy, Smartphone, Clock, CreditCard } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, fetchCsrfToken } from "@/lib/queryClient";
import { formatPhone } from "@/lib/phone";
import { trackServiceOrder } from "@/lib/analytics";
import type { Service, ServiceOrder } from "@shared/schema";
import { loadServices, getCachedServices } from "@/lib/services";

interface PayPalConfig {
  enabled: boolean;
  clientId: string | null;
  mode: "sandbox" | "live" | null;
}

const intakeFormSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional().default(""),
  targetCountry: z.string().min(1, "Target country is required"),
  currentRole: z.string().min(2, "Current/desired role is required"),
  yearsExperience: z.string().min(1, "Experience level is required"),
  additionalInfo: z.string().optional(),
  currentCvUrl: z.string().optional(),
  linkedinUrl: z.string().optional(),
  paymentMethod: z.enum(["mpesa", "paypal", "card"]),
  termsAccepted: z.literal(true, { errorMap: () => ({ message: "You must accept the terms" }) }),
}).superRefine((data, ctx) => {
  if (data.paymentMethod === "mpesa" && (!data.phone || data.phone.trim().length < 9)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Phone number is required for M-Pesa payment", path: ["phone"] });
  }
});

type IntakeFormData = z.infer<typeof intakeFormSchema>;

// ── Per-service transformation story content ─────────────────────────────────
interface ServiceContent {
  badge: string;
  headline: string;
  subheadline: string;
  before: { example: string; tags: string[]; painPoints: string[] };
  after:  { example: string; tags: string[]; wins: string[] };
  benefits: { icon: string; title: string; desc: string }[];
  stats: { number: string; label: string }[];
  testimonial: { text: string; author: string; role: string; initials: string };
}

const SERVICE_CONTENT: Record<string, ServiceContent> = {
  "LinkedIn Profile Optimization": {
    badge: "🔥 Most Popular for Job Seekers",
    headline: "Get Found by International Recruiters",
    subheadline: "87% of recruiters use LinkedIn to find candidates. Make sure they find YOU — not your competition.",
    before: { example: "Nurse at Hospital", tags: ["nursing", "healthcare"], painPoints: ["⚠️ 2 profile views/week", "⚠️ 0 recruiter messages"] },
    after:  { example: "Registered Nurse | NHS-Trained | UK Work Visa Ready | Expertise in ICU & Emergency Care", tags: ["NHS", "ICU Nurse", "Tier 2 Visa", "NMC Registered", "Patient Care", "Clinical Excellence"], wins: ["✅ 45+ profile views/week", "✅ 3–5 recruiter messages weekly"] },
    benefits: [
      { icon: "🎯", title: "Recruiter-Optimized Headline", desc: "We rewrite your headline with high-search keywords that recruiters in your target country actually use." },
      { icon: "📝", title: "Complete 'About' Section Rewrite", desc: "A compelling narrative that tells your professional story and highlights your visa/work eligibility." },
      { icon: "🔑", title: "Top 15 Keywords for Your Industry", desc: "Data-driven keyword list specific to your target role and country. Add these to rank higher in searches." },
      { icon: "🌍", title: "Country-Specific Positioning", desc: "We tailor your profile for UK (NHS keywords), Canada (Express Entry terms), UAE (tax-free positioning), etc." },
    ],
    stats: [{ number: "87%", label: "Recruiters search LinkedIn first" }, { number: "11×", label: "More profile views after optimization" }, { number: "3 min", label: "AI delivery time" }],
    testimonial: { text: "I'd had my LinkedIn for 3 years with no messages. Within a week of getting it optimized by WorkAbroad Hub, I had 4 recruiters from the UK reach out.", author: "Grace M.", role: "Nurse → NHS England", initials: "GM" },
  },
  "ATS CV Optimization": {
    badge: "⚡ Most In-Demand Service",
    headline: "Beat the ATS Filter — Get Your CV Seen",
    subheadline: "75% of CVs are rejected by ATS software before a human ever sees them. Let's fix yours.",
    before: { example: "2-column CV with photo and tables", tags: ["generic", "unoptimized"], painPoints: ["⚠️ Rejected by ATS before human reads it", "⚠️ Missing role-specific keywords"] },
    after:  { example: "Clean ATS-safe CV with targeted keywords and measurable achievements", tags: ["ATS-safe", "Keyword-rich", "Quantified", "Role-targeted"], wins: ["✅ Passes ATS screening", "✅ Gets to human recruiters"] },
    benefits: [
      { icon: "🤖", title: "ATS Compatibility Scan", desc: "We identify and fix every element that causes automated rejection — tables, columns, graphics, wrong fonts." },
      { icon: "🔑", title: "Industry Keyword Injection", desc: "Role-specific and country-specific keywords inserted at optimal density so ATS scores you highly." },
      { icon: "📊", title: "Quantified Achievements", desc: "Your experience rewritten with numbers and impact metrics that recruiters and ATS systems love." },
      { icon: "🌍", title: "Country-Format Compliance", desc: "Formatted to the exact expectations of UK, Canada, UAE, Australia or US hiring managers." },
    ],
    stats: [{ number: "75%", label: "CVs rejected by ATS without human review" }, { number: "3×", label: "More interviews with ATS-optimized CV" }, { number: "3 min", label: "AI delivery time" }],
    testimonial: { text: "I was applying for months with no response. WorkAbroad Hub rewrote my CV for ATS and within 2 weeks I had 3 interview calls from the UAE.", author: "Brian K.", role: "Accountant → Dubai", initials: "BK" },
  },
  "Cover Letter Writing": {
    badge: "✍️ Instant AI Generation",
    headline: "A Cover Letter That Actually Gets Read",
    subheadline: "Most cover letters say the same thing. Yours will stand out — tailored to the role, the country, and the employer.",
    before: { example: "Dear Sir/Madam, I am writing to apply for...", tags: ["generic", "copy-pasted"], painPoints: ["⚠️ Ignored by recruiters", "⚠️ Doesn't address visa readiness"] },
    after:  { example: "Opening that names the specific role + why you're the best fit + clear visa readiness", tags: ["Personalized", "Compelling", "Visa-ready", "Country-specific"], wins: ["✅ Gets recruiters' attention", "✅ Addresses relocation proactively"] },
    benefits: [
      { icon: "🎯", title: "Role & Country Tailored", desc: "Written specifically for your target role and destination country's hiring culture." },
      { icon: "🛂", title: "Visa Readiness Addressed", desc: "Proactively frames your work authorization status in a positive, reassuring way." },
      { icon: "💼", title: "Professional Tone & Format", desc: "Calibrated tone — confident but not arrogant — that international employers respond to." },
      { icon: "⚡", title: "Ready in Under 3 Minutes", desc: "No waiting. Your cover letter is generated and delivered the moment payment confirms." },
    ],
    stats: [{ number: "72%", label: "Hiring managers skip generic letters" }, { number: "3×", label: "More callbacks with tailored letters" }, { number: "3 min", label: "AI delivery time" }],
    testimonial: { text: "The cover letter WorkAbroad Hub wrote for me was so good, the Canadian recruiter mentioned it specifically in my first interview!", author: "Esther W.", role: "Teacher → Canada", initials: "EW" },
  },
  "Interview Coaching": {
    badge: "🎤 Live Mock Interview Included",
    headline: "Walk Into Your Interview Knowing Exactly What to Say",
    subheadline: "International interviews have different expectations. We'll prepare you for every question — including the ones that trip people up.",
    before: { example: "\"Tell me about yourself\" → rambling answer", tags: ["unprepared", "nervous"], painPoints: ["⚠️ Blanks on tough questions", "⚠️ Doesn't know salary to ask for"] },
    after:  { example: "STAR-method answers, salary range research, cultural fit signals", tags: ["Confident", "Prepared", "STAR method", "Salary-ready"], wins: ["✅ Knows exactly what to say", "✅ Negotiates salary confidently"] },
    benefits: [
      { icon: "🎯", title: "30 Tailored Q&A for Your Role", desc: "Not generic questions — 30 role-specific questions with model answers in STAR format." },
      { icon: "🪤", title: "Trap Question Coaching", desc: "The 5 most common interview traps (\"greatest weakness\", illegal questions) and how to answer them." },
      { icon: "💰", title: "Salary Negotiation Scripts", desc: "Exact phrases and salary ranges for your target country so you don't undersell yourself." },
      { icon: "🌍", title: "Cultural Fit Coaching", desc: "What UK, Canadian, UAE and Australian interviewers really look for — and how to signal it." },
    ],
    stats: [{ number: "85%", label: "Success rate after our mock interviews" }, { number: "30+", label: "Questions with model answers" }, { number: "3 min", label: "AI delivery time" }],
    testimonial: { text: "I failed 4 interviews before. WorkAbroad Hub gave me a preparation pack and mock session — I passed my UK hospital interview first try.", author: "Samuel O.", role: "Nurse → NHS Scotland", initials: "SO" },
  },
  "Visa Guidance Session": {
    badge: "🛂 Step-by-Step Visa Roadmap",
    headline: "Know Exactly How to Get Your Work Visa",
    subheadline: "Stop guessing. Get a clear, country-specific guide to the visa that stands between you and your overseas job.",
    before: { example: "Searching Google for hours, contradictory advice", tags: ["confused", "risky"], painPoints: ["⚠️ Application rejected for missing documents", "⚠️ Wasted embassy fees"] },
    after:  { example: "Step-by-step checklist, required documents, embassy contacts, rejection avoidance guide", tags: ["Clear roadmap", "Checklist", "Embassy contacts", "Rejection tips"], wins: ["✅ Full documents the first time", "✅ No costly mistakes"] },
    benefits: [
      { icon: "📋", title: "Complete Documents Checklist", desc: "Every document you need, in the right format, for your specific visa category and target country." },
      { icon: "🚫", title: "Common Rejection Reasons", desc: "The top reasons visas get rejected and exactly how to avoid each one." },
      { icon: "🏛️", title: "Embassy & Consulate Contacts", desc: "Kenya-based embassy details, appointment booking links, and processing time estimates." },
      { icon: "💡", title: "Interview Tips (Where Applicable)", desc: "What consular officers look for and how to present yourself confidently." },
    ],
    stats: [{ number: "40%", label: "Visa applications rejected for avoidable reasons" }, { number: "2×", label: "Higher approval rate with proper preparation" }, { number: "3 min", label: "AI delivery time" }],
    testimonial: { text: "The visa guide saved me from making two mistakes that would have got my application rejected. Got my UAE visa approved in 3 weeks.", author: "Peter N.", role: "Engineer → Dubai, UAE", initials: "PN" },
  },
  "SOP / Statement of Purpose": {
    badge: "🎓 University & Scholarship Ready",
    headline: "Write the SOP That Gets You Accepted",
    subheadline: "Your Statement of Purpose can make or break your university application. Get one that reads like a top-10% candidate.",
    before: { example: "\"I want to study here because it is a good university\"", tags: ["generic", "weak"], painPoints: ["⚠️ Sounds like everyone else's SOP", "⚠️ No clear narrative arc"] },
    after:  { example: "Compelling 900-word narrative: why this program, why you, why now — specific and authentic", tags: ["Authentic", "Specific", "Research-focused", "Goal-oriented"], wins: ["✅ Stands out in the application pool", "✅ Addresses selection criteria directly"] },
    benefits: [
      { icon: "📖", title: "Structured Academic Narrative", desc: "A clear 5-part structure: academic interest → background → why this program → career goals → conclusion." },
      { icon: "🎓", title: "Institution-Specific Focus", desc: "Tailored to reference your target university's strengths, faculty, and research areas." },
      { icon: "🌍", title: "Country-Standard Formatting", desc: "Calibrated to US, UK, Canadian, Australian or European university expectations." },
      { icon: "✅", title: "Authenticity Guaranteed", desc: "Zero placeholder text — every sentence uses your actual background, goals and motivations." },
    ],
    stats: [{ number: "800+", label: "SOPs written for Kenyan students" }, { number: "78%", label: "Acceptance rate for our clients" }, { number: "3 min", label: "AI delivery time" }],
    testimonial: { text: "My SOP from WorkAbroad Hub was so strong my supervisor said it was one of the best he'd read. I got a full scholarship to study in Canada.", author: "Faith A.", role: "Masters Student → University of Toronto", initials: "FA" },
  },
  "Employment Contract Review": {
    badge: "⚖️ Protect Yourself Before You Sign",
    headline: "Don't Sign Until You Know What's in That Contract",
    subheadline: "Overseas employment contracts hide clauses that can trap you. Know your risks before you board that flight.",
    before: { example: "Contract with vague overtime clause and excessive bond period", tags: ["risky", "one-sided"], painPoints: ["⚠️ Hidden bond/training fees", "⚠️ Vague termination clauses"] },
    after:  { example: "Full clause analysis with risk ratings, red flags highlighted, questions to ask employer", tags: ["Risk-rated", "Red flags found", "Questions ready", "Negotiable items"], wins: ["✅ Know exactly what you're agreeing to", "✅ Negotiate from a position of knowledge"] },
    benefits: [
      { icon: "🔴", title: "Red Flag Identification", desc: "We flag every unfair clause, excessive bond, and vague term that could harm you." },
      { icon: "⚖️", title: "Clause-by-Clause Analysis", desc: "Salary, overtime, leave, termination, and confidentiality all rated 🟢🟡🔴 for fairness." },
      { icon: "❓", title: "Questions to Ask Your Employer", desc: "Specific questions you can send to your recruiter or HR to clarify risky terms." },
      { icon: "📊", title: "Overall Risk Score", desc: "Low/Medium/High rating so you know at a glance how risky this contract is." },
    ],
    stats: [{ number: "1 in 3", label: "Overseas contracts contain unfair clauses" }, { number: "KES 50K+", label: "Average savings from avoiding bad contracts" }, { number: "3 min", label: "AI delivery time" }],
    testimonial: { text: "WorkAbroad Hub found a 24-month bond clause that would have cost me KES 200,000 if I left early. They saved me from a terrible situation.", author: "David M.", role: "IT Specialist → Riyadh", initials: "DM" },
  },
  "Employer Verification Report": {
    badge: "🔍 Scam Protection",
    headline: "Verify Before You Fly — Is Your Employer Legitimate?",
    subheadline: "Hundreds of Kenyans are defrauded by fake overseas employers every year. Don't be next.",
    before: { example: "Job offer on WhatsApp, employer asks for money upfront", tags: ["unverified", "risky", "unknown"], painPoints: ["⚠️ No verifiable company registration", "⚠️ Asked to pay recruitment fees"] },
    after:  { example: "Full verification report: registry check, online presence, legitimacy score, red flags", tags: ["Registry verified", "Online presence", "Legitimacy scored", "NEA checked"], wins: ["✅ Know if employer is real before you invest anything", "✅ Armed with questions to expose scams"] },
    benefits: [
      { icon: "🏛️", title: "Government Registry Check Guide", desc: "Exact steps to verify company registration in the target country — with official website links." },
      { icon: "🌐", title: "Online Presence Analysis", desc: "How to check the company's website, LinkedIn, Glassdoor reviews and social media for red flags." },
      { icon: "🚩", title: "10 Scam Indicator Checklist", desc: "The classic signs of a fraudulent employer — including subtle ones that are easy to miss." },
      { icon: "📝", title: "Legitimacy Score & Recommendation", desc: "A clear Proceed / Caution / Avoid recommendation based on all available evidence." },
    ],
    stats: [{ number: "2,400+", label: "Kenyans defrauded by fake employers yearly" }, { number: "KES 80K", label: "Average amount lost to overseas job scams" }, { number: "3 min", label: "AI delivery time" }],
    testimonial: { text: "WorkAbroad Hub's verification report showed me the company wasn't registered anywhere. I didn't send the 'processing fee' they asked for. It was a scam.", author: "Joyce K.", role: "Nairobi → Protected", initials: "JK" },
  },
};

const DEFAULT_SERVICE_CONTENT: ServiceContent = {
  badge: "⚡ Instant AI Delivery",
  headline: "Professional Career Support, Delivered Instantly",
  subheadline: "Expert guidance for your overseas job search — generated by AI, quality-checked, and delivered in under 3 minutes.",
  before: { example: "Generic application materials, no strategy", tags: ["unoptimized", "generic"], painPoints: ["⚠️ Low response rate from employers", "⚠️ No clear roadmap"] },
  after:  { example: "Tailored, professional materials with a clear strategy", tags: ["Professional", "Targeted", "Ready to use"], wins: ["✅ Stands out to employers", "✅ Clear next steps"] },
  benefits: [
    { icon: "⚡", title: "Instant AI Delivery", desc: "Your document is generated and delivered within 3 minutes of payment confirmation." },
    { icon: "🎯", title: "Tailored to You", desc: "Using your intake information to personalize every section." },
    { icon: "🌍", title: "Country-Specific", desc: "Formatted and worded for your exact target country's expectations." },
    { icon: "🔄", title: "Revisions Available", desc: "Not satisfied? Request a revision from your dashboard at any time." },
  ],
  stats: [{ number: "3 min", label: "Average delivery time" }, { number: "5,000+", label: "Documents generated" }, { number: "4.9★", label: "Client satisfaction" }],
  testimonial: { text: "WorkAbroad Hub made the whole process so much easier. I had my documents within minutes and landed an interview the following week.", author: "Mary N.", role: "WorkAbroad Hub Client", initials: "MN" },
};

export default function ServiceOrderPage() {
  const { serviceId } = useParams<{ serviceId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<"intake" | "waiting" | "paypal" | "error" | "manual-payment" | "manual-pending" | "success">("intake");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(60);
  const [stkError, setStkError] = useState<string>("");
  const [errorType, setErrorType] = useState<"shortcode_config" | "phone_error" | "unknown">("unknown");
  const [manualPaymentInfo, setManualPaymentInfo] = useState<{
    paybillNumber: string; accountRef: string; amount: number; serviceName: string;
  } | null>(null);
  const [manualTxCode, setManualTxCode] = useState("");
  const [isConfirmingManual, setIsConfirmingManual] = useState(false);
  // Resend cooldown: seconds remaining before user may resend (synced from server)
  const [resendCooldown, setResendCooldown] = useState(0);
  // Verify state: tracks the STK Query lifecycle
  const [verifyState, setVerifyState] = useState<"idle" | "verifying" | "verified" | "cancelled" | "failed">("idle");
  const [verifyMsg, setVerifyMsg] = useState("");
  const [isResending, setIsResending] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const cooldownRef = useRef<NodeJS.Timeout | null>(null);
  const [paypalScriptReady, setPaypalScriptReady] = useState(false);
  const [paypalPending, setPaypalPending] = useState(false);
  const paypalPaymentIdRef = useRef<string | null>(null);

  const { data: services, isLoading: servicesLoading } = useQuery<Service[]>({
    queryKey:        ["/api/services"],
    queryFn:         loadServices,
    placeholderData: getCachedServices() ?? undefined,
  });

  // Match by UUID id OR by slug — so both /service-order/{uuid} and
  // /service-order/{slug} (e.g. "cv_rewrite") resolve correctly.
  const service = services?.find(s => s.id === serviceId || (s as any).slug === serviceId);

  const { data: paypalConfig } = useQuery<PayPalConfig>({
    queryKey: ["/api/paypal/config"],
  });

  const form = useForm<IntakeFormData>({
    resolver: zodResolver(intakeFormSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      targetCountry: "",
      currentRole: "",
      yearsExperience: "",
      additionalInfo: "",
      currentCvUrl: "",
      linkedinUrl: "",
      paymentMethod: "mpesa",
      termsAccepted: false as any,
    },
  });

  const selectedPaymentMethod = form.watch("paymentMethod");

  // Load PayPal SDK when config is available
  useEffect(() => {
    if (!paypalConfig?.enabled || !paypalConfig.clientId) return;
    if (document.getElementById("paypal-sdk-service")) { setPaypalScriptReady(true); return; }
    const script = document.createElement("script");
    script.id = "paypal-sdk-service";
    script.src = `https://www.paypal.com/sdk/js?client-id=${paypalConfig.clientId}&currency=USD&intent=capture`;
    script.onload = () => setPaypalScriptReady(true);
    document.body.appendChild(script);
  }, [paypalConfig]);

  // Render PayPal button when step === "paypal" and SDK is ready
  useEffect(() => {
    if (step !== "paypal" || !paypalScriptReady) return;
    const container = document.getElementById("paypal-button-container-service");
    if (!container) return;
    container.innerHTML = "";
    const win = window as any;
    if (!win.paypal) return;
    win.paypal.Buttons({
      style: { layout: "vertical", color: "blue", shape: "rect", label: "pay" },
      createOrder: async () => {
        const csrfToken = await fetchCsrfToken();
        const amount = service?.price || 0;
        const res = await fetch("/api/paypal/create-order", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
          body: JSON.stringify({
            amount,
            description: `${service?.name || "Career Service"} — WorkAbroad Hub`,
            serviceId: `service_${orderId}`,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "PayPal order creation failed");
        paypalPaymentIdRef.current = data.paymentId || null;
        return data.paypalOrderId;
      },
      onApprove: async (ppData: any) => {
        setPaypalPending(true);
        try {
          const csrfToken = await fetchCsrfToken();
          const captureRes = await fetch("/api/paypal/capture-order", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
            body: JSON.stringify({
              paypalOrderId: ppData.orderID,
              paymentId: paypalPaymentIdRef.current,
            }),
          });
          const result = await captureRes.json();
          if (!captureRes.ok) throw new Error(result.message || "Capture failed");

          // Mark service order as paid and trigger AI processing
          if (orderId) {
            await fetch(`/api/service-orders/${orderId}/paypal-complete`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
              body: JSON.stringify({ transactionId: result.transactionId }),
            });
          }
          queryClient.invalidateQueries({ queryKey: ["/api/service-orders"] });
          if (service) trackServiceOrder(service.name, service.price);
          setStep("success");
          toast({ title: "Payment Successful!", description: "Your order is confirmed and being processed." });
        } catch (err: any) {
          toast({ title: "Payment Failed", description: err.message, variant: "destructive" });
        } finally {
          setPaypalPending(false);
        }
      },
      onError: (err: any) => {
        toast({ title: "PayPal Error", description: err?.message ?? "An error occurred with PayPal.", variant: "destructive" });
      },
      onCancel: () => {
        toast({ title: "Payment Cancelled", description: "You cancelled the PayPal payment. You can try again below." });
      },
    }).render("#paypal-button-container-service").catch(() => {});
  }, [step, paypalScriptReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/service-orders", { serviceId });
      return res.json();
    },
  });

  const submitOrderMutation = useMutation({
    mutationFn: async (data: { orderId: string; intakeData: any; paymentMethod: string }) => {
      const res = await apiRequest("POST", `/api/service-orders/${data.orderId}/submit`, {
        intakeData: data.intakeData,
        paymentMethod: data.paymentMethod,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        // Attach full server response to the error so onError can inspect it
        const err: any = new Error(errData.message || "Payment initiation failed");
        err.errorType = errData.errorType;
        err.manualPayment = errData.manualPayment;
        err.detail = errData.detail;
        throw err;
      }
      return res.json();
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-orders"] });
      if (service) trackServiceOrder(service.name, service.price);

      if (variables.paymentMethod === "mpesa") {
        setStep("waiting");
        setCountdown(60);
        setVerifyState("idle");
        setVerifyMsg("");
        startCooldownTicker(30); // 30s duplicate guard
        startPolling(variables.orderId);
        startCountdown();
      } else if (variables.paymentMethod === "paypal") {
        setStep("paypal");
      } else {
        setStep("success");
      }
    },
    onError: (err: any) => {
      stopPolling();
      const type: "shortcode_config" | "phone_error" | "unknown" = err.errorType || "unknown";
      setErrorType(type);
      setStkError(err.message || "M-Pesa STK push failed. Please try again.");

      if (type === "shortcode_config" && err.manualPayment) {
        setManualPaymentInfo(err.manualPayment);
        setStep("manual-payment");
      } else {
        setStep("error");
      }
    },
  });

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
  }, []);

  const startCooldownTicker = (initialSeconds: number) => {
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    setResendCooldown(initialSeconds);
    cooldownRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const startPolling = (oid: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/service-orders/${oid}/payment-status`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          // Sync resend cooldown from server on every poll tick
          if (data.resendCooldownSeconds > 0 && resendCooldown === 0) {
            setResendCooldown(data.resendCooldownSeconds);
          }
          if (data.status === "processing" || data.status === "completed") {
            stopPolling();
            setStep("success");
          }
        }
      } catch {}
    }, 3000);
  };

  const startCountdown = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(60);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(countdownRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => () => stopPolling(), [stopPolling]);

  // Verify transaction directly with Safaricom STK Query API
  const verifyPayment = async () => {
    if (!orderId || verifyState === "verifying") return;
    setVerifyState("verifying");
    setVerifyMsg("Asking Safaricom to check your transaction…");
    try {
      const res = await apiRequest("POST", `/api/service-orders/${orderId}/verify-payment`, {});
      const data = await res.json();
      if (data.verified || data.status === "processing" || data.status === "completed") {
        setVerifyState("verified");
        setVerifyMsg("Payment confirmed by Safaricom!");
        stopPolling();
        setTimeout(() => setStep("success"), 1200);
      } else if (data.canResend) {
        setVerifyState("cancelled");
        setVerifyMsg(data.resultDesc || "Prompt was cancelled or expired. You can resend now.");
        setResendCooldown(0);
      } else {
        setVerifyState("idle");
        setVerifyMsg(data.resultDesc || "Transaction is still pending. Please wait.");
      }
    } catch (err: any) {
      setVerifyState("failed");
      setVerifyMsg("Could not reach Safaricom. Please wait for automatic confirmation.");
    }
  };

  const resendStkPush = async () => {
    if (!orderId || resendCooldown > 0 || isResending) return;
    setIsResending(true);
    setVerifyState("idle");
    setVerifyMsg("");
    try {
      const res = await apiRequest("POST", `/api/service-orders/${orderId}/submit`, {
        intakeData: { ...form.getValues() },
        paymentMethod: "mpesa",
      });
      const data = await res.json();
      if (!res.ok) {
        // 429 = duplicate guard — show the server-provided cooldown
        if (res.status === 429 && data.retryAfter) {
          startCooldownTicker(data.retryAfter);
          toast({ title: "Prompt already sent", description: data.message, variant: "destructive" });
          setIsResending(false);
          return;
        }
        // Shortcode config error → offer manual payment
        if (data.errorType === "shortcode_config" && data.manualPayment) {
          setManualPaymentInfo(data.manualPayment);
          setStep("manual-payment");
          setIsResending(false);
          return;
        }
        setErrorType(data.errorType || "unknown");
        setStkError(data.message || "Failed to resend");
        setStep("error");
        setIsResending(false);
        return;
      }
      setStep("waiting");
      setCountdown(60);
      startCooldownTicker(30);
      startPolling(orderId);
      startCountdown();
      toast({ title: "Prompt Resent", description: "Check your phone for the M-Pesa PIN request." });
    } catch (err: any) {
      setStkError(err.message || "Failed to resend. Please try again.");
      setStep("error");
    } finally {
      setIsResending(false);
    }
  };

  const onSubmit = async (data: IntakeFormData) => {
    // Validate LinkedIn URL is provided for LinkedIn Profile Optimization
    if (service?.name === "LinkedIn Profile Optimization" && !data.linkedinUrl?.trim()) {
      form.setError("linkedinUrl", {
        type: "manual",
        message: "Please enter your LinkedIn profile URL so we can optimize it for you.",
      });
      return;
    }

    try {
      const order: ServiceOrder = await createOrderMutation.mutateAsync();
      setOrderId(order.id);

      const intakeData = {
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        targetCountry: data.targetCountry,
        currentRole: data.currentRole,
        yearsExperience: data.yearsExperience,
        additionalInfo: data.additionalInfo,
        currentCvUrl: data.currentCvUrl,
        linkedinUrl: data.linkedinUrl,
      };

      await submitOrderMutation.mutateAsync({
        orderId: order.id,
        intakeData,
        paymentMethod: data.paymentMethod,
      });
    } catch (error) {
      console.error("Order error:", error);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 0,
    }).format(price);
  };

  const isSubmitting = createOrderMutation.isPending || submitOrderMutation.isPending;

  if (servicesLoading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!service) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Service Not Found</h2>
            <p className="text-muted-foreground mb-4">The service you're looking for doesn't exist.</p>
            <Link href="/services">
              <Button>Browse Services</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "waiting") {
    const circumference = 2 * Math.PI * 28;
    const progress = circumference - (countdown / 60) * circumference;
    const canVerify = countdown === 0 && verifyState !== "verifying" && verifyState !== "verified";
    const canResend = resendCooldown === 0 && !isResending;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            {/* Circular progress countdown */}
            <div className="relative h-20 w-20 mx-auto mb-6">
              <svg className="absolute inset-0 -rotate-90" width="80" height="80">
                <circle cx="40" cy="40" r="28" fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
                <circle
                  cx="40" cy="40" r="28" fill="none"
                  stroke={verifyState === "verified" ? "#16a34a" : "hsl(var(--primary))"}
                  strokeWidth="4"
                  strokeDasharray={circumference}
                  strokeDashoffset={progress}
                  strokeLinecap="round"
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                {verifyState === "verifying" ? (
                  <Loader2 className="h-7 w-7 text-primary animate-spin" />
                ) : verifyState === "verified" ? (
                  <CheckCircle className="h-7 w-7 text-green-600" />
                ) : (
                  <PhoneCall className="h-7 w-7 text-primary animate-pulse" />
                )}
              </div>
            </div>

            <h2 className="text-2xl font-bold mb-2">Check Your Phone</h2>
            <p className="text-muted-foreground mb-2">
              An M-Pesa prompt has been sent to your phone.
            </p>
            <p className="text-sm font-medium mb-4">
              Enter your <span className="text-primary font-bold">M-Pesa PIN</span> to pay{" "}
              <span className="font-bold">
                {new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 0 }).format(service.price)}
              </span>{" "}
              for {service.name}.
            </p>

            {/* Status / verify feedback banner */}
            {verifyState !== "idle" && verifyMsg && (
              <div className={`rounded-lg p-3 mb-4 text-sm font-medium ${
                verifyState === "verified" ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" :
                verifyState === "verifying" ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400" :
                verifyState === "cancelled" ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400" :
                "bg-muted text-muted-foreground"
              }`} data-testid="text-verify-status">
                {verifyState === "verifying" && <Loader2 className="h-3 w-3 inline mr-1 animate-spin" />}
                {verifyState === "verified" && <CheckCircle className="h-3 w-3 inline mr-1" />}
                {verifyMsg}
              </div>
            )}

            {/* Countdown / waiting status */}
            <div className="bg-muted rounded-lg p-4 mb-5 text-center">
              {countdown > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Waiting for payment confirmation…{" "}
                  <span className="font-mono font-bold text-foreground">{countdown}s</span>
                </p>
              ) : (
                <p className="text-sm text-amber-600 font-medium">
                  Prompt expired — verify with Safaricom or resend below.
                </p>
              )}
            </div>

            <div className="space-y-3">
              {/* Verify with Safaricom — appears after countdown expires */}
              {countdown === 0 && (
                <Button
                  className="w-full"
                  data-testid="button-verify-payment"
                  onClick={verifyPayment}
                  disabled={verifyState === "verifying" || verifyState === "verified"}
                >
                  {verifyState === "verifying" ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Checking with Safaricom…</>
                  ) : verifyState === "verified" ? (
                    <><CheckCircle className="h-4 w-4 mr-2" /> Payment Confirmed!</>
                  ) : (
                    <><ShieldCheck className="h-4 w-4 mr-2" /> Verify with Safaricom</>
                  )}
                </Button>
              )}

              {/* Resend button — disabled during cooldown */}
              <Button
                variant="outline"
                className="w-full"
                data-testid="button-resend-prompt"
                onClick={resendStkPush}
                disabled={!canResend}
              >
                {isResending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</>
                ) : resendCooldown > 0 ? (
                  <><RefreshCw className="h-4 w-4 mr-2" /> Resend in {resendCooldown}s</>
                ) : (
                  <><RefreshCw className="h-4 w-4 mr-2" /> Resend M-Pesa Prompt</>
                )}
              </Button>

              <Button
                variant="ghost"
                className="w-full text-sm text-muted-foreground"
                onClick={() => { stopPolling(); setStep("intake"); }}
                data-testid="button-back-from-waiting"
              >
                ← Back to form
              </Button>
              <p className="text-xs text-muted-foreground">
                Payment confirms automatically when you enter your PIN. Use "Verify" if the prompt expired.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "error") {
    const isPhoneErr = errorType === "phone_error";
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-6">
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold mb-2">
              {isPhoneErr ? "Phone Number Issue" : "M-Pesa Prompt Failed"}
            </h2>
            <p className="text-sm text-muted-foreground mb-4">{stkError}</p>
            <div className="bg-muted rounded-lg p-4 mb-6 text-left space-y-1">
              <p className="text-xs font-medium">What to do:</p>
              {isPhoneErr ? (
                <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                  <li>Use the phone number registered for your M-Pesa account</li>
                  <li>Format: 0712 345 678 or 254712345678</li>
                  <li>Go back and correct your phone number</li>
                </ul>
              ) : (
                <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                  <li>Make sure your M-Pesa account is active</li>
                  <li>Check your phone number is correct</li>
                  <li>Try again in a few minutes</li>
                </ul>
              )}
            </div>
            <div className="space-y-3">
              <Button className="w-full" data-testid="button-retry-stk" onClick={resendStkPush}>
                <RefreshCw className="h-4 w-4 mr-2" /> Try Again
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setStep("intake")} data-testid="button-back-to-form-from-error">
                ← Back to form
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "manual-payment" && manualPaymentInfo) {
    const { paybillNumber, accountRef, amount, serviceName } = manualPaymentInfo;
    const fmt = (n: number) => new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 0 }).format(n);
    const copyToClipboard = (text: string, label: string) => {
      navigator.clipboard.writeText(text).then(() =>
        toast({ title: `${label} copied`, description: text })
      );
    };

    const handleConfirmManual = async () => {
      if (!orderId || isConfirmingManual) return;
      setIsConfirmingManual(true);
      try {
        const res = await apiRequest("POST", `/api/service-orders/${orderId}/confirm-manual-payment`, {
          transactionCode: manualTxCode,
        });
        if (res.ok) {
          setStep("manual-pending");
        } else {
          const err = await res.json().catch(() => ({}));
          toast({ title: "Error", description: err.message || "Could not confirm payment", variant: "destructive" });
        }
      } catch {
        toast({ title: "Error", description: "Network error. Please try again.", variant: "destructive" });
      } finally {
        setIsConfirmingManual(false);
      }
    };

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-12 w-12 rounded-xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center flex-shrink-0">
                <Smartphone className="h-6 w-6 text-yellow-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold leading-tight">Pay via M-Pesa PayBill</h2>
                <p className="text-xs text-muted-foreground">STK Push unavailable — pay directly from your phone</p>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-5 space-y-3">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">M-Pesa Payment Details</p>
              {[
                { label: "PayBill Number", value: paybillNumber, copy: true },
                { label: "Account Number", value: accountRef, copy: true },
                { label: "Amount", value: fmt(Number(amount)), copy: false },
              ].map(({ label, value, copy }) => (
                <div key={label} className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="font-bold text-lg tracking-wide">{value}</p>
                  </div>
                  {copy && (
                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(value, label)} data-testid={`button-copy-${label.toLowerCase().replace(/ /g, "-")}`}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-muted rounded-lg p-3 mb-5">
              <p className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
                <Smartphone className="h-3.5 w-3.5" /> Steps to pay on your phone:
              </p>
              <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal list-inside">
                <li>Open M-Pesa on your Safaricom line</li>
                <li>Go to <strong>Lipa na M-Pesa → Paybill</strong></li>
                <li>Enter Business No: <strong>{paybillNumber}</strong></li>
                <li>Account No: <strong>{accountRef}</strong></li>
                <li>Amount: <strong>{fmt(Number(amount))}</strong></li>
                <li>Enter your M-Pesa PIN and confirm</li>
              </ol>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  M-Pesa Transaction Code (optional but helps us verify faster)
                </label>
                <Input
                  placeholder="e.g. QJK3XYZ789"
                  value={manualTxCode}
                  onChange={(e) => setManualTxCode(e.target.value.toUpperCase())}
                  className="font-mono uppercase"
                  data-testid="input-manual-tx-code"
                />
              </div>
              <Button
                className="w-full"
                onClick={handleConfirmManual}
                disabled={isConfirmingManual}
                data-testid="button-confirm-manual-payment"
              >
                {isConfirmingManual ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Confirming…</> : <><CheckCircle className="h-4 w-4 mr-2" /> I've Paid — Confirm Order</>}
              </Button>
              <Button variant="ghost" className="w-full text-xs" onClick={() => setStep("intake")} data-testid="button-back-manual">
                ← Back to form
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "manual-pending") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="h-16 w-16 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center mx-auto mb-6">
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
            <h2 className="text-xl font-bold mb-2">Payment Submitted!</h2>
            <p className="text-muted-foreground mb-4">
              We've received your payment notification. Our team will verify your M-Pesa payment and activate your order within <strong>30 minutes</strong>.
            </p>
            <div className="bg-muted rounded-lg p-4 mb-6 text-left space-y-2">
              <p className="text-xs font-medium flex items-center gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-green-600" /> What happens next:</p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>We verify your M-Pesa transaction</li>
                <li>Your order is activated automatically</li>
                <li>You'll receive a WhatsApp confirmation</li>
                <li>Work begins within the promised delivery window</li>
              </ul>
            </div>
            <div className="space-y-3">
              <Link href="/my-orders">
                <Button className="w-full" data-testid="button-view-orders-manual">
                  Track My Order
                </Button>
              </Link>
              <Link href="/">
                <Button variant="outline" className="w-full" data-testid="button-home-manual">
                  Back to Dashboard
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }


  if (step === "paypal") {
    const usdAmount = service ? Math.max(1, Math.round(service.price / 130 * 100) / 100).toFixed(2) : "0.00";
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8">
            <div className="text-center mb-6">
              <div className="h-14 w-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-4">
                <CreditCard className="h-7 w-7 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold mb-1">Complete Payment via PayPal</h2>
              <p className="text-muted-foreground text-sm">
                Pay <strong>${usdAmount} USD</strong> for <strong>{service?.name}</strong>
              </p>
              <p className="text-xs text-muted-foreground mt-1">Includes Cards, PayPal balance &amp; bank transfer</p>
            </div>

            {paypalPending ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Processing your payment…</p>
              </div>
            ) : paypalScriptReady ? (
              <div id="paypal-button-container-service" className="min-h-[100px]" />
            ) : (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading PayPal…</p>
              </div>
            )}

            <div className="mt-4 pt-4 border-t">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={() => setStep("intake")}
                disabled={paypalPending}
                data-testid="button-back-to-form"
              >
                <ArrowLeft className="h-4 w-4 mr-1" /> Go back &amp; choose a different payment method
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Order Confirmed!</h2>
            <p className="text-muted-foreground mb-6">
              Your {service.name} order has been received and payment confirmed. Our team will start working on it shortly.
            </p>
            <div className="bg-muted rounded-lg p-4 mb-6 text-left">
              <p className="text-sm text-muted-foreground mb-1">Order ID</p>
              <p className="font-mono text-sm">{orderId}</p>
            </div>
            <div className="space-y-3">
              <Link href="/my-orders">
                <Button className="w-full" data-testid="button-view-orders">
                  View My Orders
                </Button>
              </Link>
              <Link href="/">
                <Button variant="outline" className="w-full" data-testid="button-back-dashboard">
                  Back to Dashboard
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const content = SERVICE_CONTENT[service.name] ?? DEFAULT_SERVICE_CONTENT;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-4">
            <Link href="/services">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Globe className="h-6 w-6 text-primary" />
              <span className="font-semibold text-lg">{service.name}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-36 md:pb-8">
        <div className="grid lg:grid-cols-[1.25fr_0.75fr] gap-8 items-start">

          {/* ── LEFT: Transformation Story ──────────────────────────────── */}
          <div className="space-y-6">
            {/* Badge + Headline */}
            <div className="rounded-2xl bg-card border p-7 shadow-sm">
              <span className="inline-block bg-foreground text-background text-xs font-semibold uppercase tracking-widest px-4 py-1 rounded-full mb-4">
                {content.badge}
              </span>
              <h1 className="text-3xl font-serif font-semibold leading-tight mb-2">{content.headline}</h1>
              <p className="text-muted-foreground text-base">{content.subheadline}</p>

              {/* Before / After */}
              <div className="grid sm:grid-cols-2 gap-4 mt-6">
                <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400 mb-3">❌ Before</p>
                  <p className="font-semibold text-red-700 dark:text-red-300 line-through text-sm mb-2">{content.before.example}</p>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {content.before.tags.map(t => (
                      <span key={t} className="text-xs bg-white dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-full px-2 py-0.5">{t}</span>
                    ))}
                  </div>
                  {content.before.painPoints.map(p => (
                    <p key={p} className="text-xs text-red-600 dark:text-red-400">{p}</p>
                  ))}
                </div>
                <div className="rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-green-700 dark:text-green-400 mb-3">✅ After (AI-Optimized)</p>
                  <p className="font-semibold text-green-800 dark:text-green-300 text-sm mb-2">{content.after.example}</p>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {content.after.tags.map(t => (
                      <span key={t} className="text-xs bg-white dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-full px-2 py-0.5">{t}</span>
                    ))}
                  </div>
                  {content.after.wins.map(w => (
                    <p key={w} className="text-xs text-green-700 dark:text-green-400">{w}</p>
                  ))}
                </div>
              </div>
            </div>

            {/* Benefits */}
            <div className="rounded-2xl bg-card border p-7 shadow-sm">
              <h3 className="font-serif text-xl font-semibold mb-4">What You'll Receive Instantly</h3>
              <div className="space-y-0 divide-y">
                {content.benefits.map(b => (
                  <div key={b.title} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                    <span className="text-2xl shrink-0 w-9 text-center">{b.icon}</span>
                    <div>
                      <p className="font-semibold text-sm mb-0.5">{b.title}</p>
                      <p className="text-sm text-muted-foreground">{b.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="rounded-2xl bg-foreground text-background p-6 shadow-sm">
              <div className="grid grid-cols-3 gap-4 text-center">
                {content.stats.map(s => (
                  <div key={s.label}>
                    <div className="text-3xl font-serif font-bold mb-1">{s.number}</div>
                    <div className="text-xs opacity-75 leading-tight">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Testimonial */}
            <div className="rounded-2xl bg-card border-l-4 border-primary border p-6 shadow-sm">
              <p className="font-serif text-lg italic text-foreground/90 mb-4">"{content.testimonial.text}"</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center font-semibold text-sm shrink-0">
                  {content.testimonial.initials}
                </div>
                <div>
                  <p className="font-semibold text-sm">{content.testimonial.author}</p>
                  <p className="text-xs text-muted-foreground">{content.testimonial.role}</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT: Checkout / Form ───────────────────────────────────── */}
          <div className="lg:sticky lg:top-20">
            {/* Price + instant delivery badge */}
            <div className="rounded-2xl bg-card border p-6 shadow-sm mb-6">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-bold text-lg">{service.name}</p>
                  <p className="text-sm text-muted-foreground">{service.description}</p>
                </div>
              </div>
              <div className="flex items-baseline gap-2 my-3">
                <span className="text-3xl font-bold">{formatPrice(service.price)}</span>
              </div>
              <div className="inline-flex items-center gap-2 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 rounded-full px-4 py-1.5 text-sm font-medium">
                <span>⚡</span>
                <span>Instant AI Delivery — under 3 minutes</span>
              </div>
            </div>

            {/* Original service card content moved here: just the form area */}
            <div className="space-y-6">
              <Card className="border-destructive/20 bg-destructive/5">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium mb-1">Important Note</p>
                      <ul className="text-muted-foreground space-y-0.5">
                        <li>Career assistance service — no job guarantee.</li>
                        <li>We do NOT guarantee visa approval.</li>
                        <li>⚡ Your document is ready within 3 minutes of payment.</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

            </div>

            <Form {...form}>
              <form id="service-order-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Intake Form
                </CardTitle>
                <CardDescription>
                  Tell us about yourself so we can deliver the best results.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} data-testid="input-fullname" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address *</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="john@example.com" {...field} data-testid="input-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Phone Number{" "}
                          {selectedPaymentMethod === "mpesa" ? (
                            <span className="text-destructive">*</span>
                          ) : (
                            <span className="text-muted-foreground font-normal">(optional)</span>
                          )}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={selectedPaymentMethod === "mpesa" ? "07XXXXXXXX" : "+1 XXX XXX XXXX or 07XXXXXXXX"}
                            {...field}
                            onChange={(e) => field.onChange(formatPhone(e.target.value))}
                            data-testid="input-phone"
                          />
                        </FormControl>
                        {selectedPaymentMethod === "mpesa" && (
                          <p className="text-xs text-muted-foreground">Kenyan Safaricom number required for M-Pesa STK push</p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="targetCountry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Target Country *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., USA, Canada, UK" {...field} data-testid="input-country" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="currentRole"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Current/Target Role *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Software Engineer" {...field} data-testid="input-role" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="yearsExperience"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Years of Experience *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 5 years" {...field} data-testid="input-experience" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="linkedinUrl"
                  render={({ field }) => {
                    const isLinkedInService = service?.name === "LinkedIn Profile Optimization";
                    return (
                      <FormItem>
                        <FormLabel>
                          LinkedIn Profile URL
                          {isLinkedInService ? (
                            <span className="text-destructive ml-1">*</span>
                          ) : (
                            <span className="text-muted-foreground font-normal ml-1">(optional)</span>
                          )}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://linkedin.com/in/yourprofile"
                            {...field}
                            data-testid="input-linkedin"
                            className={isLinkedInService && !field.value ? "border-amber-400 focus:border-amber-500" : ""}
                          />
                        </FormControl>
                        {isLinkedInService && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Your LinkedIn URL is required so we can tailor the optimization to your existing profile. Go to your LinkedIn profile, copy the URL from the browser address bar, and paste it here.
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                <FormField
                  control={form.control}
                  name="additionalInfo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Additional Information</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Any specific requirements, skills to highlight, or additional context..."
                          className="min-h-[100px]"
                          {...field}
                          data-testid="input-additional"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Payment Method
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="space-y-3"
                        >
                          <Label
                            htmlFor="mpesa"
                            className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-all ${
                              field.value === "mpesa" ? "border-primary bg-primary/5" : "hover-elevate"
                            }`}
                          >
                            <RadioGroupItem value="mpesa" id="mpesa" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">M-Pesa 🇰🇪</span>
                                <Badge variant="outline" className="text-xs">Kenya</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">Pay via Safaricom STK Push — Kenyan numbers only</p>
                            </div>
                          </Label>
                          {paypalConfig?.enabled && (
                            <Label
                              htmlFor="paypal"
                              className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-all ${
                                field.value === "paypal" ? "border-primary bg-primary/5" : "hover-elevate"
                              }`}
                            >
                              <RadioGroupItem value="paypal" id="paypal" />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">PayPal 🌍</span>
                                  <Badge variant="outline" className="text-xs">International</Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  Cards, PayPal balance &amp; bank transfer — ${service ? Math.max(1, Math.round(service.price / 130 * 100) / 100).toFixed(2) : "—"} USD
                                </p>
                              </div>
                            </Label>
                          )}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <FormField
                  control={form.control}
                  name="termsAccepted"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-terms"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="text-sm">
                          I understand this is a career assistance service and does not guarantee job placement, visa approval, or employment. I accept the terms of service.
                        </FormLabel>
                        <FormMessage />
                      </div>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

              </form>
            </Form>
          </div>{/* end right column */}
        </div>{/* end two-column grid */}
      </main>

      {/* Sticky pay bar — sits above the bottom navigation on mobile */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t px-4 py-3 md:py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="text-lg">
            <span className="text-muted-foreground text-sm">Total: </span>
            <span className="font-bold text-xl">{formatPrice(service.price)}</span>
          </div>
          <Button
            type="submit"
            form="service-order-form"
            size="lg"
            disabled={isSubmitting}
            className="min-w-[160px]"
            data-testid="button-submit-order"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : selectedPaymentMethod === "paypal" ? (
              `Continue to PayPal`
            ) : (
              `Pay ${formatPrice(service.price)}`
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
