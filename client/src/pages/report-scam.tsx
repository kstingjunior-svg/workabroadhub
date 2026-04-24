import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  AlertTriangle,
  ArrowLeft,
  Upload,
  Search,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  X,
  Loader2,
  Calendar,
  MapPin,
  DollarSign,
  Phone,
  Eye,
  Flag,
  ShieldAlert,
} from "lucide-react";

const COUNTRIES = [
  "Kenya", "Uganda", "Tanzania", "Nigeria", "Ghana", "South Africa",
  "UAE", "Saudi Arabia", "Qatar", "Kuwait", "Bahrain", "Oman",
  "UK", "USA", "Canada", "Australia", "Germany", "Malaysia", "Singapore",
  "Other",
];

interface ScamReport {
  id: string;
  agencyName: string;
  country: string | null;
  description: string;
  amountLost: number | null;
  contactInfo: string | null;
  evidenceImages: string[];
  createdAt: string;
}

interface ReportsResponse {
  reports: ScamReport[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export default function ReportScamPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [agencyName, setAgencyName] = useState("");
  const [country, setCountry] = useState("");
  const [description, setDescription] = useState("");
  const [amountLost, setAmountLost] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [reporterEmail, setReporterEmail] = useState(user ? "" : "");
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Blacklist filter state
  const [search, setSearch] = useState("");
  const [filterCountry, setFilterCountry] = useState("all");
  const [page, setPage] = useState(1);

  // Lightbox state
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const { data: reportsData, isLoading: reportsLoading } = useQuery<ReportsResponse>({
    queryKey: ["/api/scam-reports", { search, country: filterCountry === "all" ? "" : filterCountry, page }],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "10" });
      if (search.trim()) params.set("search", search.trim());
      if (filterCountry && filterCountry !== "all") params.set("country", filterCountry);
      const res = await fetch(`/api/scam-reports?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const validFiles = Array.from(files).filter(f => {
      if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(f.type)) {
        toast({ title: "Invalid file type", description: "Only JPG, PNG, and WebP images are allowed.", variant: "destructive" });
        return false;
      }
      if (f.size > 5 * 1024 * 1024) {
        toast({ title: "File too large", description: `${f.name} exceeds 5MB.`, variant: "destructive" });
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;
    if (uploadedImages.length + validFiles.length > 5) {
      toast({ title: "Too many files", description: "Maximum 5 images allowed.", variant: "destructive" });
      return;
    }

    setUploadingFiles(true);
    try {
      const formData = new FormData();
      validFiles.forEach(f => formData.append("files", f));

      // Fetch CSRF token
      const csrfRes = await fetch("/api/csrf-token", { credentials: "include" });
      const { csrfToken } = await csrfRes.json();

      const res = await fetch("/api/scam-reports/upload-evidence", {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken },
        credentials: "include",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
      const { urls } = await res.json();
      setUploadedImages(prev => [...prev, ...urls]);
      toast({ title: "Images uploaded", description: `${urls.length} image(s) attached to your report.` });
    } catch {
      toast({ title: "Upload failed", description: "Could not upload images. Please try again.", variant: "destructive" });
    } finally {
      setUploadingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/scam-reports", {
        agencyName: agencyName.trim(),
        country: country || null,
        description: description.trim(),
        amountLost: amountLost ? Number(amountLost) : null,
        contactInfo: contactInfo.trim() || null,
        evidenceImages: uploadedImages,
        reporterEmail: reporterEmail.trim() || null,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Submission failed");
      return data;
    },
    onSuccess: () => {
      setSubmitted(true);
      setAgencyName("");
      setCountry("");
      setDescription("");
      setAmountLost("");
      setContactInfo("");
      setReporterEmail("");
      setUploadedImages([]);
      queryClient.invalidateQueries({ queryKey: ["/api/scam-reports"] });
    },
    onError: (error: any) => {
      toast({ title: "Submission failed", description: error.message || "Could not submit report. Please try again.", variant: "destructive" });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agencyName.trim()) { toast({ title: "Required", description: "Agency name is required.", variant: "destructive" }); return; }
    if (!description.trim() || description.trim().length < 20) { toast({ title: "Required", description: "Description must be at least 20 characters.", variant: "destructive" }); return; }
    submitMutation.mutate();
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <Link href="/dashboard">
          <button className="p-2 hover:bg-muted rounded-lg transition-colors" aria-label="Go back">
            <ArrowLeft className="h-5 w-5" />
          </button>
        </Link>
        <div>
          <h1 className="font-bold text-base">Report a Scam Agency</h1>
          <p className="text-xs text-muted-foreground">Help protect the community</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">

        {/* Warning banner */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Reports are user-submitted</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">All reports go through admin review before appearing publicly. These reports are for informational purposes only — always verify before making decisions.</p>
          </div>
        </div>

        {/* Report Form */}
        {submitted ? (
          <Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
            <CardContent className="pt-6 text-center space-y-3">
              <div className="w-14 h-14 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto">
                <ShieldAlert className="h-7 w-7 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="font-bold text-lg text-green-800 dark:text-green-300">Report Submitted!</h2>
              <p className="text-sm text-green-700 dark:text-green-400">Thank you for keeping the community safe. Your report will be reviewed by our team before it is published.</p>
              <Button variant="outline" size="sm" onClick={() => setSubmitted(false)} data-testid="btn-submit-another">
                Submit Another Report
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Flag className="h-5 w-5 text-red-500" />
                Report a Scam Agency
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="agency-name">Agency Name <span className="text-red-500">*</span></Label>
                  <Input
                    id="agency-name"
                    placeholder="e.g. XYZ Recruitment Ltd"
                    value={agencyName}
                    onChange={e => setAgencyName(e.target.value)}
                    data-testid="input-agency-name"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="country">Country (Optional)</Label>
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger id="country" data-testid="select-country">
                      <SelectValue placeholder="Select country..." />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="description">Description of Scam <span className="text-red-500">*</span></Label>
                  <Textarea
                    id="description"
                    placeholder="Describe what happened in detail. How did they scam you? What promises did they make? Minimum 20 characters."
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={4}
                    data-testid="textarea-description"
                    required
                  />
                  <p className="text-xs text-muted-foreground">{description.length}/5000 characters (min. 20)</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="amount-lost">Amount Lost (KES, Optional)</Label>
                    <Input
                      id="amount-lost"
                      type="number"
                      placeholder="e.g. 50000"
                      value={amountLost}
                      onChange={e => setAmountLost(e.target.value)}
                      min="0"
                      data-testid="input-amount-lost"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-info">Agency Contact (Optional)</Label>
                    <Input
                      id="contact-info"
                      placeholder="Phone / Email / Website"
                      value={contactInfo}
                      onChange={e => setContactInfo(e.target.value)}
                      data-testid="input-contact-info"
                    />
                  </div>
                </div>

                {!user && (
                  <div className="space-y-1.5">
                    <Label htmlFor="reporter-email">Your Email (Optional)</Label>
                    <Input
                      id="reporter-email"
                      type="email"
                      placeholder="For follow-up if needed"
                      value={reporterEmail}
                      onChange={e => setReporterEmail(e.target.value)}
                      data-testid="input-reporter-email"
                    />
                  </div>
                )}

                {/* Evidence Upload */}
                <div className="space-y-2">
                  <Label>Evidence Screenshots (Optional)</Label>
                  <div
                    className="border-2 border-dashed border-border rounded-xl p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="upload-evidence-area"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      multiple
                      className="hidden"
                      onChange={handleFileUpload}
                      data-testid="input-file-upload"
                    />
                    {uploadingFiles ? (
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Uploading...
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Upload className="h-6 w-6 text-muted-foreground mx-auto" />
                        <p className="text-sm text-muted-foreground">Click to upload screenshots, receipts or chat photos</p>
                        <p className="text-xs text-muted-foreground">JPG, PNG, WebP • Max 5MB per file • Up to 5 images</p>
                      </div>
                    )}
                  </div>

                  {uploadedImages.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {uploadedImages.map((url, i) => (
                        <div key={i} className="relative group">
                          <img
                            src={url}
                            alt={`Evidence ${i + 1}`}
                            className="w-16 h-16 object-cover rounded-lg border border-border cursor-pointer"
                            onClick={() => setLightboxImage(url)}
                            loading="lazy"
                          />
                          <button
                            type="button"
                            onClick={() => setUploadedImages(prev => prev.filter((_, j) => j !== i))}
                            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            data-testid={`btn-remove-image-${i}`}
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitMutation.isPending || !agencyName.trim() || description.trim().length < 20}
                  data-testid="btn-submit-report"
                >
                  {submitMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</>
                  ) : (
                    <><Flag className="h-4 w-4 mr-2" /> Submit Report</>
                  )}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  Reports are moderated before appearing publicly. False reports may result in account suspension.
                </p>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Blacklist Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-500" />
            <h2 className="font-bold text-lg">⚠️ Reported Scam Agencies</h2>
          </div>
          <p className="text-sm text-muted-foreground">The following agencies have been reported by community members and verified by our team.</p>

          {/* Search & Filter */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by agency name..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
                data-testid="input-search-blacklist"
              />
            </div>
            <Select value={filterCountry} onValueChange={v => { setFilterCountry(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-44" data-testid="select-filter-country">
                <SelectValue placeholder="All Countries" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Countries</SelectItem>
                {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Report Cards */}
          {reportsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Card key={i}>
                  <CardContent className="pt-4 space-y-2">
                    <Skeleton className="h-5 w-1/2" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !reportsData?.reports.length ? (
            <Card>
              <CardContent className="pt-8 pb-8 text-center">
                <ShieldAlert className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No verified reports found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {search || (filterCountry && filterCountry !== "all") ? "Try different search terms." : "Be the first to report a scam agency."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {reportsData.reports.map(report => (
                <ReportCard key={report.id} report={report} onImageClick={setLightboxImage} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {reportsData && reportsData.pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * 10 + 1}–{Math.min(page * 10, reportsData.total)} of {reportsData.total} reports
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  data-testid="btn-prev-page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 py-1 text-sm border rounded-md">{page} / {reportsData.pages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= reportsData.pages}
                  onClick={() => setPage(p => p + 1)}
                  data-testid="btn-next-page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      <Dialog open={!!lightboxImage} onOpenChange={open => !open && setLightboxImage(null)}>
        <DialogContent className="max-w-2xl p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>Evidence Image</DialogTitle>
          </DialogHeader>
          {lightboxImage && (
            <img src={lightboxImage} alt="Evidence" className="w-full rounded-lg object-contain max-h-[80vh]" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReportCard({ report, onImageClick }: { report: ScamReport; onImageClick: (url: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border-red-100 dark:border-red-900/30 overflow-hidden">
      <CardContent className="pt-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-base flex items-center gap-2" data-testid={`text-agency-name-${report.id}`}>
              <ShieldAlert className="h-4 w-4 text-red-500 shrink-0" />
              {report.agencyName}
            </h3>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {report.country && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <MapPin className="h-3 w-3" />
                  {report.country}
                </Badge>
              )}
              {report.amountLost && (
                <Badge variant="destructive" className="text-xs gap-1">
                  <DollarSign className="h-3 w-3" />
                  KES {report.amountLost.toLocaleString()} lost
                </Badge>
              )}
              <Badge variant="outline" className="text-xs gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(report.createdAt).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" })}
              </Badge>
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <p className={`text-sm text-muted-foreground leading-relaxed ${!expanded && "line-clamp-3"}`}>
            {report.description}
          </p>
          {report.description.length > 180 && (
            <button
              className="text-xs text-primary hover:underline mt-1"
              onClick={() => setExpanded(e => !e)}
              data-testid={`btn-expand-${report.id}`}
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          )}
        </div>

        {/* Contact info */}
        {report.contactInfo && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Phone className="h-3 w-3" />
            <span>Contact: {report.contactInfo}</span>
          </div>
        )}

        {/* Evidence images */}
        {report.evidenceImages && report.evidenceImages.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <ImageIcon className="h-3 w-3" />
              Evidence ({report.evidenceImages.length} image{report.evidenceImages.length > 1 ? "s" : ""})
            </p>
            <div className="flex flex-wrap gap-2">
              {report.evidenceImages.map((url, i) => (
                <div
                  key={i}
                  className="relative group cursor-pointer"
                  onClick={() => onImageClick(url)}
                  data-testid={`img-evidence-${report.id}-${i}`}
                >
                  <img
                    src={url}
                    alt={`Evidence ${i + 1}`}
                    className="w-16 h-16 object-cover rounded-lg border border-border hover:opacity-90 transition-opacity"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg transition-colors flex items-center justify-center">
                    <Eye className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
