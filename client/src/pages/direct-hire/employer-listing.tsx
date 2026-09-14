// /direct-hire/employer/listings/:id — manage one listing: move applicants
// through the pipeline, and confirm a placement start. No fee is charged
// anywhere in this flow — that's intentionally not implemented yet.
import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePageSeo } from "@/hooks/use-page-seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, BadgeCheck, CheckCircle2 } from "lucide-react";

interface Listing { id: string; title: string; country: string; status: string; }
interface Application {
  id: string; applicantUserId: string; status: string; coverNote: string | null; verifiedProfileUrl: string | null;
}

const NEXT_STATUSES = ["shortlisted", "interview", "offered", "rejected", "withdrawn"];

function ConfirmStartForm({ applicationId, onDone }: { applicationId: string; onDone: () => void }) {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState("");
  const [workLocation, setWorkLocation] = useState("");
  const mutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/direct-hire/employer/applications/${applicationId}/confirm-start`, { startDate, workLocation })).json(),
    onSuccess: () => { toast({ title: "Confirmed on your side", description: "Waiting on the worker to confirm too." }); onDone(); },
    onError: () => toast({ title: "Couldn't confirm", variant: "destructive" }),
  });
  return (
    <div className="flex flex-wrap items-end gap-2 pt-2 border-t mt-2">
      <div><Label className="text-xs">Start date</Label><Input value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="2026-10-01" className="h-8 w-32" data-testid={`input-start-date-${applicationId}`} /></div>
      <div><Label className="text-xs">Work location</Label><Input value={workLocation} onChange={(e) => setWorkLocation(e.target.value)} className="h-8 w-40" data-testid={`input-work-location-${applicationId}`} /></div>
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-1" data-testid={`button-employer-confirm-start-${applicationId}`}>
        <CheckCircle2 className="h-3.5 w-3.5" /> Confirm placement
      </Button>
    </div>
  );
}

export default function DirectHireEmployerListingManage() {
  const { id } = useParams<{ id: string }>();
  usePageSeo({ title: "Manage listing — Direct Hire Jobs | WorkAbroad Hub", description: "Review applicants and confirm placements." });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmingFor, setConfirmingFor] = useState<string | null>(null);

  const { data: listings, isLoading: loadingListings } = useQuery<Listing[]>({
    queryKey: ["/api/direct-hire/employer/listings"],
    queryFn: async () => (await apiRequest("GET", "/api/direct-hire/employer/listings")).json(),
  });
  const listing = listings?.find((l) => l.id === id);

  const { data: applications, isLoading: loadingApps } = useQuery<Application[]>({
    queryKey: [`/api/direct-hire/employer/listings/${id}/applications`],
    queryFn: async () => (await apiRequest("GET", `/api/direct-hire/employer/listings/${id}/applications`)).json(),
    enabled: !!id,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ applicationId, status }: { applicationId: string; status: string }) =>
      (await apiRequest("PATCH", `/api/direct-hire/employer/applications/${applicationId}`, { status })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/direct-hire/employer/listings/${id}/applications`] });
    },
    onError: () => toast({ title: "Couldn't update applicant status", variant: "destructive" }),
  });

  if (loadingListings || loadingApps) {
    return <div className="max-w-2xl mx-auto px-4 py-8 space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full rounded-2xl" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <Link href="/direct-hire/employer/dashboard">
        <Button variant="ghost" size="sm" className="gap-1 -ml-2" data-testid="button-back-dashboard"><ChevronLeft className="h-4 w-4" /> Dashboard</Button>
      </Link>

      <div>
        <h1 className="text-xl font-bold" data-testid="heading-manage-listing">{listing?.title ?? "Listing"}</h1>
        {listing && <p className="text-sm text-muted-foreground">{listing.country} · {listing.status}</p>}
      </div>

      <div className="space-y-3">
        {(!applications || applications.length === 0) && (
          <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">No applicants yet.</CardContent></Card>
        )}
        {applications?.map((a) => (
          <Card key={a.id} data-testid={`card-applicant-${a.id}`}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                Applicant
                {a.verifiedProfileUrl && (
                  <a href={a.verifiedProfileUrl} target="_blank" rel="noopener noreferrer">
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 hover:bg-green-100 gap-1">
                      <BadgeCheck className="h-3 w-3" /> Verified profile
                    </Badge>
                  </a>
                )}
              </CardTitle>
              <Select value={a.status} onValueChange={(status) => updateStatus.mutate({ applicationId: a.id, status })}>
                <SelectTrigger className="w-40 h-8" data-testid={`select-applicant-status-${a.id}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="applied" disabled>Applied</SelectItem>
                  {NEXT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {a.coverNote && <p className="text-muted-foreground whitespace-pre-wrap">{a.coverNote}</p>}
              {a.status === "offered" && (
                confirmingFor === a.id ? (
                  <ConfirmStartForm applicationId={a.id} onDone={() => setConfirmingFor(null)} />
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setConfirmingFor(a.id)} data-testid={`button-open-confirm-${a.id}`}>
                    Confirm placement start
                  </Button>
                )
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
