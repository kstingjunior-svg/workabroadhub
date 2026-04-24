import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin-layout";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Unlink, UserCheck, ShieldAlert, Phone, DollarSign, Hash, RefreshCw, Search } from "lucide-react";

interface UnmatchedPayment {
  id: string;
  phone: string;
  amount: number;
  mpesa_code: string;
  created_at: string;
  suspected_fraud?: boolean;
  match_score?: number;
}

interface SuggestedUser {
  id: string;
  email: string;
  phone: string;
  first_name?: string;
  last_name?: string;
}

export default function UnmatchedPaymentsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [payments, setPayments] = useState<UnmatchedPayment[]>([]);

  const { data, isLoading, refetch } = useQuery<UnmatchedPayment[]>({
    queryKey: ["/api/admin/unmatched-payments"],
    refetchInterval: 5000,
  });

  // Seed / refresh local state from React Query
  useEffect(() => {
    setPayments(data ?? []);
  }, [data]);

  // Live Supabase realtime — instant optimistic updates without waiting for a refetch
  useEffect(() => {
    const channel = supabase
      .channel("payments-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments" },
        (payload: any) => {
          console.log("🔥 LIVE UPDATE:", payload);
          const updated = payload.new as UnmatchedPayment;

          if (updated.matched === true) {
            // Payment resolved — drop it from the list immediately
            setPayments(prev => prev.filter(p => p.id !== updated.id));
          } else {
            // New or updated unmatched payment — upsert in place
            setPayments(prev => {
              const exists = prev.find(p => p.id === updated.id);
              if (exists) {
                return prev.map(p => p.id === updated.id ? updated : p);
              }
              return [updated, ...prev];
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const filteredPayments = payments.filter(p => {
    const q = search.toLowerCase();
    return !q ||
      p.phone?.includes(q) ||
      p.mpesa_code?.toLowerCase().includes(q) ||
      (p as any).email?.toLowerCase().includes(q);
  });

  const [suggestions, setSuggestions] = useState<Record<string, SuggestedUser[]>>({});

  useEffect(() => {
    payments.forEach(p => {
      if (!suggestions[p.id]) {
        fetch(`/api/admin/suggest-users/${encodeURIComponent(p.phone)}`, { credentials: "include" })
          .then(res => res.json())
          .then((users: SuggestedUser[]) => {
            setSuggestions(prev => ({ ...prev, [p.id]: users }));
          })
          .catch(() => {
            setSuggestions(prev => ({ ...prev, [p.id]: [] }));
          });
      }
    });
  }, [payments]);

  const matchMutation = useMutation({
    mutationFn: ({ payment_id, user_id }: { payment_id: string; user_id: string }) =>
      apiRequest("POST", "/api/admin/match-payment", { payment_id, user_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/unmatched-payments"] });
      toast({ title: "Payment matched", description: "User upgraded to Pro." });
      setLoadingId(null);
    },
    onError: () => {
      toast({ title: "Match failed", variant: "destructive" });
      setLoadingId(null);
    },
  });

  const fraudMutation = useMutation({
    mutationFn: (payment_id: string) =>
      apiRequest("POST", "/api/admin/mark-fraud", { payment_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/unmatched-payments"] });
      toast({ title: "Flagged as fraud" });
      setLoadingId(null);
    },
    onError: () => {
      toast({ title: "Failed to flag", variant: "destructive" });
      setLoadingId(null);
    },
  });

  return (
    <AdminLayout title="Unmatched Payments">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Unlink className="h-6 w-6 text-amber-500" />
              Unmatched Payments
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Payments that completed but could not be linked to a user automatically.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search phone / email / M-Pesa code…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-search"
          />
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
          </div>
        ) : filteredPayments.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              <Unlink className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No unmatched payments</p>
              <p className="text-sm mt-1">All processed payments have been linked to users.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredPayments.map((p) => {
              const userSuggestions: SuggestedUser[] = suggestions[p.id] ?? [];
              const isBusy = loadingId === p.id;
              return (
                <Card key={p.id} className="border border-amber-200 dark:border-amber-900/50">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span data-testid={`text-phone-${p.id}`}>{p.phone}</span>
                          {p.suspected_fraud && (
                            <Badge variant="destructive" className="text-xs">Suspected Fraud</Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-4 text-xs">
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            KES {p.amount}
                          </span>
                          <span className="flex items-center gap-1">
                            <Hash className="h-3 w-3" />
                            {p.mpesa_code}
                          </span>
                          <span>{new Date(p.created_at).toLocaleString()}</span>
                          <span
                            data-testid={`status-payment-${p.id}`}
                            className={p.suspected_fraud ? "text-red-500 font-semibold" : "text-amber-500"}
                          >
                            {p.suspected_fraud ? "🚨 Fraud" : "Pending Match"}
                          </span>
                          {p.match_score !== undefined && p.match_score !== null && (
                            <span data-testid={`score-payment-${p.id}`} className="text-muted-foreground">
                              Score: {p.match_score}
                            </span>
                          )}
                        </CardDescription>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={isBusy}
                        data-testid={`button-fraud-${p.id}`}
                        onClick={() => {
                          setLoadingId(p.id);
                          fraudMutation.mutate(p.id);
                        }}
                      >
                        <ShieldAlert className="h-4 w-4 mr-1" />
                        Mark Fraud
                      </Button>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-0">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Suggested Users
                    </p>
                    {userSuggestions.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">No matching users found.</p>
                    ) : (
                      <div className="space-y-2">
                        {userSuggestions.map((u) => (
                          <div
                            key={u.id}
                            className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2"
                            data-testid={`row-suggestion-${u.id}`}
                          >
                            <div className="text-sm">
                              <p className="font-medium">
                                {u.first_name || u.last_name
                                  ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim()
                                  : u.email}
                              </p>
                              <p className="text-muted-foreground text-xs">{u.email} · {u.phone}</p>
                            </div>
                            <Button
                              size="sm"
                              disabled={isBusy}
                              data-testid={`button-match-${p.id}-${u.id}`}
                              onClick={() => {
                                setLoadingId(p.id);
                                matchMutation.mutate({ payment_id: p.id, user_id: u.id });
                              }}
                            >
                              <UserCheck className="h-4 w-4 mr-1" />
                              Match
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
