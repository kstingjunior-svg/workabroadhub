import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, CheckCircle, Quote, MapPin, Briefcase, TrendingUp, Clock, ShieldCheck, CalendarDays } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { anonymizeDisplayName, formatMemberSince } from "@/lib/anonymize";

interface SuccessStory {
  id: string;
  name: string;
  location: string;
  countryCode: string;
  jobTitle: string;
  company: string;
  story: string;
  quote: string;
  rating: number;
  salaryIncrease: string;
  timeToJob: string;
  isVerified: boolean;
  isFeatured: boolean;
  createdAt?: string | null;
}

const countryGradients: Record<string, string> = {
  canada: "from-red-500 to-red-600",
  uae: "from-green-500 to-green-600",
  uk: "from-blue-600 to-indigo-700",
  australia: "from-blue-500 to-yellow-500",
  europe: "from-blue-600 to-yellow-500",
  usa: "from-blue-600 to-red-600"
};

export function SuccessStoriesSection() {
  const { data: stories, isLoading, isError } = useQuery<SuccessStory[]>({
    queryKey: ["/api/success-stories"],
  });

  if (isLoading) {
    return (
      <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-emerald-50/50 via-background to-teal-50/50 dark:from-emerald-950/20 dark:via-background dark:to-teal-950/20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 space-y-4">
            <Skeleton className="h-8 w-48 mx-auto" />
            <Skeleton className="h-12 w-96 mx-auto" />
            <Skeleton className="h-6 w-72 mx-auto" />
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 rounded-2xl" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-sm text-muted-foreground">Unable to load community feedback at this time.</p>
        </div>
      </section>
    );
  }

  if (!stories || stories.length === 0) {
    return null;
  }

  return (
    <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-emerald-50/50 via-background to-teal-50/50 dark:from-emerald-950/20 dark:via-background dark:to-teal-950/20">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12 sm:mb-16 space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100/80 dark:bg-emerald-900/40 rounded-full mx-auto border border-emerald-200/50 dark:border-emerald-800/50">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Community Feedback</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight" data-testid="text-community-feedback-title">
            Community Feedback
          </h2>
          <p className="text-base sm:text-lg font-medium text-muted-foreground max-w-2xl mx-auto leading-relaxed" data-testid="text-community-feedback-subtitle">
            Verified experiences from users who have used our career guidance and verification services.
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground/70 max-w-xl mx-auto leading-relaxed" data-testid="text-community-feedback-disclaimer">
            WorkAbroad Hub provides information, document support, and verification assistance only. We do not recruit, place workers, or guarantee employment or visas.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {stories.slice(0, 6).map((story) => {
            const gradient = countryGradients[story.countryCode] || "from-blue-500 to-indigo-600";
            const anonName = anonymizeDisplayName(story.name);
            const avatarLetters = anonName.replace(/\s+/g, "").slice(0, 2);
            const memberSince = formatMemberSince(story.createdAt);
            return (
              <Card 
                key={story.id} 
                className="group relative overflow-hidden border bg-card hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
                data-testid={`card-feedback-${story.id}`}
              >
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${gradient}`} />
                
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-12 w-12 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-lg shadow-lg`}>
                        {avatarLetters}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-base" data-testid={`text-story-name-${story.id}`}>{anonName}</h3>
                          {story.isVerified && (
                            <CheckCircle className="h-4 w-4 text-emerald-500" />
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {story.location}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-0.5">
                      {Array.from({ length: story.rating }).map((_, i) => (
                        <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{story.jobTitle}</span>
                    <span className="text-muted-foreground">at {story.company}</span>
                  </div>

                  <div className="relative">
                    <Quote className="absolute -top-1 -left-1 h-6 w-6 text-muted-foreground/20" />
                    <p className="text-sm text-muted-foreground leading-relaxed pl-4 italic">
                      "{story.quote}"
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      {story.salaryIncrease}
                    </Badge>
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                      <Clock className="h-3 w-3 mr-1" />
                      {story.timeToJob}
                    </Badge>
                    {memberSince && (
                      <Badge variant="secondary" className="bg-muted text-muted-foreground">
                        <CalendarDays className="h-3 w-3 mr-1" />
                        Since {memberSince}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <p className="text-xs text-muted-foreground/60" data-testid="text-community-feedback-trust">
            All feedback reflects individual user experiences. Results vary depending on qualifications and employer requirements.
          </p>
        </div>
      </div>
    </section>
  );
}
