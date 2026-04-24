import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Brain, Sparkles, Target, CheckCircle, Globe, Briefcase, GraduationCap, TrendingUp, ArrowRight, Loader2, MapPin, DollarSign, Clock, AlertCircle, Lock } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

interface UserCareerProfile {
  id: string;
  currentJobTitle: string | null;
  yearsExperience: number | null;
  educationLevel: string | null;
  fieldOfStudy: string | null;
  skills: string[];
  preferredCountries: string[];
  preferredIndustries: string[];
  salaryExpectation: number | null;
  hasPassport: boolean;
  hasWorkExperienceAbroad: boolean;
  aiRecommendations: AIRecommendations | null;
}

interface AIRecommendations {
  topCountries: { country: string; score: number; reason: string }[];
  topJobs: { title: string; country: string; salaryRange: string; reason: string }[];
  actionItems: string[];
  strengthsAnalysis: string;
  improvementAreas: string[];
}

const EDUCATION_LEVELS = [
  { value: "high_school", label: "High School" },
  { value: "diploma", label: "Diploma/Certificate" },
  { value: "bachelors", label: "Bachelor's Degree" },
  { value: "masters", label: "Master's Degree" },
  { value: "phd", label: "PhD/Doctorate" },
];

const COUNTRIES = ["USA", "Canada", "UK", "UAE", "Australia", "Europe"];
const INDUSTRIES = ["Healthcare", "Technology", "Engineering", "Construction", "Hospitality", "Finance", "Education", "Manufacturing"];

const COMMON_SKILLS = [
  "Communication", "Leadership", "Project Management", "Data Analysis",
  "Customer Service", "Microsoft Office", "Programming", "Nursing",
  "Accounting", "Marketing", "Sales", "Teaching", "Driving", "Welding",
  "Electrical", "Plumbing", "Carpentry", "Cooking"
];

export default function CareerMatch() {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const totalSteps = 4;

  const { data: planData } = useQuery<{ planId: string }>({
    queryKey: ["/api/user/plan"],
  });
  const planId = (planData?.planId || "free").toLowerCase();
  const isPaidPlan = planId === "basic" || planId === "pro";

  // Pre-fill profession from dashboard AI match box (stored in sessionStorage)
  const [formData, setFormData] = useState(() => {
    const prefilled = sessionStorage.getItem("dashboard_profession") || "";
    if (prefilled) sessionStorage.removeItem("dashboard_profession");
    return {
      currentJobTitle: prefilled,
      yearsExperience: "",
      educationLevel: "",
      fieldOfStudy: "",
      skills: [] as string[],
      preferredCountries: [] as string[],
      preferredIndustries: [] as string[],
      salaryExpectation: "",
      hasPassport: false,
      hasWorkExperienceAbroad: false,
    };
  });

  const { data: profile, isLoading: profileLoading } = useQuery<UserCareerProfile | null>({
    queryKey: ["/api/career-profile"],
  });

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/career-profile", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/career-profile"] });
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/career-profile/analyze");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/career-profile"] });
      toast({ title: "Analysis Complete", description: "Your personalized career recommendations are ready!" });
    },
    onError: (error: any) => {
      toast({ title: "Analysis Failed", description: error.message || "Please try again", variant: "destructive" });
    },
  });

  const handleSaveStep = async () => {
    const dataToSave = {
      ...formData,
      yearsExperience: formData.yearsExperience ? parseInt(formData.yearsExperience) : null,
      salaryExpectation: formData.salaryExpectation ? parseInt(formData.salaryExpectation) : null,
    };
    await saveMutation.mutateAsync(dataToSave);
    if (step < totalSteps) {
      setStep(step + 1);
    }
  };

  const handleAnalyze = async () => {
    await handleSaveStep();
    analyzeMutation.mutate();
  };

  const toggleArrayItem = (array: string[], item: string, setter: (arr: string[]) => void) => {
    if (array.includes(item)) {
      setter(array.filter(i => i !== item));
    } else {
      setter([...array, item]);
    }
  };

  // Block free-plan users from accessing AI Career Match
  if (planData !== undefined && !isPaidPlan) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50/50 via-background to-purple-50/50 dark:from-blue-950/20 dark:via-background dark:to-purple-950/20 p-4 md:p-8">
        <div className="max-w-xl mx-auto space-y-6">
          <div className="text-center space-y-4 pt-8">
            <div className="h-16 w-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto">
              <Lock className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">BASIC / PRO Plan Required</Badge>
            <h1 className="text-2xl font-bold">AI Career Match</h1>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              Get personalised AI-powered country and job recommendations based on your profile. Available on Basic and Pro plans.
            </p>
          </div>
          <Card>
            <CardContent className="p-5 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">What you unlock</p>
              {[
                "AI-ranked top countries for your skills and background",
                "Personalised overseas job recommendations",
                "Salary benchmarks and visa difficulty ratings",
                "Actionable next-steps and career action plan",
                "Strengths analysis and improvement areas",
              ].map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                  <span>{f}</span>
                </div>
              ))}
              <div className="flex flex-col gap-2 pt-2">
                <Link href="/pricing">
                  <Button className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-upgrade-careermatch">
                    <Brain className="h-4 w-4" /> Upgrade to PRO
                  </Button>
                </Link>
                <Link href="/payment">
                  <Button variant="outline" className="w-full" data-testid="button-pay-careermatch">Pay Now</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Show existing recommendations if available
  if (profile?.aiRecommendations && step === 1) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50/50 via-background to-purple-50/50 dark:from-blue-950/20 dark:via-background dark:to-purple-950/20 p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-full">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">AI Analysis Complete</span>
            </div>
            <h1 className="text-3xl font-bold">Your Career Match Results</h1>
            <p className="text-muted-foreground">Personalized recommendations based on your profile</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-blue-500" />
                Top Countries For You
              </CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-4">
              {profile.aiRecommendations.topCountries.map((country, i) => (
                <div key={i} className="p-4 bg-muted/50 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-lg">{country.country}</h3>
                    <Badge className="bg-blue-500">{country.score}% Match</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{country.reason}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-purple-500" />
                Recommended Jobs
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {profile.aiRecommendations.topJobs.map((job, i) => (
                <div key={i} className="p-4 bg-muted/50 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="font-bold">{job.title}</h3>
                    <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {job.country}</span>
                      <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> {job.salaryRange}</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground md:max-w-xs">{job.reason}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-orange-500" />
                Your Action Plan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
                <h4 className="font-semibold text-emerald-700 dark:text-emerald-300 mb-2">Your Strengths</h4>
                <p className="text-sm">{profile.aiRecommendations.strengthsAnalysis}</p>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold">Next Steps:</h4>
                {profile.aiRecommendations.actionItems.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                    <div className="h-6 w-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold shrink-0">
                      {i + 1}
                    </div>
                    <p className="text-sm">{item}</p>
                  </div>
                ))}
              </div>
              {profile.aiRecommendations.improvementAreas.length > 0 && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
                  <h4 className="font-semibold text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Areas to Improve
                  </h4>
                  <ul className="text-sm space-y-1">
                    {profile.aiRecommendations.improvementAreas.map((area, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        {area}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-center">
            <Button onClick={() => setStep(1)} variant="outline" className="mr-4" data-testid="button-update-profile">
              Update My Profile
            </Button>
            <Button onClick={() => analyzeMutation.mutate()} disabled={analyzeMutation.isPending} data-testid="button-reanalyze">
              {analyzeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
              Re-Analyze
            </Button>
          </div>

          {/* Legal Disclaimer */}
          <div className="text-center text-xs text-muted-foreground px-4 py-4 mt-4 bg-muted/30 rounded-lg">
            <p>
              <strong>Disclaimer:</strong> These AI-generated recommendations are for informational purposes only. 
              WorkAbroad Hub does not guarantee employment, visa approval, or job placement. 
              All applications are made independently by you on third-party platforms. 
              Salary ranges are estimates and may vary.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (profileLoading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-2xl mx-auto space-y-8">
          <Skeleton className="h-12 w-64 mx-auto" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/50 via-background to-purple-50/50 dark:from-blue-950/20 dark:via-background dark:to-purple-950/20 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 dark:bg-purple-900/50 rounded-full">
            <Brain className="h-4 w-4 text-purple-600" />
            <span className="text-sm font-medium text-purple-700 dark:text-purple-300">AI Career Matching</span>
          </div>
          <h1 className="text-3xl font-bold">Find Your Perfect Overseas Career</h1>
          <p className="text-muted-foreground">Answer a few questions and our AI will match you with the best countries and jobs</p>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Step {step} of {totalSteps}</span>
            <span>{Math.round((step / totalSteps) * 100)}% Complete</span>
          </div>
          <Progress value={(step / totalSteps) * 100} className="h-2" />
        </div>

        <Card>
          <CardContent className="p-6 space-y-6">
            {step === 1 && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-blue-500" />
                    Professional Background
                  </h2>
                  
                  <div className="space-y-2">
                    <Label>Current/Most Recent Job Title</Label>
                    <Input 
                      placeholder="e.g., Registered Nurse, Software Developer, Accountant"
                      value={formData.currentJobTitle}
                      onChange={(e) => setFormData({ ...formData, currentJobTitle: e.target.value })}
                      data-testid="input-job-title"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Years of Experience</Label>
                    <Input 
                      type="number"
                      placeholder="e.g., 5"
                      value={formData.yearsExperience}
                      onChange={(e) => setFormData({ ...formData, yearsExperience: e.target.value })}
                      data-testid="input-experience"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Highest Education Level</Label>
                    <Select 
                      value={formData.educationLevel} 
                      onValueChange={(v) => setFormData({ ...formData, educationLevel: v })}
                    >
                      <SelectTrigger data-testid="select-education">
                        <SelectValue placeholder="Select education level" />
                      </SelectTrigger>
                      <SelectContent>
                        {EDUCATION_LEVELS.map(level => (
                          <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Field of Study</Label>
                    <Input 
                      placeholder="e.g., Nursing, Computer Science, Business"
                      value={formData.fieldOfStudy}
                      onChange={(e) => setFormData({ ...formData, fieldOfStudy: e.target.value })}
                      data-testid="input-field-of-study"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-500" />
                  Your Skills
                </h2>
                <p className="text-sm text-muted-foreground">Select all skills that apply to you</p>
                
                <div className="flex flex-wrap gap-2">
                  {COMMON_SKILLS.map(skill => (
                    <Badge 
                      key={skill}
                      variant={formData.skills.includes(skill) ? "default" : "outline"}
                      className="cursor-pointer py-2 px-3"
                      onClick={() => toggleArrayItem(formData.skills, skill, (arr) => setFormData({ ...formData, skills: arr }))}
                      data-testid={`skill-${skill.toLowerCase().replace(/\s/g, '-')}`}
                    >
                      {formData.skills.includes(skill) && <CheckCircle className="h-3 w-3 mr-1" />}
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Globe className="h-5 w-5 text-blue-500" />
                  Preferences
                </h2>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Preferred Countries (select all that interest you)</Label>
                    <div className="flex flex-wrap gap-2">
                      {COUNTRIES.map(country => (
                        <Badge 
                          key={country}
                          variant={formData.preferredCountries.includes(country) ? "default" : "outline"}
                          className="cursor-pointer py-2 px-3"
                          onClick={() => toggleArrayItem(formData.preferredCountries, country, (arr) => setFormData({ ...formData, preferredCountries: arr }))}
                          data-testid={`country-${country.toLowerCase()}`}
                        >
                          {formData.preferredCountries.includes(country) && <CheckCircle className="h-3 w-3 mr-1" />}
                          {country}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Preferred Industries</Label>
                    <div className="flex flex-wrap gap-2">
                      {INDUSTRIES.map(industry => (
                        <Badge 
                          key={industry}
                          variant={formData.preferredIndustries.includes(industry) ? "default" : "outline"}
                          className="cursor-pointer py-2 px-3"
                          onClick={() => toggleArrayItem(formData.preferredIndustries, industry, (arr) => setFormData({ ...formData, preferredIndustries: arr }))}
                          data-testid={`industry-${industry.toLowerCase()}`}
                        >
                          {formData.preferredIndustries.includes(industry) && <CheckCircle className="h-3 w-3 mr-1" />}
                          {industry}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Expected Monthly Salary (USD)</Label>
                    <Input 
                      type="number"
                      placeholder="e.g., 3000"
                      value={formData.salaryExpectation}
                      onChange={(e) => setFormData({ ...formData, salaryExpectation: e.target.value })}
                      data-testid="input-salary"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Target className="h-5 w-5 text-orange-500" />
                  Immigration Readiness
                </h2>
                
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <Checkbox 
                      id="passport"
                      checked={formData.hasPassport}
                      onCheckedChange={(checked) => setFormData({ ...formData, hasPassport: checked as boolean })}
                      data-testid="checkbox-passport"
                    />
                    <Label htmlFor="passport" className="cursor-pointer">I have a valid passport</Label>
                  </div>

                  <div className="flex items-center space-x-3">
                    <Checkbox 
                      id="abroad"
                      checked={formData.hasWorkExperienceAbroad}
                      onCheckedChange={(checked) => setFormData({ ...formData, hasWorkExperienceAbroad: checked as boolean })}
                      data-testid="checkbox-abroad"
                    />
                    <Label htmlFor="abroad" className="cursor-pointer">I have previous work experience abroad</Label>
                  </div>
                </div>

                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
                  <h3 className="font-semibold text-purple-700 dark:text-purple-300 mb-2 flex items-center gap-2">
                    <Brain className="h-4 w-4" />
                    Ready to Get Your AI Recommendations
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Our AI will analyze your profile and provide personalized country and job recommendations based on your skills, experience, and preferences.
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-between pt-4">
              {step > 1 && (
                <Button variant="outline" onClick={() => setStep(step - 1)} data-testid="button-back">
                  Back
                </Button>
              )}
              <div className="ml-auto">
                {step < totalSteps ? (
                  <Button onClick={handleSaveStep} disabled={saveMutation.isPending} data-testid="button-next">
                    {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Next
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                ) : (
                  <Button 
                    onClick={handleAnalyze} 
                    disabled={analyzeMutation.isPending || saveMutation.isPending}
                    className="bg-gradient-to-r from-purple-500 to-indigo-600"
                    data-testid="button-get-recommendations"
                  >
                    {(analyzeMutation.isPending || saveMutation.isPending) ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Brain className="h-4 w-4 mr-2" />
                    )}
                    Get AI Recommendations
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Legal Disclaimer */}
        <div className="text-center text-xs text-muted-foreground px-4 py-2">
          <p>
            AI recommendations are for guidance only. WorkAbroad Hub does not guarantee employment or visa approval. 
            All job applications are made independently by you on third-party platforms.
          </p>
        </div>
      </div>
    </div>
  );
}
