// /direct-hire/employer/dashboard — an employer's listings + a "post a
// job" form. Posting is free; listings go live only after admin review.
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePageSeo } from "@/hooks/use-page-seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Plus, ShieldCheck, Clock, XCircle, ArrowRight } from "lucide-react";

interface EmployerProfile {
  id: string; companyName: string; country: string; verificationStatus: "pending" | "verified" | "rejected"; listingCount: number;
}
interface Listing { id: string; title: string; country: string; status: string; createdAt: string; }

function VerificationBadge({ status }: { status: string }) {
  if (status === "verified") return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 hover:bg-green-100 gap-1"><ShieldCheck className="h-3 w-3" /> Verified</Badge>;
  if (status === "rejected") return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Not approved</Badge>;
  return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Verification pending</Badge>;
}

function ListingStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = { live: "Live", pending_review: "Pending review", closed: "Closed", draft: "Draft", rejected: "Rejected" };
  return <Badge variant={status === "live" ? "default" : "secondary"}>{map[status] ?? status}</Badge>;
}

export default function DirectHireEmployerDashboard() {
  usePageSeo({ title: "Employer Dashboard — Direct Hire Jobs | WorkAbroad Hub", description: "Manage your overseas job listings and applicants." });
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showNewJob, setShowNewJob] = useState(false);

  const { data: employer, isLoading, isError } = useQuery<EmployerProfile>({
    queryKey: ["/api/direct-hire/employer/me"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/direct-hire/employer/me");
      if (!res.ok) throw new Error("not_found");
      return res.json();
    },
    retry: false,
  });

  useEffect(() => {
    if (isError) navigate("/direct-hire/employer/register");
  }, [isError, navigate]);

  const { data: listings } = useQuery<Listing[]>({
    queryKey: ["/api/direct-hire/employer/listings"],
    queryFn: async () => (await apiRequest("GET", "/api/direct-hire/employer/listings")).json(),
    enabled: !!employer,
  });

  const [form, setForm] = useState({ title: "", country: "", city: "", employmentType: "", salaryMin: "", salaryMax: "", salaryCurrency: "USD", requirements: "", responsibilities: "" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const createListing = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/direct-hire/employer/listings", {
      ...form,
      salaryMin: form.salaryMin ? Number(form.salaryMin) : undefined,
      salaryMax: form.salaryMax ? Number(form.salaryMax) : undefined,
    })).json(),
    onSuccess: () => {
      toast({ title: "Listing submitted", description: "It'll appear once approved." });
      setShowNewJob(false);
      setForm({ title: "", country: "", city: "", employmentType: "", salaryMin: "", salaryMax: "", salaryCurrency: "USD", requirements: "", responsibilities: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/direct-hire/employer/listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/direct-hire/employer/me"] });
    },
    onError: () => toast({ title: "Couldn't create listing", variant: "destructive" }),
  });

  if (isLoading || !employer) {
    return <div className="max-w-2xl mx-auto px-4 py-8 space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-32 w-full rounded-2xl" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" data-testid="heading-employer-dashboard">
            <Building2 className="h-5 w-5 text-primary" /> {employer.companyName}
          </h1>
          <p className="text-sm text-muted-foreground">{employer.country} · {employer.listingCount} listing{employer.listingCount === 1 ? "" : "s"}</p>
        </div>
        <VerificationBadge status={employer.verificationStatus} />
      </div>

      {employer.verificationStatus === "pending" && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
          <CardContent className="py-3 text-sm text-amber-800 dark:text-amber-300">
            Your employer profile is awaiting review. You can prepare listings now — they'll go live once both your profile and the listing are approved.
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Your listings</h2>
        <Button size="sm" onClick={() => setShowNewJob((v) => !v)} className="gap-1.5" data-testid="button-toggle-new-job">
          <Plus className="h-4 w-4" /> Post a job
        </Button>
      </div>

      {showNewJob && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">New listing — free to post</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Job title *</Label><Input value={form.title} onChange={set("title")} data-testid="input-job-title" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Country *</Label><Input value={form.country} onChange={set("country")} data-testid="input-job-country" /></div>
              <div><Label>City</Label><Input value={form.city} onChange={set("city")} data-testid="input-job-city" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Employment type</Label><Input value={form.employmentType} onChange={set("employmentType")} placeholder="full_time" data-testid="input-employment-type" /></div>
              <div><Label>Salary min</Label><Input value={form.salaryMin} onChange={set("salaryMin")} type="number" data-testid="input-salary-min" /></div>
              <div><Label>Salary max</Label><Input value={form.salaryMax} onChange={set("salaryMax")} type="number" data-testid="input-salary-max" /></div>
            </div>
            <div><Label>Requirements</Label><Textarea value={form.requirements} onChange={set("requirements")} rows={3} data-testid="textarea-requirements" /></div>
            <div><Label>Responsibilities</Label><Textarea value={form.responsibilities} onChange={set("responsibilities")} rows={3} data-testid="textarea-responsibilities" /></div>
            <Button
              disabled={!form.title || !form.country || createListing.isPending}
              onClick={() => createListing.mutate()}
              data-testid="button-submit-listing"
            >
              {createListing.isPending ? "Submitting…" : "Submit for review"}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {(!listings || listings.length === 0) && (
          <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No listings yet.</CardContent></Card>
        )}
        {listings?.map((l) => (
          <Link key={l.id} href={`/direct-hire/employer/listings/${l.id}`}>
            <Card className="cursor-pointer hover:shadow-md transition-shadow" data-testid={`card-employer-listing-${l.id}`}>
              <CardContent className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{l.title}</p>
                  <p className="text-xs text-muted-foreground">{l.country}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <ListingStatusBadge status={l.status} />
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
