// /admin/direct-hire — admin queue for the Direct Hire Exchange Phase 3
// marketplace: verify employers, approve listings, resolve disputes.
// Fee collection is intentionally not implemented — nothing here charges
// anyone; placementConfirmations.feeStatus just stays "pending_legal_review".
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck, XCircle, Building2, Briefcase, AlertTriangle, CheckCircle2 } from "lucide-react";

interface PendingEmployer { id: string; companyName: string; country: string; contactEmail: string; verificationEvidenceUrl: string | null; description: string | null; }
interface PendingListing { id: string; title: string; country: string; employerId: string; }
interface Dispute { id: string; applicationId: string; raisedByRole: string; category: string; description: string; status: string; }

function EmployersTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: employers, isLoading } = useQuery<PendingEmployer[]>({
    queryKey: ["/api/admin/direct-hire/employers/pending"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/direct-hire/employers/pending")).json(),
  });
  const verify = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "verified" | "rejected" }) =>
      (await apiRequest("POST", `/api/admin/direct-hire/employers/${id}/verify`, { status })).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/direct-hire/employers/pending"] }); },
    onError: () => toast({ title: "Failed", variant: "destructive" }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!employers?.length) return <p className="text-sm text-muted-foreground py-6">No employers awaiting verification.</p>;

  return (
    <div className="space-y-3">
      {employers.map((e) => (
        <Card key={e.id} data-testid={`card-pending-employer-${e.id}`}>
          <CardContent className="py-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold break-words">{e.companyName}</p>
              <p className="text-sm text-muted-foreground break-words">{e.country} · {e.contactEmail}</p>
              {e.description && <p className="text-sm text-muted-foreground mt-1 break-words">{e.description}</p>}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button size="sm" variant="outline" className="gap-1" onClick={() => verify.mutate({ id: e.id, status: "rejected" })} data-testid={`button-reject-employer-${e.id}`}>
                <XCircle className="h-3.5 w-3.5" /> Reject
              </Button>
              <Button size="sm" className="gap-1" onClick={() => verify.mutate({ id: e.id, status: "verified" })} data-testid={`button-verify-employer-${e.id}`}>
                <ShieldCheck className="h-3.5 w-3.5" /> Verify
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ListingsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: listings, isLoading } = useQuery<PendingListing[]>({
    queryKey: ["/api/admin/direct-hire/listings/pending"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/direct-hire/listings/pending")).json(),
  });
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      (await apiRequest("PATCH", `/api/admin/direct-hire/listings/${id}`, { status })).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/direct-hire/listings/pending"] }); },
    onError: () => toast({ title: "Failed", variant: "destructive" }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!listings?.length) return <p className="text-sm text-muted-foreground py-6">No listings awaiting review.</p>;

  return (
    <div className="space-y-3">
      {listings.map((l) => (
        <Card key={l.id} data-testid={`card-pending-listing-${l.id}`}>
          <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold break-words">{l.title}</p>
              <p className="text-sm text-muted-foreground">{l.country}</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: l.id, status: "rejected" })} data-testid={`button-reject-listing-${l.id}`}>Reject</Button>
              <Button size="sm" onClick={() => updateStatus.mutate({ id: l.id, status: "live" })} data-testid={`button-approve-listing-${l.id}`}>Approve</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DisputesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const { data: disputes, isLoading } = useQuery<Dispute[]>({
    queryKey: ["/api/admin/direct-hire/disputes"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/direct-hire/disputes")).json(),
  });
  const resolve = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "resolved" | "dismissed" }) =>
      (await apiRequest("POST", `/api/admin/direct-hire/disputes/${id}/resolve`, { status, resolutionNote: notes[id] ?? "" })).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/direct-hire/disputes"] }); },
    onError: () => toast({ title: "Failed", variant: "destructive" }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!disputes?.length) return <p className="text-sm text-muted-foreground py-6">No open disputes.</p>;

  return (
    <div className="space-y-3">
      {disputes.map((d) => (
        <Card key={d.id} data-testid={`card-dispute-${d.id}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> {d.category.replace(/_/g, " ")}
              <Badge variant="secondary">{d.raisedByRole}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">{d.description}</p>
            <Textarea placeholder="Resolution note" value={notes[d.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))} rows={2} data-testid={`textarea-resolution-${d.id}`} />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => resolve.mutate({ id: d.id, status: "dismissed" })} data-testid={`button-dismiss-dispute-${d.id}`}>Dismiss</Button>
              <Button size="sm" className="gap-1" onClick={() => resolve.mutate({ id: d.id, status: "resolved" })} data-testid={`button-resolve-dispute-${d.id}`}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Mark resolved
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function DirectHireAdmin() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold" data-testid="heading-direct-hire-admin">Direct Hire Exchange — Admin</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Success-fee collection is not implemented (pending legal review) — this queue only covers verification, listing review, and disputes.
        </p>
      </div>
      <Tabs defaultValue="employers">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="employers" className="gap-1.5" data-testid="tab-employers"><Building2 className="h-3.5 w-3.5" /> Employers</TabsTrigger>
          <TabsTrigger value="listings" className="gap-1.5" data-testid="tab-listings"><Briefcase className="h-3.5 w-3.5" /> Listings</TabsTrigger>
          <TabsTrigger value="disputes" className="gap-1.5" data-testid="tab-disputes"><AlertTriangle className="h-3.5 w-3.5" /> Disputes</TabsTrigger>
        </TabsList>
        <TabsContent value="employers"><EmployersTab /></TabsContent>
        <TabsContent value="listings"><ListingsTab /></TabsContent>
        <TabsContent value="disputes"><DisputesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
