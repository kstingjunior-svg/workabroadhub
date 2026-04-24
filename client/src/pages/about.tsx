import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import {
  Shield, Users, Award, MapPin, Phone, Mail,
  CheckCircle, Globe, Star, Target, Heart, ArrowRight, Briefcase
} from "lucide-react";
import ConsultationBookingModal from "@/components/consultation-booking-modal";

const values = [
  {
    icon: Shield,
    title: "Transparency First",
    desc: "We are a consultation service, not a recruitment agency. We never charge placement fees and we never guarantee employment — anyone who does is a scammer.",
  },
  {
    icon: Target,
    title: "Kenya-Focused Expertise",
    desc: "Every piece of advice we give is tailored to Kenyans — local salary expectations, NEA-licensed agency verification, and destination countries that actively hire Kenyan workers.",
  },
  {
    icon: Heart,
    title: "Your Success, Honestly",
    desc: "We'll tell you when a job advert looks suspicious, when a country's demand is seasonal, and when your CV needs work — because honest guidance saves you money and heartbreak.",
  },
  {
    icon: Globe,
    title: "Regulatory Compliance",
    desc: "We operate under the Kenya Data Protection Act 2019, refer only to NEA-licensed agencies, and follow National Employment Authority guidelines on overseas recruitment.",
  },
];

const team = [
  {
    name: "WorkAbroad Hub Team",
    role: "Career Consultants",
    desc: "Our team has helped hundreds of Kenyans navigate overseas employment in the UAE, Saudi Arabia, Canada, the UK, and beyond.",
    icon: Briefcase,
  },
];

const milestones = [
  { year: "2019", event: "Founded in Nairobi with a mission to protect Kenyans from overseas job scams" },
  { year: "2021", event: "Launched our first NEA agency verification database" },
  { year: "2023", event: "Reached 1,000+ consultations completed" },
  { year: "2024", event: "Launched AI-powered CV checker and Job Scam Detector" },
  { year: "2025", event: "Over 4,200 users served across 6 destination countries" },
];

export default function AboutPage() {
  const [bookingOpen, setBookingOpen] = useState(false);

  const { data: publicStats } = useQuery<{ totalUsers: number; expiredAgencies: number }>({
    queryKey: ["/api/public/stats"],
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-900 via-blue-950 to-teal-900 text-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <Badge className="bg-teal-500/20 text-teal-300 border-teal-500/30 mb-4">About WorkAbroad Hub</Badge>
          <h1 className="text-3xl sm:text-5xl font-bold mb-6 leading-tight">
            Helping Kenyans Work Abroad — <span className="text-teal-400">Safely and Smartly</span>
          </h1>
          <p className="text-slate-300 text-lg max-w-2xl mx-auto mb-8">
            We are a Nairobi-based career consultation service. We do not place you in jobs — we give you the honest guidance, verified information, and professional tools to find them yourself.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button size="lg" className="bg-teal-500 hover:bg-teal-400 text-white" onClick={() => setBookingOpen(true)} data-testid="button-about-book">
              Book a Consultation
            </Button>
            <Link href="/services">
              <Button size="lg" variant="outline" className="border-slate-400 text-white hover:bg-white/10" data-testid="button-about-services">
                View Our Services <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Disclaimer Banner */}
      <section className="bg-amber-50 border-b border-amber-200 py-4 px-4">
        <div className="max-w-4xl mx-auto flex items-start gap-3">
          <Shield className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            <strong>Important:</strong> WorkAbroad Hub is a <strong>career consultation service</strong>, not a recruitment agency. We do not place workers, charge placement/visa fees, or guarantee employment outcomes. We are not affiliated with any specific employer or foreign government. Always verify any agency through the official <a href="/nea-agencies" className="underline font-medium">NEA register</a>.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="py-14 px-4 bg-slate-50 border-b">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { value: publicStats?.totalUsers ? `${publicStats.totalUsers.toLocaleString()}+` : "…", label: "Users Served" },
            { value: "1,296", label: "NEA Agencies Verified" },
            { value: "30+", label: "Job Portals Curated" },
            { value: "6", label: "Destination Countries" },
          ].map(s => (
            <div key={s.label} data-testid={`stat-${s.label.toLowerCase().replace(/ /g, "-")}`}>
              <div className="text-3xl font-bold text-teal-600">{s.value}</div>
              <div className="text-sm text-slate-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Who We Are */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-2xl font-bold text-slate-800 mb-4">Who We Are</h2>
              <div className="space-y-4 text-slate-600 leading-relaxed">
                <p>
                  WorkAbroad Hub was founded in Nairobi, Kenya, by a team that saw first-hand how many Kenyans were losing money to fraudulent overseas job schemes. We set out to build a platform that gives job seekers honest, actionable information without the predatory fees.
                </p>
                <p>
                  We are <strong>not</strong> a recruitment agency. We do not take commissions from employers. We do not have exclusive job listings. What we do is give you the tools to evaluate your options, verify who you're dealing with, and prepare an application that stands out.
                </p>
                <p>
                  Our consultants have direct experience with overseas employment pathways in the UAE, Saudi Arabia, Qatar, Canada, the United Kingdom, and Australia — and know the pitfalls that catch most applicants off guard.
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {[
                "Registered and operating in Nairobi, Kenya",
                "Compliant with Kenya Data Protection Act 2019",
                "NEA agency database maintained in real-time",
                "No placement fees — ever",
                "No employment guarantees — we're honest about that",
                "Consultations via WhatsApp for accessibility",
              ].map(item => (
                <div key={item} className="flex items-start gap-2.5">
                  <CheckCircle className="h-4 w-4 text-teal-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-700">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Our Values */}
      <section className="py-16 px-4 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-slate-800">What We Stand For</h2>
            <p className="text-slate-500 mt-2 text-sm">The principles that guide everything we do</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            {values.map(v => (
              <Card key={v.title} className="border-slate-200">
                <CardContent className="p-6">
                  <div className="h-10 w-10 rounded-lg bg-teal-100 flex items-center justify-center mb-4">
                    <v.icon className="h-5 w-5 text-teal-600" />
                  </div>
                  <h3 className="font-semibold text-slate-800 mb-2">{v.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{v.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-slate-800">Our Journey</h2>
          </div>
          <div className="relative border-l-2 border-teal-200 ml-4 space-y-8">
            {milestones.map((m, i) => (
              <div key={i} className="pl-8 relative">
                <div className="absolute -left-2.5 top-1 h-4 w-4 rounded-full bg-teal-500 border-2 border-white shadow" />
                <div className="text-xs font-bold text-teal-600 mb-1">{m.year}</div>
                <p className="text-sm text-slate-700">{m.event}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Legal Section */}
      <section className="py-12 px-4 bg-blue-50 border-y border-blue-100">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" /> Legal & Compliance
          </h2>
          <div className="grid sm:grid-cols-3 gap-4 text-sm text-slate-700">
            <div className="bg-white rounded-lg p-4 border border-blue-100">
              <div className="font-semibold mb-1">Data Controller</div>
              <p className="text-slate-500 text-xs">WorkAbroad Hub, Nairobi, Kenya. Under the Kenya Data Protection Act 2019, you have the right to access, correct, and delete your data.</p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-blue-100">
              <div className="font-semibold mb-1">NEA Compliance</div>
              <p className="text-slate-500 text-xs">We maintain a live database of NEA-licensed agencies and encourage users to verify any agency before engaging their services.</p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-blue-100">
              <div className="font-semibold mb-1">No Guarantee Policy</div>
              <p className="text-slate-500 text-xs">We do not guarantee job placement, visa approval, or any specific employment outcome. See our full <a href="/terms-of-service" className="underline text-blue-600">Terms of Service</a>.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="text-2xl font-bold text-slate-800 mb-3">Ready to Take the Next Step?</h2>
          <p className="text-slate-500 mb-8 text-sm">
            Book a 1-on-1 WhatsApp consultation or explore our services. We'll give you honest answers — no sales pitch.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button size="lg" className="bg-teal-600 hover:bg-teal-700" onClick={() => setBookingOpen(true)} data-testid="button-about-cta-book">
              Book a Consultation
            </Button>
            <Link href="/contact">
              <Button size="lg" variant="outline" data-testid="button-about-contact">
                Contact Us
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <ConsultationBookingModal open={bookingOpen} onOpenChange={setBookingOpen} />
    </div>
  );
}
