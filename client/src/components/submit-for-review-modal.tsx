import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Star, Loader2, CheckCircle2, MessageSquare, Building2, Globe } from "lucide-react";
import {
  submitForReview,
  type ContentType,
  type TestimonialContent,
  type AgencyReviewContent,
  type PortalSubmissionContent,
} from "@/lib/firebase-moderation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: ContentType;
  defaultAgencyId?: string;
  defaultAgencyName?: string;
}

// ─── Star rating input ────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1" data-testid="star-rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          data-testid={`star-${n}`}
          className="focus:outline-none"
        >
          <Star
            className={`h-6 w-6 transition-colors ${
              n <= (hovered || value)
                ? "fill-yellow-400 text-yellow-400"
                : "fill-none text-muted-foreground"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

// ─── Type meta ────────────────────────────────────────────────────────────────

const TYPE_META: Record<ContentType, { label: string; icon: typeof MessageSquare; description: string }> = {
  testimonial: {
    label: "Testimonial",
    icon: MessageSquare,
    description: "Share your job-seeking success story with the community.",
  },
  agency_review: {
    label: "Agency Review",
    icon: Building2,
    description: "Rate and review a recruitment agency you've worked with.",
  },
  portal_submission: {
    label: "Job Portal",
    icon: Globe,
    description: "Suggest a job portal or website we should list.",
  },
};

const PORTAL_CATEGORIES = [
  "General", "Tech / IT", "Healthcare", "Construction",
  "Hospitality", "Teaching", "Finance", "Domestic Work", "Other",
];

const COUNTRIES = [
  "Kenya", "Uganda", "Tanzania", "Ethiopia", "Nigeria",
  "USA", "Canada", "UAE", "UK", "Australia", "Germany", "Qatar", "Saudi Arabia", "Other",
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function SubmitForReviewModal({
  open,
  onOpenChange,
  defaultType = "testimonial",
  defaultAgencyId = "",
  defaultAgencyName = "",
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [contentType, setContentType] = useState<ContentType>(defaultType);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Testimonial fields
  const [tName, setTName]       = useState("");
  const [tRole, setTRole]       = useState("");
  const [tCountry, setTCountry] = useState("Kenya");
  const [tRating, setTRating]   = useState(5);
  const [tText, setTText]       = useState("");

  // Agency review fields
  const [aAgencyId, setAAgencyId]     = useState(defaultAgencyId);
  const [aAgencyName, setAAgencyName] = useState(defaultAgencyName);
  const [aRating, setARating]         = useState(5);
  const [aText, setAText]             = useState("");

  // Portal submission fields
  const [pName, setPName]         = useState("");
  const [pUrl, setPUrl]           = useState("");
  const [pCountry, setPCountry]   = useState("Any");
  const [pCategory, setPCategory] = useState("General");
  const [pDesc, setPDesc]         = useState("");

  const reset = () => {
    setSubmitted(false);
    setTName(""); setTRole(""); setTCountry("Kenya"); setTRating(5); setTText("");
    setAAgencyId(defaultAgencyId); setAAgencyName(defaultAgencyName); setARating(5); setAText("");
    setPName(""); setPUrl(""); setPCountry("Any"); setPCategory("General"); setPDesc("");
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const isValid = (): boolean => {
    if (!user?.id) return false;
    if (contentType === "testimonial") return !!tName.trim() && !!tText.trim() && tRating > 0;
    if (contentType === "agency_review") return !!aAgencyName.trim() && !!aText.trim() && aRating > 0;
    if (contentType === "portal_submission") return !!pName.trim() && !!pUrl.trim() && !!pDesc.trim();
    return false;
  };

  const handleSubmit = async () => {
    if (!user?.id) {
      toast({ title: "Sign in required", description: "Please sign in to submit.", variant: "destructive" });
      return;
    }
    if (!isValid()) return;
    setSubmitting(true);
    try {
      let content: TestimonialContent | AgencyReviewContent | PortalSubmissionContent;
      if (contentType === "testimonial") {
        content = { name: tName.trim(), role: tRole.trim(), country: tCountry, rating: tRating, text: tText.trim() };
      } else if (contentType === "agency_review") {
        content = { agencyId: aAgencyId || "unknown", agencyName: aAgencyName.trim(), rating: aRating, text: aText.trim() };
      } else {
        const url = pUrl.trim().startsWith("http") ? pUrl.trim() : `https://${pUrl.trim()}`;
        content = { portalName: pName.trim(), url, country: pCountry, description: pDesc.trim(), category: pCategory };
      }
      await submitForReview(contentType, content, user.id);
      setSubmitted(true);
    } catch {
      toast({ title: "Submission failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const meta = TYPE_META[contentType];
  const Icon = meta.icon;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {submitted ? (
          <div className="py-8 text-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">Submitted for Review</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your {meta.label.toLowerCase()} has been sent to our moderation team.
                It will appear publicly once approved — usually within 24 hours.
              </p>
            </div>
            <div className="flex gap-3 justify-center pt-2">
              <Button variant="outline" onClick={() => { reset(); setContentType(defaultType); }} data-testid="button-submit-another">
                Submit Another
              </Button>
              <Button onClick={() => handleClose(false)} data-testid="button-close-success">
                Done
              </Button>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-primary" />
                Share with the Community
              </DialogTitle>
              <DialogDescription>
                Submissions are reviewed before going public. Spam and fake reviews are removed.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 pt-2">
              {/* Content type selector */}
              <div className="flex gap-2 flex-wrap" data-testid="content-type-selector">
                {(Object.keys(TYPE_META) as ContentType[]).map((t) => {
                  const M = TYPE_META[t];
                  const Ic = M.icon;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setContentType(t)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                        contentType === t
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:bg-muted"
                      }`}
                      data-testid={`type-${t}`}
                    >
                      <Ic className="h-3.5 w-3.5" />
                      {M.label}
                    </button>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground -mt-2">{meta.description}</p>

              {/* ── Testimonial form ── */}
              {contentType === "testimonial" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Your Name *</Label>
                      <Input value={tName} onChange={(e) => setTName(e.target.value)} placeholder="Jane Mwangi" className="h-9 text-sm" data-testid="input-name" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Your Role / Job</Label>
                      <Input value={tRole} onChange={(e) => setTRole(e.target.value)} placeholder="Nurse in Dubai" className="h-9 text-sm" data-testid="input-role" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Country You Moved To</Label>
                    <Select value={tCountry} onValueChange={setTCountry}>
                      <SelectTrigger className="h-9 text-sm" data-testid="select-country"><SelectValue /></SelectTrigger>
                      <SelectContent>{COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Your Rating *</Label>
                    <StarRating value={tRating} onChange={setTRating} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Your Story *</Label>
                    <Textarea value={tText} onChange={(e) => setTText(e.target.value)} placeholder="Share how WorkAbroad Hub helped you find an overseas job…" rows={4} className="text-sm resize-none" maxLength={600} data-testid="textarea-testimonial" />
                    <p className="text-[11px] text-muted-foreground text-right">{tText.length}/600</p>
                  </div>
                </div>
              )}

              {/* ── Agency review form ── */}
              {contentType === "agency_review" && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Agency Name *</Label>
                    <Input
                      value={aAgencyName}
                      onChange={(e) => setAAgencyName(e.target.value)}
                      placeholder="e.g. Excel Global Manpower"
                      className="h-9 text-sm"
                      data-testid="input-agency-name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Your Rating *</Label>
                    <StarRating value={aRating} onChange={setARating} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Your Review *</Label>
                    <Textarea value={aText} onChange={(e) => setAText(e.target.value)} placeholder="Describe your experience with this agency — was it positive or negative?" rows={4} className="text-sm resize-none" maxLength={600} data-testid="textarea-agency-review" />
                    <p className="text-[11px] text-muted-foreground text-right">{aText.length}/600</p>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Reviews are verified before publishing. Do not include personal contact details.
                    </p>
                  </div>
                </div>
              )}

              {/* ── Portal submission form ── */}
              {contentType === "portal_submission" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Portal / Site Name *</Label>
                      <Input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="e.g. WorkerVisa.com" className="h-9 text-sm" data-testid="input-portal-name" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Website URL *</Label>
                      <Input value={pUrl} onChange={(e) => setPUrl(e.target.value)} placeholder="workerVisa.com" className="h-9 text-sm" data-testid="input-portal-url" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Country / Region</Label>
                      <Select value={pCountry} onValueChange={setPCountry}>
                        <SelectTrigger className="h-9 text-sm" data-testid="select-portal-country"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Any">Any / Global</SelectItem>
                          {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Category</Label>
                      <Select value={pCategory} onValueChange={setPCategory}>
                        <SelectTrigger className="h-9 text-sm" data-testid="select-portal-category"><SelectValue /></SelectTrigger>
                        <SelectContent>{PORTAL_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Why should we list it? *</Label>
                    <Textarea value={pDesc} onChange={(e) => setPDesc(e.target.value)} placeholder="Describe what makes this portal useful for Kenyan job seekers…" rows={3} className="text-sm resize-none" maxLength={400} data-testid="textarea-portal-desc" />
                    <p className="text-[11px] text-muted-foreground text-right">{pDesc.length}/400</p>
                  </div>
                </div>
              )}

              {!user?.id && (
                <p className="text-xs text-destructive font-medium">You must be signed in to submit.</p>
              )}

              <div className="flex gap-3 pt-1">
                <Button variant="outline" onClick={() => handleClose(false)} className="flex-1" data-testid="button-cancel">Cancel</Button>
                <Button onClick={handleSubmit} disabled={submitting || !isValid()} className="flex-1" data-testid="button-submit">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Submit for Review
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
