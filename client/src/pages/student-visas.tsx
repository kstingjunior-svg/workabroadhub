import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  GraduationCap,
  ArrowLeft,
  Clock,
  DollarSign,
  Calendar,
  Briefcase,
  FileText,
  CheckCircle2,
  ExternalLink,
  AlertTriangle,
  Globe,
  BookOpen,
  Building2,
  Heart,
  Landmark,
  Users,
  Plane,
  MapPin,
  Star,
  TrendingUp,
  Shield,
  ChevronRight,
  Sparkles,
  FileEdit,
  Send,
} from "lucide-react";
import { Link } from "wouter";
import type { StudentVisaWithDetails, VisaLink } from "@shared/schema";

const countryData = [
  { code: "usa", name: "USA", flagEmoji: "🇺🇸", color: "from-blue-600 to-red-600", accent: "bg-blue-500" },
  { code: "canada", name: "Canada", flagEmoji: "🇨🇦", color: "from-red-600 to-red-700", accent: "bg-red-500" },
  { code: "uk", name: "UK", flagEmoji: "🇬🇧", color: "from-blue-700 to-red-700", accent: "bg-blue-600" },
  { code: "australia", name: "Australia", flagEmoji: "🇦🇺", color: "from-blue-600 to-yellow-500", accent: "bg-blue-500" },
  { code: "uae", name: "UAE", flagEmoji: "🇦🇪", color: "from-green-600 to-red-600", accent: "bg-green-500" },
  { code: "europe", name: "Europe", flagEmoji: "🇪🇺", color: "from-blue-600 to-blue-800", accent: "bg-blue-600" },
];

const categoryIcons: Record<string, typeof FileText> = {
  academic: BookOpen,
  financial: DollarSign,
  english: Globe,
  health: Heart,
  other: FileText,
};

const linkTypeIcons: Record<string, typeof ExternalLink> = {
  official: Landmark,
  university: Building2,
  scholarship: GraduationCap,
  embassy: Globe,
};

const countryHighlights: Record<string, { icon: typeof Star; title: string; value: string; link?: string }[]> = {
  usa: [
    { icon: Building2, title: "Top Universities", value: "4,000+", link: "https://www.topuniversities.com/university-rankings/world-university-rankings/2024?countries=us" },
    { icon: Users, title: "Int'l Students", value: "1M+", link: "https://opendoorsdata.org/data/international-students/all-places-of-origin/" },
    { icon: Briefcase, title: "OPT Duration", value: "12-36 months", link: "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-opt-for-f-1-students" },
    { icon: TrendingUp, title: "Avg Starting Salary", value: "$60,000+", link: "https://www.bls.gov/oes/current/oes_nat.htm" },
  ],
  canada: [
    { icon: Building2, title: "DLIs", value: "1,500+", link: "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/prepare/designated-learning-institutions-list.html" },
    { icon: Users, title: "Int'l Students", value: "800K+", link: "https://www.canada.ca/en/immigration-refugees-citizenship/corporate/reports-statistics/statistics-international-students.html" },
    { icon: Briefcase, title: "PGWP Duration", value: "Up to 3 years", link: "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/work/after-graduation.html" },
    { icon: MapPin, title: "PR Pathways", value: "Multiple", link: "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry.html" },
  ],
  uk: [
    { icon: Building2, title: "Universities", value: "160+", link: "https://www.topuniversities.com/university-rankings/world-university-rankings/2024?countries=gb" },
    { icon: Clock, title: "Master's Duration", value: "1 year", link: "https://www.ukcisa.org.uk/Information--Advice/Studying--living-in-the-UK/Studying-in-the-UK" },
    { icon: Briefcase, title: "Graduate Route", value: "2-3 years", link: "https://www.gov.uk/graduate-visa" },
    { icon: Star, title: "World Rankings", value: "Top 100", link: "https://www.timeshighereducation.com/world-university-rankings/2024/world-ranking" },
  ],
  australia: [
    { icon: Building2, title: "Universities", value: "43", link: "https://www.topuniversities.com/university-rankings/world-university-rankings/2024?countries=au" },
    { icon: Users, title: "Int'l Students", value: "700K+", link: "https://www.education.gov.au/international-education-data-and-research/international-student-monthly-summary-and-data-tables" },
    { icon: Briefcase, title: "Post-Study Work", value: "2-4 years", link: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485" },
    { icon: DollarSign, title: "Min Wage", value: "$23+/hr", link: "https://www.fairwork.gov.au/pay-and-wages/minimum-wages" },
  ],
  uae: [
    { icon: Building2, title: "Universities", value: "70+", link: "https://www.topuniversities.com/university-rankings/world-university-rankings/2024?countries=ae" },
    { icon: Globe, title: "Tax-Free Income", value: "0%", link: "https://u.ae/en/information-and-services/finance-and-investment/taxation" },
    { icon: MapPin, title: "Strategic Location", value: "Global Hub", link: "https://www.mohesr.gov.ae/en/higher-education-in-uae" },
    { icon: Star, title: "Growing Education", value: "Hub", link: "https://u.ae/en/information-and-services/education/higher-education" },
  ],
  europe: [
    { icon: Building2, title: "Universities", value: "5,000+", link: "https://www.topuniversities.com/university-rankings/world-university-rankings/2024?region=Europe" },
    { icon: DollarSign, title: "Tuition (Public)", value: "Free-Low", link: "https://www.study.eu/article/free-education-in-europe-a-reality" },
    { icon: Globe, title: "Schengen Access", value: "26 Countries", link: "https://home-affairs.ec.europa.eu/policies/schengen-borders-and-visa/schengen-area_en" },
    { icon: Briefcase, title: "Job Seeker Visa", value: "Available", link: "https://www.make-it-in-germany.com/en/visa-residence/types/job-search" },
  ],
};

function HeroSection({ country }: { country: typeof countryData[0] }) {
  const highlights = countryHighlights[country.code] || [];
  
  return (
    <div className={`relative overflow-hidden rounded-xl bg-gradient-to-r ${country.color} p-6 md:p-8 text-white mb-8`} data-testid={`hero-section-${country.code}`}>
      <div className="absolute inset-0 bg-black/20" />
      <div className="absolute top-0 right-0 opacity-10 text-[200px] leading-none -mr-10 -mt-10">
        {country.flagEmoji}
      </div>
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-5xl">{country.flagEmoji}</span>
          <div>
            <h2 className="text-3xl md:text-4xl font-bold" data-testid={`text-country-title-${country.code}`}>Study in {country.name}</h2>
            <p className="text-white/80 mt-1">Complete guide to student visas and opportunities</p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          {highlights.map((item, i) => {
            const Icon = item.icon;
            const content = (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="h-4 w-4" />
                  <span className="text-sm text-white/80">{item.title}</span>
                  {item.link && <ExternalLink className="h-3 w-3 opacity-60" />}
                </div>
                <p className="text-xl font-bold" data-testid={`stat-value-${country.code}-${i}`}>{item.value}</p>
              </>
            );
            
            if (item.link) {
              return (
                <a 
                  key={i} 
                  href={item.link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="bg-white/10 backdrop-blur-sm rounded-lg p-3 hover:bg-white/20 transition-colors cursor-pointer block" 
                  data-testid={`stat-${country.code}-${i}`}
                >
                  {content}
                </a>
              );
            }
            
            return (
              <div key={i} className="bg-white/10 backdrop-blur-sm rounded-lg p-3" data-testid={`stat-${country.code}-${i}`}>
                {content}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function QuickNavigation({ visa }: { visa: StudentVisaWithDetails }) {
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      <Badge variant="outline" className="flex items-center gap-1 py-1.5 px-3">
        <FileText className="h-3 w-3" />
        {visa.requirements.length} Requirements
      </Badge>
      <Badge variant="outline" className="flex items-center gap-1 py-1.5 px-3">
        <Users className="h-3 w-3" />
        {visa.steps.length} Steps
      </Badge>
      {visa.processingTime && (
        <Badge variant="outline" className="flex items-center gap-1 py-1.5 px-3">
          <Clock className="h-3 w-3" />
          {visa.processingTime}
        </Badge>
      )}
      {visa.applicationFee && (
        <Badge variant="outline" className="flex items-center gap-1 py-1.5 px-3">
          <DollarSign className="h-3 w-3" />
          {visa.applicationFee}
        </Badge>
      )}
    </div>
  );
}

function VisaOverviewCard({ visa }: { visa: StudentVisaWithDetails }) {
  return (
    <Card className="mb-6 overflow-hidden">
      <div className="bg-primary/5 border-b p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <GraduationCap className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl">{visa.visaName}</CardTitle>
              <CardDescription className="mt-1">{visa.description}</CardDescription>
            </div>
          </div>
          <Badge className="text-sm">{visa.visaType}</Badge>
        </div>
      </div>
      
      <CardContent className="p-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {visa.processingTime && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Clock className="h-4 w-4" />
                <span className="text-xs font-medium">Processing Time</span>
              </div>
              <p className="font-semibold">{visa.processingTime}</p>
            </div>
          )}
          {visa.applicationFee && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <DollarSign className="h-4 w-4" />
                <span className="text-xs font-medium">Application Fee</span>
              </div>
              <p className="font-semibold">{visa.applicationFee}</p>
            </div>
          )}
          {visa.validityPeriod && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Calendar className="h-4 w-4" />
                <span className="text-xs font-medium">Validity Period</span>
              </div>
              <p className="font-semibold">{visa.validityPeriod}</p>
            </div>
          )}
          {visa.workRights && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Briefcase className="h-4 w-4" />
                <span className="text-xs font-medium">Work Rights</span>
              </div>
              <p className="font-semibold">{visa.workRights}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RequirementsSection({ visa }: { visa: StudentVisaWithDetails }) {
  const groupedRequirements = visa.requirements.reduce((acc, req) => {
    const cat = req.category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(req);
    return acc;
  }, {} as Record<string, typeof visa.requirements>);

  const categoryLabels: Record<string, string> = {
    academic: "Academic Requirements",
    financial: "Financial Requirements", 
    english: "English Language",
    health: "Health & Insurance",
    other: "Other Documents",
  };

  const categoryColors: Record<string, string> = {
    academic: "bg-blue-500",
    financial: "bg-green-500",
    english: "bg-purple-500",
    health: "bg-red-500",
    other: "bg-gray-500",
  };

  const requiredCount = visa.requirements.filter(r => r.isRequired).length;
  const completionPercent = 0;

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <FileText className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <CardTitle className="text-lg">Requirements & Documents</CardTitle>
              <CardDescription>{requiredCount} required documents</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Preparation Progress</span>
            <Progress value={completionPercent} className="w-24 h-2" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" className="w-full space-y-2">
          {Object.entries(groupedRequirements).map(([category, reqs]) => {
            const Icon = categoryIcons[category] || FileText;
            const color = categoryColors[category] || "bg-gray-500";
            const requiredInCategory = reqs.filter(r => r.isRequired).length;
            
            return (
              <AccordionItem key={category} value={category} className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline py-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 ${color} rounded text-white`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="font-medium">{categoryLabels[category] || category}</span>
                    <Badge variant="secondary" className="ml-2">
                      {requiredInCategory}/{reqs.length}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="space-y-3 py-2">
                    {reqs.map((req) => (
                      <li key={req.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className={`mt-0.5 p-1 rounded-full ${req.isRequired ? "bg-green-100 text-green-600" : "bg-muted text-muted-foreground"}`}>
                          <CheckCircle2 className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-sm">{req.requirement}</p>
                          {!req.isRequired && (
                            <Badge variant="outline" className="mt-1 text-xs">
                              Optional
                            </Badge>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}

function ApplicationStepsSection({ visa }: { visa: StudentVisaWithDetails }) {
  if (visa.steps.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <Users className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <CardTitle className="text-lg">Application Process</CardTitle>
            <CardDescription>Follow these {visa.steps.length} steps to apply</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <div className="absolute left-[19px] top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary via-primary/50 to-muted" />
          
          <div className="space-y-6">
            {visa.steps.map((step, index) => (
              <div key={step.id} className="relative flex gap-4">
                <div className={`relative z-10 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                  index === 0 ? "bg-primary" : "bg-primary/70"
                }`}>
                  {step.stepNumber}
                </div>
                
                <Card className="flex-1 hover-elevate">
                  <CardContent className="p-4">
                    <h4 className="font-semibold mb-2">{step.title}</h4>
                    <p className="text-sm text-muted-foreground mb-3">{step.description}</p>
                    
                    <div className="flex flex-wrap gap-3">
                      {step.estimatedTime && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-full px-2.5 py-1">
                          <Clock className="h-3 w-3" />
                          {step.estimatedTime}
                        </div>
                      )}
                      {step.tips && (
                        <div className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 rounded-full px-2.5 py-1">
                          <Sparkles className="h-3 w-3" />
                          Pro Tip Available
                        </div>
                      )}
                    </div>
                    
                    {step.tips && (
                      <div className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                        <p className="text-sm text-primary flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <span>{step.tips}</span>
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UsefulLinks({ links }: { links: VisaLink[] }) {
  const groupedLinks = links.reduce((acc, link) => {
    const type = link.linkType || "official";
    if (!acc[type]) acc[type] = [];
    acc[type].push(link);
    return acc;
  }, {} as Record<string, VisaLink[]>);

  const linkTypeLabels: Record<string, string> = {
    official: "Official Government Resources",
    university: "University Portals",
    scholarship: "Scholarships & Funding",
    embassy: "Embassies & Consulates",
  };

  const linkTypeColors: Record<string, string> = {
    official: "bg-blue-500",
    university: "bg-purple-500",
    scholarship: "bg-green-500",
    embassy: "bg-orange-500",
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-500/10 rounded-lg">
            <ExternalLink className="h-5 w-5 text-green-500" />
          </div>
          <div>
            <CardTitle className="text-lg">Useful Resources</CardTitle>
            <CardDescription>Official links and helpful portals</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {Object.entries(groupedLinks).map(([type, typeLinks]) => {
            const Icon = linkTypeIcons[type] || ExternalLink;
            const color = linkTypeColors[type] || "bg-gray-500";
            
            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`p-1 ${color} rounded text-white`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <h3 className="font-semibold">{linkTypeLabels[type] || type}</h3>
                </div>
                
                <div className="grid sm:grid-cols-2 gap-3">
                  {typeLinks.map((link) => (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block"
                      data-testid={`link-visa-${link.id}`}
                    >
                      <div className="flex items-center justify-between p-3 border rounded-lg hover-elevate transition-all group-hover:border-primary/50">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                            {link.name}
                          </h4>
                          {link.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {link.description}
                            </p>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors ml-2" />
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function NeedHelpSection() {
  return (
    <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20" data-testid="section-need-help">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-5 w-5 text-primary" />
              <h3 className="font-bold text-lg" data-testid="text-need-help-title">Need Help With Your Application?</h3>
            </div>
            <p className="text-muted-foreground text-sm mb-4">
              Our professional writers can help you craft compelling application documents that stand out.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link href="/services">
                <Button className="gap-2" data-testid="button-sop-service">
                  <FileEdit className="h-4 w-4" />
                  SOP Writing - KES 4,000
                </Button>
              </Link>
              <Link href="/services">
                <Button variant="outline" className="gap-2" data-testid="button-motivation-letter-service">
                  <Send className="h-4 w-4" />
                  Motivation Letter - KES 3,000
                </Button>
              </Link>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl" />
              <div className="relative p-4 bg-background rounded-xl border">
                <Plane className="h-12 w-12 text-primary" />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CountryVisaContent({ countryCode, country }: { countryCode: string; country: typeof countryData[0] }) {
  const { data: visas, isLoading } = useQuery<StudentVisaWithDetails[]>({
    queryKey: ["/api/student-visas", countryCode],
  });

  const { data: links } = useQuery<VisaLink[]>({
    queryKey: ["/api/visa-links", countryCode],
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!visas || visas.length === 0) {
    return (
      <>
        <HeroSection country={country} />
        <Card>
          <CardContent className="p-8 text-center">
            <GraduationCap className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="font-bold text-xl mb-2">Coming Soon</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Detailed student visa information for {country.name} is being prepared. Check back soon for comprehensive guidance!
            </p>
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <HeroSection country={country} />
      
      <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-amber-800 dark:text-amber-200">Important Disclaimer</p>
              <p className="text-amber-700 dark:text-amber-300 mt-1">
                This information is for guidance only. Always verify requirements with official embassy or immigration websites. 
                Requirements may change without notice. WorkAbroad Hub is NOT an immigration consultancy.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {visas.map((visa) => (
        <div key={visa.id}>
          <VisaOverviewCard visa={visa} />
          <QuickNavigation visa={visa} />
          <RequirementsSection visa={visa} />
          <ApplicationStepsSection visa={visa} />
        </div>
      ))}

      {links && links.length > 0 && <UsefulLinks links={links} />}
      
      <NeedHelpSection />
    </div>
  );
}

export default function StudentVisas() {
  const [selectedCountry, setSelectedCountry] = useState("usa");
  const currentCountry = countryData.find(c => c.code === selectedCountry) || countryData[0];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
        <div className="container max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-primary/10 rounded-lg">
                  <GraduationCap className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-lg font-bold">Student Visa Guide</h1>
                  <p className="text-xs text-muted-foreground hidden sm:block">Complete study abroad information</p>
                </div>
              </div>
            </div>
            <Badge variant="outline" className="hidden sm:flex items-center gap-1">
              <Globe className="h-3 w-3" />
              6 Countries
            </Badge>
          </div>
        </div>
      </header>

      <main className="container max-w-6xl mx-auto px-4 py-6 pb-20">
        <Tabs value={selectedCountry} onValueChange={setSelectedCountry}>
          <div className="sticky top-[57px] z-40 bg-background/95 backdrop-blur-md py-3 -mx-4 px-4 mb-6 border-b">
            <TabsList className="flex w-full h-auto gap-1 p-1 bg-muted/50">
              {countryData.map((country) => (
                <TabsTrigger
                  key={country.code}
                  value={country.code}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  data-testid={`tab-${country.code}`}
                >
                  <span className="text-lg">{country.flagEmoji}</span>
                  <span className="hidden sm:inline text-sm">{country.name}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {countryData.map((country) => (
            <TabsContent key={country.code} value={country.code} className="mt-0">
              <CountryVisaContent countryCode={country.code} country={country} />
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
}
