// /direct-hire/my-applications — worker's own Direct Hire applications,
// including the two-sided "confirmed start" check-in and dispute filing.
import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePageSeo } from "@/hooks/use-page-seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, Clock, XCircle, AlertTriangle, Briefcase } from "lucide-react";

interface MyApplication {
  id: string;
  status: string;
  listingTitle: string;
  listingCountry: string | null;
  employerName: string | null;
  confirmation: {
    status: string;
    employerConfirmed: boolean;
    workerConfirmed: boolean;
    startDate: string | null;
    workLocation: string | null;
  } | null;
}

const STATUS_LABEL: Record<string, string> = {
  applied: "Applied", shortlisted: "Shortlisted", interview: "Interview stage",
  offered: "Offer extended", confirmed_start: "Placement confirmed",
  withdrawn: "Withdrawn", rejected: "Not selected",
};

function StatusBadge({ status }: { status: string }) {
  const positive = ["offered", "confirmed_start", "shortlisted", "interview"].includes(status);
  const negative = ["rejected", "withdrawn"].includes(status);
  return (
    <Badge variant={negative ? "secondary" : positive ? "default" : "outline"} data-testid={`badge-status-${status}`}>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

function DisputeForm({ applicationId, onDone }: { applicationId: string; onDone: () => void }) {
  const { toast } = useToast();
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/direct-hire/applications/${applicationId}/dispute`, { category, description });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Dispute filed", description: "Our team will review and follow up." });
      onDone();
    },
    onError: () => toast({ title: "Couldn't file dispute", variant: "destructive" }),
  });

  return (
    <div className="space-y-2 pt-2 border-t mt-2">
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger data-testid="select-dispute-category"><SelectValue placeholder="What went wrong?" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="no_show">Employer/worker no-show</SelectItem>
          <SelectItem value="pay_mismatch">Pay doesn't match listing</SelectItem>
          <SelectItem value="conditions_mismatch">Conditions don't match listing</SelectItem>
          <SelectItem value="other">Other</SelectItem>
        </SelectContent>
      </Select>
      <Textarea placeholder="Describe what happened" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} data-testid="textarea-dispute-description" />
      <Button size="sm" variant="destructive" disabled={!category || !description || mutation.isPending} onClick={() => mutation.mutate()} data-testid="button-submit-dispute">
        {mutation.isPending ? "Filing…" : "File dispute"}
      </Button>
    </div>
  );
}

export default function MyDirectHireApplications() {
  usePageSeo({ title: "My Applications — Direct Hire Jobs | WorkAbroad Hub", description: "Track your Direct Hire job applications and confirm your placement." });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [disputeOpenFor, setDisputeOpenFor] = useState<string | null>(null);

  const { data: applications, isLoading } = useQuery<MyApplication[]>({
    queryKey: ["/api/direct-hire/my-applications"],
    queryFn: async () => (await apiRequest("GET", "/api/direct-hire/my-applications")).json(),
  });

  const confirmMutation = useMutation({
    mutationFn: async (applicationId: string) => (await apiRequest("POST", `/api/direct-hire/applications/${applicationId}/confirm-start`)).json(),
    onSuccess: () => {
      toast({ title: "Thanks for confirming!" });
      queryClient.invalidateQueries({ queryKey: ["/api/direct-hire/my-applications"] });
    },
    onError: () => toast({ title: "Couldn't confirm", variant: "destructive" }),
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2" data-testid="heading-my-applications">
          <Briefcase className="h-5 w-5 text-primary" /> My Direct Hire Applications
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Free to apply. No fee is ever charged to you.</p>
      </div>

      {isLoading && <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>}

      {!isLoading && (!applications || applications.length === 0) && (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          No applications yet. <Link href="/direct-hire/jobs" className="text-primary hover:underline">Browse open listings</Link>.
        </CardContent></Card>
      )}

      <div className="space-y-3">
        {applications?.map((a) => (
          <Card key={a.id} data-testid={`card-application-${a.id}`}>
            <CardHeader className="pb-2 flex flex-row items-start justify-between">
              <div>
                <CardTitle className="text-base">{a.listingTitle}</CardTitle>
                <p className="text-sm text-muted-foreground">{a.employerName} {a.listingCountry ? `· ${a.listingCountry}` : ""}</p>
              </div>
              <StatusBadge status={a.status} />
            </CardHeader>
            <CardContent className="text-sm space-y-3">
              {a.confirmation && a.confirmation.status !== "confirmed" && (
                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                  <p className="font-medium flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Confirm your placement start</p>
                  {a.confirmation.startDate && <p className="text-muted-foreground text-xs">Employer-entered start date: {a.confirmation.startDate}{a.confirmation.workLocation ? ` · ${a.confirmation.workLocation}` : ""}</p>}
                  <div className="flex items-center gap-2 text-xs">
                    <span className={a.confirmation.employerConfirmed ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}>
                      {a.confirmation.employerConfirmed ? "✓" : "○"} Employer confirmed
                    </span>
                    <span className={a.confirmation.workerConfirmed ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}>
                      {a.confirmation.workerConfirmed ? "✓" : "○"} You confirmed
                    </span>
                  </div>
                  {!a.confirmation.workerConfirmed && (
                    <Button size="sm" onClick={() => confirmMutation.mutate(a.id)} disabled={confirmMutation.isPending} data-testid={`button-confirm-start-${a.id}`}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> I've started this job
                    </Button>
                  )}
                </div>
              )}
              {a.confirmation?.status === "confirmed" && (
                <p className="text-green-700 dark:text-green-400 text-sm flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> Placement confirmed by both sides.
                </p>
              )}

              {(a.status === "offered" || a.status === "confirmed_start") && (
                <div>
                  {disputeOpenFor === a.id ? (
                    <DisputeForm applicationId={a.id} onDone={() => setDisputeOpenFor(null)} />
                  ) : (
                    <button
                      onClick={() => setDisputeOpenFor(a.id)}
                      className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
                      data-testid={`button-open-dispute-${a.id}`}
                    >
                      <AlertTriangle className="h-3 w-3" /> Something wrong? File a dispute
                    </button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
