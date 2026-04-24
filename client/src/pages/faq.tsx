import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Search, MessageSquare, Shield, CreditCard, FileText, Globe, Users } from "lucide-react";
import ConsultationBookingModal from "@/components/consultation-booking-modal";

const categories = [
  {
    id: "general",
    label: "General",
    icon: Users,
    faqs: [
      {
        q: "What exactly is WorkAbroad Hub? Is it a recruitment agency?",
        a: "No. WorkAbroad Hub is a career consultation service, not a recruitment agency. We do not place workers with employers, we do not earn commissions from hiring companies, and we do not have exclusive job listings. We give you honest guidance, professional tools (CV checking, job scam detection), and help you prepare strong applications — but you apply to jobs yourself. This protects you from the exploitation that happens with unregulated agencies."
      },
      {
        q: "Do you guarantee I will get a job?",
        a: "No — and you should never trust any service that does. No legitimate consultant can guarantee overseas employment, visa approval, or any specific outcome. These are decisions made by foreign employers and governments. What we guarantee is honest, thorough guidance based on real experience. If we think your target country or job type is a long shot for your profile, we'll tell you that upfront."
      },
      {
        q: "Who is this service for?",
        a: "WorkAbroad Hub is designed for Kenyans seeking overseas employment or education — whether you're a domestic worker, nurse, engineer, or recent graduate. It's also useful for anyone who wants to verify a recruitment agency before engaging them, or check whether a job offer they received is legitimate."
      },
      {
        q: "Are you registered / legally operating in Kenya?",
        a: "Yes. We operate in Nairobi, Kenya, and comply with the Kenya Data Protection Act 2019, the National Employment Authority (NEA) guidelines, and applicable labour laws. We are a consultation service, not a recruitment agency, so NEA agency licensing requirements do not apply to us — but we actively promote the use of NEA-licensed agencies and provide a verified agency database."
      },
      {
        q: "What countries do you cover?",
        a: "Our primary focus is popular Kenyan overseas employment destinations: UAE/Gulf countries, Saudi Arabia, Qatar, Kuwait, Canada, United Kingdom, USA, and Australia. Our consultants have experience with employer requirements, visa processes, and salary benchmarks across all these markets."
      },
    ]
  },
  {
    id: "services",
    label: "Our Services",
    icon: FileText,
    faqs: [
      {
        q: "What does a consultation include?",
        a: "A 1-on-1 WhatsApp consultation covers whatever you need most — typically country and job recommendations based on your profile, CV review feedback, guidance on which agencies to use, explanation of visa processes, and honest assessment of your chances. Sessions are typically 30–60 minutes and happen via WhatsApp voice or text chat at a scheduled time."
      },
      {
        q: "What is the difference between the Free and Pro plans?",
        a: "The Free plan gives you access to our tools (ATS CV Checker, Job Scam Checker) with partial results, and allows you to browse country guides and the NEA agency database. The Pro plan (KES 4,500 / 365 days) unlocks everything — full verified job listings, unlimited AI tools, 1-on-1 WhatsApp consultation, priority listings, ATS CV Checker, application tracker, and all service discounts. You can upgrade at any time."
      },
      {
        q: "Do I pay before or after the consultation?",
        a: "Payment is required before a consultation is confirmed. Once you book and pay, we confirm your slot via WhatsApp. We do not take payment during the call or after. All prices are listed on our Services and Pricing pages — there are no hidden fees."
      },
      {
        q: "What is the CV Review service?",
        a: "Our consultants review your CV against the expectations of overseas employers in your target country. We flag formatting issues, keyword gaps, and content problems, then deliver detailed written feedback. This is different from the free ATS CV Checker tool, which is automated — the CV Review is done by a real person."
      },
      {
        q: "Can you help me write a cover letter?",
        a: "Yes. We offer a Cover Letter Writing service where our consultants draft a tailored letter for your target role and country. We also have an AI Job Application Assistant tool in our free tools section that generates a first draft you can refine."
      },
    ]
  },
  {
    id: "payments",
    label: "Payments & Refunds",
    icon: CreditCard,
    faqs: [
      {
        q: "How do I pay? What payment methods are accepted?",
        a: "We accept M-Pesa (STK Push to your phone — Paybill 4153025). All payments are processed securely via Safaricom's official M-Pesa API — you will receive an STK prompt on your phone to confirm with your PIN."
      },
      {
        q: "Is it safe to pay online through WorkAbroad Hub?",
        a: "Yes. Our M-Pesa integration uses the official Safaricom Daraja API with shortcode 4153025. All transactions are logged and you receive an M-Pesa confirmation from Safaricom directly. We do not store your M-Pesa PIN or any payment credentials."
      },
      {
        q: "What is your refund policy?",
        a: "Consultation fees are refundable if you cancel at least 24 hours before your scheduled slot, or if we fail to provide the service. Digital service fees (CV review, cover letter writing) are non-refundable once work has begun. For full details, see our Refund Policy page."
      },
      {
        q: "I paid but nothing happened — what do I do?",
        a: "First, check your M-Pesa messages for a payment confirmation from Safaricom. If you received confirmation but your account doesn't show the payment, wait 5 minutes and refresh — our system may be processing. If the issue persists, WhatsApp us at +254 742 619777 with your M-Pesa transaction ID (MPESA code) and we'll resolve it manually within 24 hours."
      },
      {
        q: "Can I upgrade my plan later?",
        a: "Yes. You can upgrade from Free to Pro at any time from the Pricing page. Your upgrade takes effect immediately after payment is confirmed."
      },
    ]
  },
  {
    id: "agencies",
    label: "Agency Verification",
    icon: Shield,
    faqs: [
      {
        q: "How do I verify if a recruitment agency is licensed?",
        a: "Go to our NEA Agencies page and search by agency name or license number. Our database contains 1,295 agencies registered with the National Employment Authority (NEA). A valid license shows a current expiry date. If an agency is not in our database or has an expired license, be very cautious — they are operating illegally."
      },
      {
        q: "An agency asked me to pay a fee to get a job abroad. Is this legal?",
        a: "In most cases, no. Legitimate recruitment agencies are paid by the employer, not the worker. Charging workers upfront fees for visa processing, training, or registration is illegal under Kenyan law. The only legitimate fees are passport costs and medical examination fees, which you pay to the relevant government offices directly — not to the agency. If an agency asks for money, verify their NEA license first, and if in doubt, contact us before paying anything."
      },
      {
        q: "A company says they are NEA-licensed but I can't find them in your database. What should I do?",
        a: "Our database is updated regularly but may have a short lag. First, try searching by different spellings of the name. If you still can't find them, contact us via WhatsApp and we'll check directly with the NEA registry. Do not proceed with any agency until their license is confirmed."
      },
      {
        q: "What is the Government Manual Override system?",
        a: "Occasionally, the NEA government database experiences downtime. When this happens, our system automatically flags the affected period and our admins can create manual license verifications based on official documents. You'll see a downtime notice on the NEA page if this is active — it means data may be up to 24 hours old."
      },
    ]
  },
  {
    id: "scams",
    label: "Scam Protection",
    icon: Globe,
    faqs: [
      {
        q: "How do I know if a job offer is real?",
        a: "Use our free Job Scam Checker tool — paste the job advert and we'll scan it for red flags like upfront fees, unrealistic salaries, generic contact addresses, and suspicious phrases. Key warning signs: the employer contacts you first (you didn't apply), they ask for payment before any interview, the salary is unusually high for unskilled work, or they communicate only via WhatsApp without a company email."
      },
      {
        q: "I think I've been scammed. What should I do?",
        a: "Stop all payments immediately and do not send any more documents or money. Report the scam using our Report Fraud page — we share information with NEA and law enforcement. You should also report it to the Directorate of Criminal Investigations (DCI) Cyber Crime Unit. If you've already paid, contact your bank or M-Pesa to attempt a reversal (this has a short window). Keep all messages, receipts, and contact details as evidence."
      },
      {
        q: "Someone claiming to be WorkAbroad Hub is asking me for money via a personal number. Is this you?",
        a: "No. WorkAbroad Hub never solicits payments via personal phone numbers or unofficial WhatsApp accounts. All our payments go through the official M-Pesa Paybill (shortcode 4153025). If someone is impersonating us, report it to us immediately at support@workabroadhub.tech and report the number to Safaricom."
      },
    ]
  },
];

export default function FAQPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("general");
  const [bookingOpen, setBookingOpen] = useState(false);

  const allFaqs = categories.flatMap(c => c.faqs.map(f => ({ ...f, category: c.id })));
  const searchResults = search.length > 2
    ? allFaqs.filter(f =>
        f.q.toLowerCase().includes(search.toLowerCase()) ||
        f.a.toLowerCase().includes(search.toLowerCase())
      )
    : null;

  const activeGroup = categories.find(c => c.id === activeCategory);

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-900 via-blue-950 to-teal-900 text-white py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <Badge className="bg-teal-500/20 text-teal-300 border-teal-500/30 mb-4">Help Centre</Badge>
          <h1 className="text-3xl sm:text-4xl font-bold mb-4">Frequently Asked Questions</h1>
          <p className="text-slate-300 text-base mb-8 max-w-xl mx-auto">
            Honest answers to the questions we get asked most. Can't find what you need? Message us on WhatsApp.
          </p>
          <div className="relative max-w-lg mx-auto">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search questions..."
              className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-slate-400 focus:bg-white/20"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-faq-search"
            />
          </div>
        </div>
      </section>

      <section className="py-12 px-4">
        <div className="max-w-3xl mx-auto">
          {/* Search Results */}
          {searchResults !== null ? (
            <div>
              <p className="text-sm text-slate-500 mb-6">{searchResults.length} result(s) for "{search}"</p>
              {searchResults.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Search className="h-8 w-8 mx-auto mb-3 opacity-30" />
                  <p>No results found. Try different keywords or <a href="/contact" className="text-teal-600 underline">contact us</a>.</p>
                </div>
              ) : (
                <Accordion type="single" collapsible className="space-y-3">
                  {searchResults.map((f, i) => (
                    <AccordionItem key={i} value={`search-${i}`} className="border rounded-lg px-4">
                      <AccordionTrigger className="text-left text-sm font-medium py-4" data-testid={`faq-search-item-${i}`}>
                        {f.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-sm text-slate-600 pb-4 leading-relaxed">{f.a}</AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </div>
          ) : (
            <div className="flex flex-col md:flex-row gap-8">
              {/* Category Tabs */}
              <div className="md:w-44 flex-shrink-0">
                <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
                  {categories.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setActiveCategory(c.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-left whitespace-nowrap transition-all flex-shrink-0 ${
                        activeCategory === c.id
                          ? "bg-teal-50 text-teal-700 border border-teal-200"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                      data-testid={`faq-category-${c.id}`}
                    >
                      <c.icon className="h-4 w-4 flex-shrink-0" />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* FAQ List */}
              <div className="flex-1">
                {activeGroup && (
                  <>
                    <h2 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2">
                      <activeGroup.icon className="h-5 w-5 text-teal-600" />
                      {activeGroup.label}
                    </h2>
                    <Accordion type="single" collapsible className="space-y-3">
                      {activeGroup.faqs.map((f, i) => (
                        <AccordionItem
                          key={i}
                          value={`faq-${i}`}
                          className="border border-slate-200 rounded-lg px-4 hover:border-teal-200 transition-colors"
                        >
                          <AccordionTrigger
                            className="text-left text-sm font-medium py-4 hover:no-underline"
                            data-testid={`faq-item-${activeCategory}-${i}`}
                          >
                            {f.q}
                          </AccordionTrigger>
                          <AccordionContent className="text-sm text-slate-600 pb-4 leading-relaxed">
                            {f.a}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Still have questions CTA */}
      <section className="py-14 px-4 bg-teal-50 border-t border-teal-100">
        <div className="max-w-xl mx-auto text-center">
          <MessageSquare className="h-9 w-9 text-teal-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">Still have a question?</h2>
          <p className="text-sm text-slate-600 mb-6">
            Our team answers every message personally. WhatsApp is the fastest — we typically respond within 24 hours.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a href="https://wa.me/254742619777" target="_blank" rel="noopener noreferrer" data-testid="link-faq-whatsapp">
              <Button className="bg-green-600 hover:bg-green-700">
                <MessageSquare className="h-4 w-4 mr-2" /> WhatsApp Us
              </Button>
            </a>
            <Button variant="outline" onClick={() => setBookingOpen(true)} data-testid="button-faq-book">
              Book a Consultation
            </Button>
            <Link href="/contact">
              <Button variant="ghost" data-testid="link-faq-contact">All Contact Options</Button>
            </Link>
          </div>
        </div>
      </section>

      <ConsultationBookingModal open={bookingOpen} onOpenChange={setBookingOpen} />
    </div>
  );
}
