import { Trophy, Target, CheckCircle, MapPin, FileText, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProgressCardProps {
  countriesViewed: number;
  totalCountries: number;
  servicesUsed: number;
  profileComplete: boolean;
}

export function ProgressCard({ 
  countriesViewed = 0, 
  totalCountries = 6, 
  servicesUsed = 0,
  profileComplete = false 
}: ProgressCardProps) {
  const progress = Math.round(
    ((countriesViewed > 0 ? 25 : 0) + 
    (servicesUsed > 0 ? 25 : 0) + 
    (profileComplete ? 25 : 0) + 
    (countriesViewed >= 3 ? 25 : (countriesViewed / 3) * 25))
  );

  const milestones = [
    { id: "profile", label: "Complete Profile", done: profileComplete, icon: FileText },
    { id: "explore", label: "Explore a Country", done: countriesViewed > 0, icon: MapPin },
    { id: "service", label: "Try a Service", done: servicesUsed > 0, icon: Star },
    { id: "power", label: "Power Explorer", done: countriesViewed >= 3, icon: Trophy },
  ];

  const completedCount = milestones.filter(m => m.done).length;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-600 via-teal-700 to-slate-800 p-5 shadow-xl">
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />
      
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Trophy className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-white">Your Journey</h3>
              <p className="text-xs text-white/80">{completedCount}/4 milestones</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-white">{progress}%</div>
            <div className="text-xs text-white/80">Complete</div>
          </div>
        </div>

        <div className="relative h-2 bg-white/20 rounded-full overflow-hidden mb-4">
          <div 
            className="absolute inset-y-0 left-0 bg-white rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {milestones.map((milestone) => {
            const Icon = milestone.icon;
            return (
              <div 
                key={milestone.id}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-lg transition-all duration-300",
                  milestone.done 
                    ? "bg-white/20" 
                    : "bg-white/10 opacity-70"
                )}
              >
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center",
                  milestone.done ? "bg-white text-teal-600" : "bg-white/20 text-white"
                )}>
                  {milestone.done ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <Icon className="h-3 w-3" />
                  )}
                </div>
                <span className={cn(
                  "text-xs font-medium",
                  milestone.done ? "text-white" : "text-white/70"
                )}>
                  {milestone.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
