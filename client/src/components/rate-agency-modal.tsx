import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, Loader2, CheckCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { submitAgencyRating, useUserAgencyRating } from "@/lib/firebase-agency-ratings";
import { apiRequest } from "@/lib/queryClient";

interface RateAgencyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  licenseNumber: string;
  agencyName: string;
}

const STAR_LABELS = ["", "Poor", "Below Average", "Average", "Good", "Excellent"];

export function RateAgencyModal({ open, onOpenChange, licenseNumber, agencyName }: RateAgencyModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const userId = (user as any)?.id ?? (user as any)?.claims?.sub ?? null;
  const existingRating = useUserAgencyRating(open ? licenseNumber : null, userId);

  const [hovered, setHovered] = useState(0);
  const [selected, setSelected] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [eligibility, setEligibility] = useState<{ eligible: boolean; daysOld?: number; reason?: string } | null>(null);
  const [loadingEligibility, setLoadingEligibility] = useState(false);

  // Pre-fill from existing rating
  useEffect(() => {
    if (existingRating) {
      setSelected(existingRating.rating);
      setComment(existingRating.comment ?? "");
    } else {
      setSelected(0);
      setComment("");
    }
    setSubmitted(false);
  }, [existingRating, open]);

  // Check eligibility when modal opens
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
      toast({ title: "Please log in to rate agencies", variant: "destructive" });
      return;
    }
    if (!eligibility?.eligible) {
      toast({ title: "Not eligible to rate yet", description: eligibility?.reason ?? "", variant: "destructive" });
      return;
    }
    if (selected === 0) {
      toast({ title: "Please select a star rating", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await submitAgencyRating(licenseNumber, selected, comment, userId, agencyName);
      setSubmitted(true);
      toast({ title: existingRating ? "Rating updated!" : "Rating submitted!", description: `You gave ${agencyName} ${selected} star${selected > 1 ? "s" : ""}.` });
    } catch {
      toast({ title: "Failed to submit rating", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  const displayStar = hovered || selected;
  const isUpdate = !!existingRating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
            Rate This Agency
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          <div>
            <p className="font-semibold text-sm text-gray-800 dark:text-gray-200">{agencyName}</p>
            <p className="text-xs text-muted-foreground font-mono">{licenseNumber}</p>
          </div>

          {/* Not logged in */}
          {!user && (
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
              <p className="text-sm text-muted-foreground">Please <strong>log in</strong> to rate this agency.</p>
            </div>
          )}

          {/* Eligibility check loading */}
          {user && loadingEligibility && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking account eligibility…
            </div>
          )}

          {/* Not eligible */}
          {user && !loadingEligibility && eligibility && !eligibility.eligible && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
              <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Account too new to rate</p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">{eligibility.reason}</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  This protects against fake reviews. Come back in {7 - (eligibility.daysOld ?? 0)} more day{(7 - (eligibility.daysOld ?? 0)) !== 1 ? "s" : ""}.
                </p>
              </div>
            </div>
          )}

          {/* Submitted confirmation */}
          {submitted && (
            <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-lg">
              <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                  {isUpdate ? "Rating updated!" : "Thank you for your rating!"}
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">Your feedback helps other job seekers stay safe.</p>
              </div>
            </div>
          )}

          {/* Rating form */}
          {user && !loadingEligibility && eligibility?.eligible && !submitted && (
            <>
              {isUpdate && (
                <p className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded">
                  You already rated this agency. Submitting again will update your rating.
                </p>
              )}

              {/* Stars */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Your Rating <span className="text-red-500">*</span></p>
                <div
                  className="flex gap-1.5"
                  onMouseLeave={() => setHovered(0)}
                  data-testid="star-selector"
                >
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      type="button"
                      onMouseEnter={() => setHovered(n)}
                      onClick={() => setSelected(n)}
                      className="p-0.5 transition-transform hover:scale-110"
                      data-testid={`star-${n}`}
                    >
                      <Star
                        className={`h-9 w-9 transition-colors ${
                          n <= displayStar
                            ? "text-amber-400 fill-amber-400"
                            : "text-gray-200 dark:text-gray-600 fill-gray-200 dark:fill-gray-600"
                        }`}
                      />
                    </button>
                  ))}
                </div>
                {displayStar > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                    {STAR_LABELS[displayStar]}
                  </p>
                )}
              </div>

              {/* Comment */}
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Comment <span className="text-muted-foreground font-normal">(optional)</span></p>
                <Textarea
                  placeholder="Share your experience with this agency — processing time, communication, transparency..."
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  rows={3}
                  maxLength={500}
                  data-testid="input-rating-comment"
                />
                <p className="text-xs text-muted-foreground text-right">{comment.length}/500</p>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || selected === 0}
                  className="bg-amber-500 hover:bg-amber-600 text-white gap-2"
                  data-testid="button-submit-rating"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4 fill-white" />}
                  {isUpdate ? "Update Rating" : "Submit Rating"}
                </Button>
              </div>
            </>
          )}

          {/* After submission */}
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
