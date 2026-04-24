import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, MessageCircle, Globe, Users, CheckCircle, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingModal } from "@/components/booking-modal";

interface Advisor {
  id: string;
  name: string;
  title: string;
  specialization: string;
  bio: string;
  experience: number;
  successRate: number;
  rating: number;
  languages: string[];
  whatsappNumber: string;
  isActive: boolean;
}

const specializationGradients: Record<string, string> = {
  "Canada & Australia": "from-red-500 to-blue-600",
  "UK & UAE Healthcare": "from-blue-600 to-green-500",
  "Resume & Interview Prep": "from-purple-500 to-pink-500",
  "UAE & Saudi Arabia": "from-green-500 to-amber-500",
};

export function AdvisorsSection() {
  const { data: advisors, isLoading, isError } = useQuery<Advisor[]>({
    queryKey: ["/api/advisors"],
  });

  const [selectedAdvisor, setSelectedAdvisor] = useState<Advisor | null>(null);

  if (isLoading) {
    return (
      <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-purple-50/50 via-background to-indigo-50/50 dark:from-purple-950/20 dark:via-background dark:to-indigo-950/20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 space-y-4">
            <Skeleton className="h-8 w-48 mx-auto" />
            <Skeleton className="h-12 w-96 mx-auto" />
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-80 rounded-2xl" />
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
          <p className="text-sm text-muted-foreground">Unable to load advisors at this time.</p>
        </div>
      </section>
    );
  }

  if (!advisors || advisors.length === 0) {
    return null;
  }

  return (
    <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-purple-50/50 via-background to-indigo-50/50 dark:from-purple-950/20 dark:via-background dark:to-indigo-950/20">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12 sm:mb-16 space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100/80 dark:bg-purple-900/40 rounded-full mx-auto border border-purple-200/50 dark:border-purple-800/50">
            <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">Expert Team</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            Meet Your{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-indigo-600">
              Career Advisors
            </span>
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Experienced professionals who have helped hundreds of Kenyans land jobs abroad. Book a 1-on-1 WhatsApp session directly with your preferred advisor.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {advisors.map((advisor) => {
            const gradient = specializationGradients[advisor.specialization] || "from-blue-500 to-indigo-600";
            return (
              <Card
                key={advisor.id}
                className="group relative overflow-hidden border bg-card hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col"
                data-testid={`advisor-${advisor.id}`}
              >
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${gradient}`} />

                <CardContent className="p-6 space-y-4 text-center flex flex-col flex-1">
                  <div className={`h-20 w-20 mx-auto rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-2xl shadow-lg`}>
                    {advisor.name.split(" ").map(n => n[0]).join("")}
                  </div>

                  <div>
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <h3 className="font-bold text-lg">{advisor.name}</h3>
                      <CheckCircle className="h-4 w-4 text-blue-500" />
                    </div>
                    <p className="text-sm text-muted-foreground">{advisor.title}</p>
                  </div>

                  <Badge variant="secondary" className={`bg-gradient-to-r ${gradient} text-white border-0`}>
                    <Globe className="h-3 w-3 mr-1" />
                    {advisor.specialization}
                  </Badge>

                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                    {advisor.bio}
                  </p>

                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <div className="text-center p-2 bg-muted/50 rounded-lg">
                      <div className="text-lg font-bold text-foreground">{advisor.experience}+</div>
                      <div className="text-xs text-muted-foreground">Years Exp</div>
                    </div>
                    <div className="text-center p-2 bg-muted/50 rounded-lg">
                      <div className="text-lg font-bold text-emerald-600">{advisor.successRate}%</div>
                      <div className="text-xs text-muted-foreground">Success</div>
                    </div>
                  </div>

                  <div className="flex justify-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-4 w-4 ${i < Math.round(advisor.rating / 10) ? "fill-amber-400 text-amber-400" : "text-muted"}`}
                      />
                    ))}
                  </div>

                  <div className="flex flex-wrap justify-center gap-1">
                    {advisor.languages.map((lang, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {lang}
                      </Badge>
                    ))}
                  </div>

                  {/* Per-advisor book button — pushed to bottom */}
                  <div className="mt-auto pt-2">
                    <Button
                      className={`w-full bg-gradient-to-r ${gradient} hover:opacity-90 text-white border-0 gap-2 shadow-md`}
                      onClick={() => setSelectedAdvisor(advisor)}
                      data-testid={`button-book-advisor-${advisor.id}`}
                    >
                      <Calendar className="h-4 w-4" />
                      Book Session
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            Select any advisor above to choose your date and time. You'll be confirmed via WhatsApp before the session.
          </p>
        </div>
      </div>

      {/* Booking modal — mounts once, swaps advisor */}
      {selectedAdvisor && (
        <BookingModal
          open={!!selectedAdvisor}
          onClose={() => setSelectedAdvisor(null)}
          advisor={{
            id: selectedAdvisor.id,
            name: selectedAdvisor.name,
            specialization: selectedAdvisor.specialization,
            title: selectedAdvisor.title,
          }}
        />
      )}
    </section>
  );
}
