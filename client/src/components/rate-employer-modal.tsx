import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  RadioGroup, RadioGroupItem,
} from "@/components/ui/radio-group";
import { Star, Loader2, CheckCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import {
  ensureEmployerDirectoryEntry,
  submitEmployerRating,
  useUserEmployerRating,
  type EmploymentStatus,
} from "@/lib/firebase-employer-ratings";

interface RateEmployerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  employerName: string;
  country: string;
  onSubmitted?: () => void;
}

const STAR_LABELS = ["", "Poor", "Below Average", "Average", "Good", "Excellent"];

function StarPicker({
  label, value, onChange, testIdPrefix, allowNA, isNA, onToggleNA,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  testIdPrefix: string;
  allowNA?: boolean;
  isNA?: boolean;
  onToggleNA?: () => void;
}) {
  const [hovered, setHovered] = useState(0);
  const displayStar = hovered || value;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</p>
        {allowNA && (
          <button
            type="button"
            onClick={onToggleNA}
            className={`text-xs underline underline-offset-2 ${isNA ? "text-amber-600 font-medium" : "text-muted-foreground"}`}
            data-testid={`${testIdPrefix}-na-toggle`}
          >
            {isNA ? "N/A — no housing provided" : "Mark as not applicable"}
          </button>
        )}
      </div>
      {isNA ? (
        <p className="text-xs text-muted-foreground italic">Skipped — no housing was provided by this employer.</p>
      ) : (
        <>
          <div className="flex gap-1" onMouseLeave={() => setHovered(0)} data-testid={`${testIdPrefix}-selector`}>
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                onMouseEnter={() => setHovered(n)}
                onClick={() => onChange(n)}
                className="p-0.5 transition-transform hover:scale-110"
                data-testid={`${testIdPrefix}-${n}`}
              >
                <Star
                  className={`h-7 w-7 transition-colors ${
                    n <= displayStar
                      ? "text-amber-400 fill-amber-400"
                      : "text-gray-200 dark:text-gray-600 fill-gray-200 dark:fill-gray-600"
                  }`}
                />
              </button>
            ))}
          </div>
          {displayStar > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">{STAR_LABELS[displayStar]}</p>
          )}
        </>
      )}
    </div>
  );
}

export function RateEmployerModal({ open, onOpenChange, slug, employerName, country, onSubmitted }: RateEmployerModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const userId = (user as any)?.id ?? (user as any)?.claims?.sub ?? null;
  const existingRating = useUserEmployerRating(open ? slug : null, userId);

  const [overall, setOverall] = useState(0);
  const [payOnTime, setPayOnTime] = useState(0);
  const [housing, setHousing] = useState(0);
  const [housingNA, setHousingNA] = useState(false);
  const [treatment, setTreatment] = useState(0);
  const [employmentStatus, setEmploymentStatus] = useState<EmploymentStatus>("current");
  const [jobTitle, setJobTitle] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [eligibility, setEligibility] = useState<{ eligible: boolean; daysOld?: number; reason?: string } | null>(null);
  const [loadingEligibility, setLoadingEligibility] = useState(false);

  useEffect(() => {
    if (existingRating) {
      setOverall(existingRating.ratingOverall);
      setPayOnTime(existingRating.ratingPayOnTime);
      if (existingRating.ratingHousing == null) { setHousingNA(true); setHousing(0); }
      else { setHousingNA(false); setHousing(existingRating.ratingHousing); }
      setTreatment(existingRating.ratingTreatment);
      setEmploymentStatus(existingRating.employmentStatus);
      setJobTitle(existingRating.jobTitle ?? "");
      setComment(existingRating.comment ?? "");
    } else {
      setOverall(0); setPayOnTime(0); setHousing(0); setHousingNA(false);
      setTreatment(0); setEmploymentStatus("current"); setJobTitle(""); setComment("");
    }
    setSubmitted(false);
  }, [existingRating, open]);

  useEffect(() => {
    if (!open || !user) return;
    setLoadingEligibility(true);
    apiRequest("GET", "/api/agencies/rating-eligibility")
      .then(r => r.json())
      .then(data => setEligibility(data))
      .catch(() => setEligibility({ eligible: false, reason: "Could not verify account age" }))
      .finally(() => setLoadingEligibility(false));
  }, [open, user]);

  async function handleSubmit() {
    if (!user || !userId) {
      toast({ title: "Please log in to rate an employer", variant: "destructive" });
      return;
    }
    if (!eligibility?.eligible) {
      toast({ title: "Not eligible to rate yet", description: eligibility?.reason ?? "", variant: "destructive" });
      return;
    }
    if (overall === 0 || payOnTime === 0 || treatment === 0 || (!housingNA && housing === 0)) {
      toast({ title: "Please complete every rating", description: "Overall, pay-on-time, treatment, and housing (or mark N/A) are all required.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await ensureEmployerDirectoryEntry(slug, employerName, country);
      await submitEmployerRating(slug, {
        ratingOverall: overall,
        ratingPayOnTime: payOnTime,
        ratingHousing: housingNA ? null : housing,
        ratingTreatment: treatment,
        comment,
        employmentStatus,
        jobTitle,
      }, userId);
      setSubmitted(true);
      onSubmitted?.();
      toast({ title: existingRating ? "Review updated!" : "Review submitted!", description: `Thanks for rating ${employerName}.` });
    } catch {
      toast({ title: "Failed to submit review", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  const isUpdate = !!existingRating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
            Rate This Employer
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          <div>
            <p className="font-semibold text-sm text-gray-800 dark:text-gray-200">{employerName}</p>
            <p className="text-xs text-muted-foreground">{country}</p>
          </div>

          {!user && (
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
              <p className="text-sm text-muted-foreground">Please <strong>log in</strong> to rate this employer.</p>
            </div>
          )}

          {user && loadingEligibility && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking account eligibility…
            </div>
          )}

          {user && !loadingEligibility && eligibility && !eligibility.eligible && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
              <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Account too new to rate</p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">{eligibility.reason}</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  This protects against fake reviews — the same 7-day rule that applies to agency ratings.
                </p>
              </div>
            </div>
          )}

          {submitted && (
            <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-lg">
              <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                  {isUpdate ? "Review updated!" : "Thank you for your review!"}
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">Your feedback helps other job seekers avoid bad employers.</p>
              </div>
            </div>
          )}

          {user && !loadingEligibility && eligibility?.eligible && !submitted && (
            <>
              {isUpdate && (
                <p className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded">
                  You already reviewed this employer. Submitting again will update your review.
                </p>
              )}

              <div className="space-y-2">
                <Label className="text-sm font-medium">Your relationship to this employer <span className="text-red-500">*</span></Label>
                <RadioGroup
                  value={employmentStatus}
                  onValueChange={(v) => setEmploymentStatus(v as EmploymentStatus)}
                  className="flex gap-4"
                  data-testid="radio-employment-status"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="current" id="status-current" />
                    <Label htmlFor="status-current" className="text-sm font-normal">Currently working there</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="former" id="status-former" />
                    <Label htmlFor="status-former" className="text-sm font-normal">Worked there before</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Job title <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  placeholder="e.g. Housekeeper, Construction laborer, Nurse"
                  value={jobTitle}
                  onChange={e => setJobTitle(e.target.value)}
                  maxLength={150}
                  data-testid="input-job-title"
                />
              </div>

              <StarPicker label="Overall experience *" value={overall} onChange={setOverall} testIdPrefix="star-overall" />
              <StarPicker label="Paid on time, as agreed *" value={payOnTime} onChange={setPayOnTime} testIdPrefix="star-pay" />
              <StarPicker
                label="Housing as promised *"
                value={housing}
                onChange={setHousing}
                testIdPrefix="star-housing"
                allowNA
                isNA={housingNA}
                onToggleNA={() => setHousingNA(v => !v)}
              />
              <StarPicker label="Treated with respect *" value={treatment} onChange={setTreatment} testIdPrefix="star-treatment" />

              <div className="space-y-1.5">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Comment <span className="text-muted-foreground font-normal">(optional)</span></p>
                <Textarea
                  placeholder="Share your experience — communication, working conditions, whether they kept their promises..."
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  rows={3}
                  maxLength={500}
                  data-testid="input-review-comment"
                />
                <p className="text-xs text-muted-foreground text-right">{comment.length}/500</p>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="bg-amber-500 hover:bg-amber-600 text-white gap-2"
                  data-testid="button-submit-review"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4 fill-white" />}
                  {isUpdate ? "Update Review" : "Submit Review"}
                </Button>
              </div>
            </>
          )}

          {submitted && (
            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
