/**
 * /schools — "Hire qualified teachers, free" landing page for schools.
 *
 * 2026-10 (Tony): he visits schools in person and shows them this page.
 * Short, mobile-first, one clear call to action: register the school,
 * then post teacher vacancies and receive applications from teachers.
 */
import { Link } from "wouter";
import { GraduationCap, CheckCircle2, Users, MapPin, ClipboardList, ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

export default function SchoolsHireTeachers() {
  const { user } = useAuth() as any;
  const registerHref = user
    ? "/employer/register-school"
    : "/signup?redirect=%2Femployer%2Fregister-school";

  const steps = [
    { icon: ClipboardList, title: "Register your school", text: "School name, level, county and a contact person. Takes about 3 minutes." },
    { icon: ShieldCheck,   title: "We verify you",        text: "Usually within 1 business day, so teachers know your vacancy is genuine." },
    { icon: Users,         title: "Post vacancies",       text: "Subjects, level, TSC requirement, start date, pay and housing." },
    { icon: CheckCircle2,  title: "Receive applications", text: "Teachers apply with their CVs and certificates. Shortlist and contact them directly." },
  ];

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="bg-gradient-to-br from-emerald-700 to-teal-600 text-white px-4 pt-10 pb-12">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-white/15 items-center justify-center mb-4">
            <GraduationCap className="h-6 w-6" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Hire qualified teachers — free</h1>
          <p className="mt-3 text-emerald-50 text-base sm:text-lg">
            Post your teaching vacancies on WorkAbroad Hub's Kenya Careers and reach more than
            14,000 registered job-seekers across Kenya.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href={registerHref}>
              <Button size="lg" className="bg-white text-emerald-800 hover:bg-emerald-50 font-semibold w-full sm:w-auto" data-testid="btn-register-school">
                Register your school <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </Link>
            <Link href="/kenya-careers?institution=school">
              <Button size="lg" variant="outline" className="bg-transparent border-white/60 text-white hover:bg-white/10 w-full sm:w-auto">
                See school vacancies
              </Button>
            </Link>
          </div>
          <p className="mt-3 text-xs text-emerald-100">No fees for schools. No contract.</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 -mt-6">
        <Card>
          <CardContent className="p-5 sm:p-6">
            <h2 className="font-semibold text-lg mb-4">How it works</h2>
            <ol className="space-y-4">
              {steps.map((s, i) => (
                <li key={s.title} className="flex gap-3">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-semibold">{i + 1}</div>
                  <div>
                    <p className="font-medium flex items-center gap-1.5"><s.icon className="h-4 w-4 text-emerald-600" />{s.title}</p>
                    <p className="text-sm text-muted-foreground">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          <Card><CardContent className="p-4">
            <p className="font-medium mb-1">Who can post</p>
            <p className="text-sm text-muted-foreground">ECDE centres, primary and junior schools, secondary schools, TVETs and colleges — public, private, mission or international.</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="font-medium mb-1 flex items-center gap-1.5"><MapPin className="h-4 w-4 text-emerald-600" />Local teachers</p>
            <p className="text-sm text-muted-foreground">Vacancies show your county and town, so teachers nearby find you first.</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="font-medium mb-1">Any role at the school</p>
            <p className="text-sm text-muted-foreground">Teachers, BOM teachers, interns and part-time tutors — plus bursars, matrons, librarians, cooks and drivers.</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="font-medium mb-1">You stay in control</p>
            <p className="text-sm text-muted-foreground">Close a vacancy any time. Applicants come to you directly — we never charge your school.</p>
          </CardContent></Card>
        </div>

        <div className="text-center mt-8">
          <Link href={registerHref}>
            <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
              Register your school now <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </Link>
          <p className="text-xs text-muted-foreground mt-3">
            Questions? WhatsApp +254 111 467 601 or email support@workabroadhub.tech
          </p>
        </div>
      </div>
    </div>
  );
}
