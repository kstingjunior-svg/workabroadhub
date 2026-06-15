/**
 * Pre-departure checklist — appears on /journey/:country when the user has
 * marked their stage as "hired" or "departed".
 *
 * Lets them set a departure date (or clear it), shows a live countdown, and
 * renders the 8+ universal + country-specific steps with checkboxes. Step
 * keys are `pd_*` so they share the same completedSteps array as the rest
 * of the journey.
 *
 * 2026-06 retention #7.
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Plane, Calendar, CheckCircle2, Circle, FileText, Wallet, MapPin, Users,
  Plane as PlaneIcon, Clock, AlertCircle, Loader2,
} from "lucide-react";
import { getPreDepartureSteps, type PreDepartureStep } from "@shared/pre-departure-steps";

const CATEGORY_META: Record<PreDepartureStep["category"], { icon: any; label: string; color: string }> = {
  documents: { icon: FileText, label: "Documents", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  money:     { icon: Wallet,   label: "Money",     color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  logistics: { icon: Plane,    label: "Logistics", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  family:    { icon: Users,    label: "Family",    color: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300" },
  arrival:   { icon: MapPin,   label: "Arrival",   color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300" },
};

interface PreDepartureSectionProps {
  countryCode: string;
  countryName: string;
  countryFlag: string;
  stage: string | null;
  departureDate: string | null;
  /** All completed step keys from the journey row, including `pd_*` ones */
  completedKeys: Set<string>;
}

function daysUntil(iso: string | null): { days: number; label: string } | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.ceil(ms / 86400_000);
  if (days < -1) return { days, label: `Flew ${-days} day${-days === 1 ? "" : "s"} ago` };
  if (days === -1 || days === 0) return { days, label: "Today" };
  if (days === 1) return { days, label: "Tomorrow" };
  if (days < 7) return { days, label: `${days} days away` };
  if (days < 30) return { days, label: `${days} days · ${Math.floor(days / 7)} week${Math.floor(days / 7) === 1 ? "" : "s"} away` };
  return { days, label: `${days} days · ${Math.floor(days / 30)} month${Math.floor(days / 30) === 1 ? "" : "s"} away` };
}

function urgencyColor(days: number | null): string {
  if (days === null) return "text-muted-foreground";
  if (days < 0) return "text-cyan-700 dark:text-cyan-300";
  if (days <= 3) return "text-rose-700 dark:text-rose-300";
  if (days <= 14) return "text-amber-700 dark:text-amber-300";
  return "text-blue-700 dark:text-blue-300";
}

export function PreDepartureSection({
  countryCode,
  countryName,
  countryFlag,
  stage,
  departureDate,
  completedKeys,
}: PreDepartureSectionProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingDate, setEditingDate] = useState(false);
  const [dateInput, setDateInput] = useState(
    departureDate ? new Date(departureDate).toISOString().split("T")[0] : ""
  );

  const steps = useMemo(() => getPreDepartureSteps(countryCode), [countryCode]);
  const completed = steps.filter((s) => completedKeys.has(s.key)).length;
  const total = steps.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const countdown = daysUntil(departureDate);

  const setDate = useMutation({
    mutationFn: async (iso: string | null) => {
      const res = await apiRequest("POST", `/api/journey/${countryCode}/departure-date`, {
        departureDate: iso,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/journey/${countryCode}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/journey"] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/continue"] });
      setEditingDate(false);
      toast({ title: "Departure date saved" });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't save", description: err?.message ?? "Try again", variant: "destructive" });
    },
  });

  const toggleStep = useMutation({
    mutationFn: async ({ stepKey, done }: { stepKey: string; done: boolean }) => {
      const res = await apiRequest("POST", `/api/journey/${countryCode}/steps/${stepKey}`, { done });
      return res.json();
    },
    onMutate: async ({ stepKey, done }) => {
      // Optimistic: invalidate after mutation
      return { stepKey, done };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/journey/${countryCode}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/journey"] });
    },
  });

  function handleSaveDate() {
    if (!dateInput) {
      setDate.mutate(null);
      return;
    }
    const parsed = new Date(dateInput);
    if (Number.isNaN(parsed.getTime())) {
      toast({ title: "Pick a valid date", variant: "destructive" });
      return;
    }
    setDate.mutate(parsed.toISOString());
  }

  // Only render when the user is at "hired" or "departed" stage
  if (stage !== "hired" && stage !== "departed") return null;

  return (
    <div className="space-y-4 mt-6 pt-6 border-t-2 border-dashed">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 text-emerald-700 dark:text-emerald-300 mb-1">
          <PlaneIcon className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">Pre-departure checklist</span>
        </div>
        <h2 className="text-lg font-bold">Final stretch — {countryFlag} {countryName}</h2>
        <p className="text-xs text-muted-foreground">
          You've got the offer. Here's everything to do before you fly.
        </p>
      </div>

      {/* Date + countdown card */}
      <Card className="border-2 border-emerald-200 dark:border-emerald-800">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Calendar className={`h-5 w-5 ${urgencyColor(countdown?.days ?? null)}`} />
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Departure date</div>
                <div className="font-bold text-sm">
                  {departureDate
                    ? new Date(departureDate).toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
                    : "Not set"}
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingDate((v) => !v)}
              data-testid="button-edit-departure-date"
            >
              {departureDate ? "Change" : "Set date"}
            </Button>
          </div>

          {countdown && (
            <div className={`text-2xl font-bold tabular-nums ${urgencyColor(countdown.days)} mb-1`}>
              {countdown.label}
            </div>
          )}

          {editingDate && (
            <div className="mt-3 pt-3 border-t flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={dateInput}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => setDateInput(e.target.value)}
                className="text-sm rounded-md border border-input bg-background px-2.5 py-1.5"
                data-testid="input-departure-date"
              />
              <Button
                size="sm"
                onClick={handleSaveDate}
                disabled={setDate.isPending}
                data-testid="button-save-departure-date"
              >
                {setDate.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                Save
              </Button>
              {departureDate && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setDateInput(""); setDate.mutate(null); }}
                  className="text-rose-700"
                >
                  Clear
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted-foreground">
            {completed} of {total} pre-departure steps done
          </span>
          <span className="font-bold tabular-nums">{pct}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Checklist */}
      <div className="space-y-2">
        {steps.map((step, idx) => {
          const isDone = completedKeys.has(step.key);
          const meta = CATEGORY_META[step.category];
          const Icon = meta.icon;
          return (
            <Card
              key={step.key}
              className={`transition-all ${isDone ? "bg-emerald-50/40 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-800" : ""}`}
              data-testid={`pd-step-${step.key}`}
            >
              <CardContent className="p-3 flex items-start gap-3">
                <button
                  onClick={() => toggleStep.mutate({ stepKey: step.key, done: !isDone })}
                  className="mt-0.5 shrink-0"
                  aria-label={isDone ? "Mark incomplete" : "Mark complete"}
                  data-testid={`pd-toggle-${step.key}`}
                >
                  {isDone
                    ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    : <Circle className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-[10px] font-mono text-muted-foreground">{String(idx + 1).padStart(2, "0")}</span>
                    <h3 className={`font-bold text-sm leading-tight ${isDone ? "line-through text-muted-foreground" : ""}`}>
                      {step.title}
                    </h3>
                    {step.countrySpecific && (
                      <Badge className={`text-[9px] ${meta.color}`}>{countryCode}</Badge>
                    )}
                    {step.daysBefore !== undefined && step.daysBefore > 0 && (
                      <Badge variant="outline" className="text-[9px] gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {step.daysBefore}d before
                      </Badge>
                    )}
                    {step.daysBefore === 0 && (
                      <Badge variant="outline" className="text-[9px] gap-0.5 border-cyan-300 text-cyan-700">
                        <Plane className="h-2.5 w-2.5" />
                        On arrival
                      </Badge>
                    )}
                  </div>
                  <p className={`text-xs leading-relaxed ${isDone ? "text-muted-foreground" : "text-foreground/80"}`}>
                    {step.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Urgency banner if departure is very close */}
      {countdown && countdown.days <= 7 && countdown.days >= 0 && (
        <Card className="border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/30">
          <CardContent className="p-3 text-xs flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <strong className="text-amber-900 dark:text-amber-200">Final week — focus on essentials:</strong>{" "}
              passport + visa printout + contract + cash + meds. Everything else can be replaced.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
