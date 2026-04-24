import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, Clock, Shield, AlertTriangle } from "lucide-react";
import ConsultationBookingModal from "@/components/consultation-booking-modal";
import nanjilaAvatarUrl from "@assets/generated_images/nanjila_avatar.png";

const formSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  email:    z.string().email("Enter a valid email address"),
  phone:    z.string().optional(),
  topic:    z.string().min(1, "Please select a topic"),
  message:  z.string().min(10, "Message must be at least 10 characters"),
});
type FormValues = z.infer<typeof formSchema>;

const topics = [
  { value: "verification",  label: "NEA Agency Verification" },
  { value: "payment",       label: "Payment / M-Pesa Issue" },
  { value: "service",       label: "CV / Document Services" },
  { value: "technical",     label: "Technical Support" },
  { value: "complaint",     label: "Report a Scam Agency" },
  { value: "consultation",  label: "Book a Consultation" },
  { value: "other",         label: "Other" },
];

const quickHelp = [
  { emoji: "❓", label: "FAQs",             href: "/faq" },
  { emoji: "🔐", label: "Verify an Agency", href: "/nea-agencies" },
  { emoji: "🚨", label: "Report a Scam",    href: "/report-fraud" },
  { emoji: "💰", label: "Pricing & Plans",  href: "/pricing" },
];

const hours = [
  { day: "Monday – Friday",  time: "8:00 AM – 6:00 PM EAT" },
  { day: "Saturday – Sunday", time: "Closed" },
  { day: "Public Holidays",  time: "Closed" },
];

export default function ContactPage() {
  const { toast } = useToast();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { fullName: "", email: "", phone: "", topic: "", message: "" },
  });

  const mutation = useMutation({
    mutationFn: (data: FormValues) => apiRequest("POST", "/api/contact", data),
    onSuccess: () => {
      form.reset();
      setSubmitted(true);
    },
    onError: () => {
      toast({
        title: "Failed to send message",
        description: "Please try WhatsApp instead: +254 742 619777",
        variant: "destructive",
      });
    },
  });

  return (
    <div
      className="min-h-screen"
      style={{ background: "linear-gradient(135deg, #F4F2EE 0%, #FFFFFF 100%)", color: "#1E2A36", fontFamily: "'Inter', sans-serif" }}
    >
      <div className="max-w-5xl mx-auto px-4 py-10 sm:py-14">

        {/* ── Header ── */}
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-medium mb-2" style={{ fontFamily: "'Crimson Pro', Georgia, serif", color: "#1A2530" }}>
            We're Here to Help
          </h1>
          <p className="text-lg mb-5" style={{ color: "#5A6A7A" }}>
            Reach us via WhatsApp, email, or book a scheduled consultation.
          </p>
          <span
            className="inline-block rounded-full px-5 py-2 text-sm font-medium"
            style={{ background: "#ECFDF3", border: "1px solid #ABEFC6", color: "#067647" }}
          >
            ⚡ We respond to all messages within 24 hours
          </span>
        </div>

        {/* ── Contact Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
          {/* WhatsApp */}
          <a
            href="https://wa.me/254742619777?text=Hi%20WorkAbroad%20Hub%2C%20I%20need%20help%20with..."
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-contact-whatsapp"
            className="block rounded-3xl p-8 text-center transition-all duration-300 hover:-translate-y-1 no-underline"
            style={{ background: "#fff", border: "1px solid #E2DDD5", color: "inherit", textDecoration: "none" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#8B7A66"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 24px rgba(0,0,0,0.06)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#E2DDD5"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
          >
            <div className="w-18 h-18 rounded-full flex items-center justify-center mx-auto mb-5 text-4xl" style={{ width: 72, height: 72, background: "#F9F8F6" }}>💬</div>
            <h3 className="text-2xl font-medium mb-2" style={{ fontFamily: "'Crimson Pro', Georgia, serif", color: "#1A2530" }}>WhatsApp</h3>
            <p className="font-medium mb-1" style={{ color: "#1A2530" }}>+254 742 619777</p>
            <p className="text-sm mb-5" style={{ color: "#7A8A9A" }}>Fastest response — typically within 2 hours</p>
            <span className="inline-block rounded-full px-6 py-2.5 text-white font-medium text-sm" style={{ background: "#25D366" }}>
              Chat on WhatsApp →
            </span>
          </a>

          {/* Email */}
          <a
            href="mailto:support@workabroadhub.tech?subject=Support%20Request%20-%20WorkAbroad%20Hub"
            data-testid="link-contact-email"
            className="block rounded-3xl p-8 text-center transition-all duration-300 hover:-translate-y-1 no-underline"
            style={{ background: "#fff", border: "1px solid #E2DDD5", color: "inherit", textDecoration: "none" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#8B7A66"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 24px rgba(0,0,0,0.06)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#E2DDD5"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
          >
            <div className="rounded-full flex items-center justify-center mx-auto mb-5 text-4xl" style={{ width: 72, height: 72, background: "#F9F8F6" }}>✉️</div>
            <h3 className="text-2xl font-medium mb-2" style={{ fontFamily: "'Crimson Pro', Georgia, serif", color: "#1A2530" }}>Email</h3>
            <p className="font-medium mb-1 break-all" style={{ color: "#1A2530", fontSize: "0.97rem" }}>support@workabroadhub.tech</p>
            <p className="text-sm mb-5" style={{ color: "#7A8A9A" }}>For detailed queries, documents, or complaints</p>
            <span className="inline-block rounded-full px-6 py-2.5 text-white font-medium text-sm" style={{ background: "#1A2530" }}>
              Send an Email →
            </span>
          </a>

          {/* Location */}
          <div
            className="rounded-3xl p-8 text-center transition-all duration-300 hover:-translate-y-1 cursor-pointer"
            style={{ background: "#fff", border: "1px solid #E2DDD5" }}
            onClick={() => window.open("https://maps.google.com/?q=Nairobi,Kenya", "_blank")}
            data-testid="card-contact-location"
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#8B7A66"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 24px rgba(0,0,0,0.06)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#E2DDD5"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
          >
            <div className="rounded-full flex items-center justify-center mx-auto mb-5 text-4xl" style={{ width: 72, height: 72, background: "#F9F8F6" }}>📍</div>
            <h3 className="text-2xl font-medium mb-2" style={{ fontFamily: "'Crimson Pro', Georgia, serif", color: "#1A2530" }}>Location</h3>
            <p className="font-medium mb-1" style={{ color: "#1A2530" }}>Nairobi, Kenya</p>
            <p className="text-sm mb-5" style={{ color: "#7A8A9A" }}>Consultations are conducted online via WhatsApp</p>
            <span className="inline-block rounded-full px-6 py-2.5 font-medium text-sm" style={{ border: "1.5px solid #D1CEC8", color: "#3A4A5A", background: "transparent" }}>
              View on Map →
            </span>
          </div>
        </div>

        {/* ── Contact Form ── */}
        <div className="rounded-3xl p-6 sm:p-10 mb-10" style={{ background: "#fff", border: "1px solid #E2DDD5" }}>
          <div className="mb-7">
            <h2 className="text-3xl font-medium" style={{ fontFamily: "'Crimson Pro', Georgia, serif", color: "#1A2530" }}>Send Us a Message</h2>
            <p className="mt-1" style={{ color: "#5A6A7A" }}>We'll get back to you within 24 hours</p>
          </div>

          {submitted ? (
            <div className="flex flex-col items-center py-10 gap-4 text-center">
              <CheckCircle className="h-12 w-12" style={{ color: "#25D366" }} />
              <h3 className="text-xl font-semibold" style={{ color: "#1A2530" }}>Message sent successfully!</h3>
              <p style={{ color: "#5A6A7A" }}>Thank you — we'll respond within 24 hours.</p>
              <Button
                variant="outline"
                onClick={() => setSubmitted(false)}
                data-testid="button-contact-send-another"
              >
                Send another message
              </Button>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(d => mutation.mutate(d))}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                  <FormField control={form.control} name="fullName" render={({ field }) => (
                    <FormItem>
                      <FormLabel style={{ color: "#3A4A5A", fontWeight: 500, fontSize: "0.9rem" }}>Full Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} data-testid="input-contact-name"
                          className="rounded-2xl text-base"
                          style={{ border: "1.5px solid #E2DDD5", padding: "14px 16px", height: "auto" }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel style={{ color: "#3A4A5A", fontWeight: 500, fontSize: "0.9rem" }}>Email Address *</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="john@example.com" {...field} data-testid="input-contact-email"
                          className="rounded-2xl text-base"
                          style={{ border: "1.5px solid #E2DDD5", padding: "14px 16px", height: "auto" }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem>
                      <FormLabel style={{ color: "#3A4A5A", fontWeight: 500, fontSize: "0.9rem" }}>Phone Number <span style={{ color: "#7A8A9A" }}>(Optional)</span></FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="07XXXXXXXXX" {...field} data-testid="input-contact-phone"
                          className="rounded-2xl text-base"
                          style={{ border: "1.5px solid #E2DDD5", padding: "14px 16px", height: "auto" }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="topic" render={({ field }) => (
                    <FormItem>
                      <FormLabel style={{ color: "#3A4A5A", fontWeight: 500, fontSize: "0.9rem" }}>Topic *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-contact-topic"
                            className="rounded-2xl text-base"
                            style={{ border: "1.5px solid #E2DDD5", padding: "14px 16px", height: "auto" }}
                          >
                            <SelectValue placeholder="Select a topic" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {topics.map(t => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="message" render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel style={{ color: "#3A4A5A", fontWeight: 500, fontSize: "0.9rem" }}>Message *</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Please describe your question or issue in detail..."
                          {...field}
                          data-testid="textarea-contact-message"
                          className="rounded-2xl text-base resize-y"
                          style={{ border: "1.5px solid #E2DDD5", padding: "14px 16px", minHeight: 120 }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <Button
                  type="submit"
                  disabled={mutation.isPending}
                  data-testid="button-contact-submit"
                  className="w-full rounded-2xl text-base font-semibold py-4"
                  style={{ background: "#1A2530", color: "#fff", height: "auto", border: "none" }}
                >
                  {mutation.isPending ? "Sending..." : "Send Message →"}
                </Button>
              </form>
            </Form>
          )}
        </div>

        {/* ── Quick Help ── */}
        <div className="rounded-3xl p-6 sm:p-8 mb-10" style={{ background: "#F9F8F6" }}>
          <h3 className="text-2xl font-medium mb-5" style={{ fontFamily: "'Crimson Pro', Georgia, serif", color: "#1A2530" }}>
            🔍 Quick Help Topics
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {quickHelp.map(h => (
              <Link key={h.href} href={h.href}>
                <a
                  data-testid={`link-quickhelp-${h.label.toLowerCase().replace(/\s+/g, "-")}`}
                  className="block rounded-2xl p-4 text-center transition-all duration-200 no-underline"
                  style={{ background: "#fff", border: "1px solid #E2DDD5", color: "#1A2530", textDecoration: "none" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#D4A017"; (e.currentTarget as HTMLElement).style.background = "#FFFDF5"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#E2DDD5"; (e.currentTarget as HTMLElement).style.background = "#fff"; }}
                >
                  <span className="block text-3xl mb-2">{h.emoji}</span>
                  <span className="text-sm font-medium">{h.label}</span>
                </a>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Business Hours + Privacy ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-10">
          <div className="rounded-3xl p-6 sm:p-8" style={{ background: "#fff", border: "1px solid #E2DDD5" }}>
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2" style={{ color: "#1A2530" }}>
              <Clock className="h-5 w-5" style={{ color: "#0e7490" }} /> Business Hours
            </h3>
            <div className="space-y-3">
              {hours.map(h => (
                <div key={h.day} className="flex justify-between text-sm border-b pb-2" style={{ borderColor: "#F0EDE8" }}>
                  <span style={{ color: "#5A6A7A", fontWeight: 500 }}>{h.day}</span>
                  <span style={{ color: "#1A2530", fontWeight: 600 }}>{h.time}</span>
                </div>
              ))}
            </div>
            <p className="text-xs mt-3" style={{ color: "#9AA8B4" }}>
              All times are East Africa Time (EAT, UTC+3). Messages outside hours are answered within 24 hours.
            </p>
          </div>

          <div className="rounded-3xl p-6 sm:p-8" style={{ background: "#fff", border: "1px solid #E2DDD5" }}>
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2" style={{ color: "#1A2530" }}>
              <Shield className="h-5 w-5 text-blue-600" /> Data & Privacy (KDPA)
            </h3>
            <div className="text-sm space-y-3" style={{ color: "#5A6A7A" }}>
              <p>Under the <strong>Kenya Data Protection Act 2019</strong>, you have the right to access, correct, or request deletion of your personal data.</p>
              <div className="rounded-xl p-3 text-xs" style={{ background: "#EFF6FF", border: "1px solid #DBEAFE" }}>
                <div className="font-semibold mb-1" style={{ color: "#1E3A5F" }}>Data Controller</div>
                <div>WorkAbroad Hub · Nairobi, Kenya</div>
                <a href="mailto:support@workabroadhub.tech" className="text-blue-600 hover:underline" data-testid="link-privacy-email">
                  support@workabroadhub.tech
                </a>
              </div>
              <Link href="/privacy-policy">
                <a className="text-sm font-medium hover:underline" style={{ color: "#0e7490" }} data-testid="link-privacy-policy">
                  Read our full Privacy Policy →
                </a>
              </Link>
            </div>
          </div>
        </div>

        {/* ── Report Scam CTA ── */}
        <div className="rounded-3xl p-6 mb-10 flex flex-col sm:flex-row items-center gap-4" style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
          <div className="flex items-start gap-3 flex-1">
            <AlertTriangle className="h-6 w-6 flex-shrink-0 mt-0.5" style={{ color: "#DC2626" }} />
            <div>
              <div className="font-semibold" style={{ color: "#1A2530" }}>Encountered a scam?</div>
              <p className="text-sm mt-0.5" style={{ color: "#5A6A7A" }}>
                If an agency asked you to pay a fee, took your documents without a contract, or disappeared after payment — report it immediately.
              </p>
            </div>
          </div>
          <Link href="/report-fraud">
            <a data-testid="link-report-fraud-contact">
              <Button variant="destructive" size="sm" className="flex-shrink-0">Report a Scam</Button>
            </a>
          </Link>
        </div>

        {/* ── Nanjila Banner ── */}
        <div
          className="rounded-3xl px-6 sm:px-10 py-7 flex flex-col sm:flex-row items-center justify-between gap-5"
          style={{ background: "linear-gradient(135deg, #1A2530 0%, #2A3A4A 100%)", color: "#fff" }}
        >
          <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
            <img
              src={nanjilaAvatarUrl}
              alt="Nanjila AI Assistant"
              className="rounded-full border-4 border-white object-cover flex-shrink-0"
              style={{ width: 76, height: 76, borderColor: "#fff" }}
              data-testid="img-nanjila-banner"
            />
            <div>
              <h4 className="text-xl font-semibold mb-1" style={{ color: "#fff" }}>Need instant help? Chat with Nanjila</h4>
              <p style={{ color: "#B8C5D0" }}>Our AI assistant is available 24/7 on WhatsApp</p>
            </div>
          </div>
          <a
            href="https://wa.me/254742619777?text=Hi%20Nanjila%2C%20I%20need%20help"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-nanjila-banner"
            className="flex-shrink-0 inline-block rounded-full px-7 py-3.5 font-semibold text-white transition-all duration-200 hover:scale-105 no-underline"
            style={{ background: "#25D366", textDecoration: "none" }}
          >
            💬 Chat with Nanjila →
          </a>
        </div>

        {/* ── Book Consultation ── */}
        <div className="text-center mt-8">
          <Button
            size="lg"
            onClick={() => setBookingOpen(true)}
            data-testid="button-contact-book"
            className="rounded-full px-8 font-semibold"
            style={{ background: "#0e7490", color: "#fff", border: "none" }}
          >
            📅 Book a Scheduled Consultation
          </Button>
        </div>

        {/* ── Footer Note ── */}
        <div className="text-center mt-10 text-sm" style={{ color: "#9AA8B4" }}>
          <p>📞 Emergency? Call or WhatsApp <strong style={{ color: "#5A6A7A" }}>+254 742 619777</strong></p>
          <p className="mt-2">© 2026 WorkAbroad Hub. All rights reserved. · Nairobi, Kenya</p>
        </div>

      </div>

      <ConsultationBookingModal open={bookingOpen} onOpenChange={setBookingOpen} />
    </div>
  );
}
