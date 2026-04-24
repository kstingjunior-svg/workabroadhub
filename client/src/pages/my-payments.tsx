import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, RefreshCw, Receipt, ArrowLeft, Wifi, WifiOff } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

type Payment = {
  id: string;
  paymentId: string | null;
  amount: number;
  currency: string;
  status: string;
  gateway: string;
  type: string;
  planId: string | null;
  serviceId: string | null;
  gatewayRef: string | null;
  failReason: string | null;
  createdAt: string;
};

/**
 * Map a raw Supabase `payments` row (snake_case) to the shape the UI expects.
 * Mirrors the CASE logic in GET /api/payments/history so cached data stays consistent.
 */
function mapSupabaseRow(row: Record<string, any>): Payment {
  const status =
    row.status === "completed" ? "success" : (row.status ?? "pending");

  let type = "other";
  if (row.plan_id)                                            type = "subscription";
  else if (String(row.service_id ?? "").toLowerCase().includes("cv"))       type = "cv_service";
  else if (String(row.service_id ?? "").toLowerCase().includes("consult"))  type = "consultation";
  else if (String(row.service_id ?? "").toLowerCase().includes("visa"))     type = "visa_guide";
  else if (String(row.service_id ?? "").toLowerCase().includes("job"))      type = "job_post";

  return {
    id:         String(row.id),
    paymentId:  row.transaction_ref  ?? null,
    amount:     Number(row.amount    ?? 0),
    currency:   row.currency         ?? "KES",
    status,
    gateway:    row.method           ?? "mpesa",
    type,
    planId:     row.plan_id          ?? null,
    serviceId:  row.service_id       ?? null,
    gatewayRef: row.mpesa_receipt_number ?? row.mpesa_code ?? null,
    failReason: row.fail_reason      ?? null,
    createdAt:  row.created_at       ?? new Date().toISOString(),
  };
}

function statusConfig(status: string): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (status === "completed" || status === "success")
    return { label: "Paid", variant: "default" };
  if (status === "failed")
    return { label: "Failed", variant: "destructive" };
  if (status === "refunded")
    return { label: "Refunded", variant: "outline" };
  return { label: "Pending", variant: "secondary" };
}

function inferLabel(p: Payment): string {
  if (p.planId) {
    const name = p.planId.charAt(0).toUpperCase() + p.planId.slice(1);
    return `${name} Plan`;
  }
  if (p.serviceId) {
    if (p.serviceId.toLowerCase().includes("cv"))          return "CV Service";
    if (p.serviceId.toLowerCase().includes("consult"))     return "Consultation";
    if (p.serviceId.toLowerCase().includes("visa"))        return "Visa Guide";
    if (p.serviceId.toLowerCase().includes("job"))         return "Job Posting";
    return "Service";
  }
  return "Payment";
}

function methodLabel(gateway: string): string {
  if (gateway === "mpesa")  return "M-Pesa";
  if (gateway === "paypal") return "PayPal";
  return "Card";
}

function refLabel(p: Payment): string {
  return p.gatewayRef ?? p.paymentId ?? p.id.slice(0, 12) + "…";
}

export default function MyPayments() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const { data: payments, isLoading, refetch, isFetching } = useQuery<Payment[]>({
    queryKey: ["/api/payments/history"],
    staleTime: 1000 * 60 * 5,
    enabled: !!user,
  });

  // ── Supabase Realtime — postgres_changes on payments ─────────────────────────
  // Scoped to this user's rows via server-side filter.
  // Applies optimistic cache writes so the UI updates instantly without refetching.
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`payments-history-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table:  "payments",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload;

          if (eventType === "INSERT" && newRow) {
            const inserted = mapSupabaseRow(newRow);
            queryClient.setQueryData<Payment[]>(
              ["/api/payments/history"],
              (prev) => [inserted, ...(prev ?? [])],
            );
          }

          if (eventType === "UPDATE" && newRow) {
            const updated = mapSupabaseRow(newRow);
            queryClient.setQueryData<Payment[]>(
              ["/api/payments/history"],
              (prev) =>
                (prev ?? []).map((p) => (p.id === updated.id ? updated : p)),
            );

            // Toast on payment success
            if (updated.status === "success") {
              toast({
                title: "Payment confirmed",
                description: `${updated.currency} ${updated.amount.toLocaleString()} received via ${methodLabel(updated.gateway)}. Receipt: ${refLabel(updated)}`,
              });
            }

            // Toast on failure
            if (updated.status === "failed") {
              toast({
                title: "Payment failed",
                description: updated.failReason ?? "Please try again or contact support.",
                variant: "destructive",
              });
            }
          }

          if (eventType === "DELETE" && oldRow?.id) {
            queryClient.setQueryData<Payment[]>(
              ["/api/payments/history"],
              (prev) => (prev ?? []).filter((p) => p.id !== String(oldRow.id)),
            );
          }
        },
      )
      .subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
      });

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setRealtimeConnected(false);
    };
  }, [user?.id, queryClient, toast]);

  // ── WebSocket fallback — broader user events (plan_activated, etc.) ──────────
  useEffect(() => {
    if (!user?.id) return;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/user`);

    ws.onopen = () => ws.send(JSON.stringify({ type: "identify", userId: user.id }));
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (
          msg.type === "payment_update" ||
          msg.type === "plan_activated" ||
          msg.type === "payment_failed"
        ) {
          // Only fallback-invalidate if Supabase realtime isn't connected
          if (!realtimeConnected) {
            queryClient.invalidateQueries({ queryKey: ["/api/payments/history"] });
          }
        }
      } catch {}
    };
    ws.onerror = () => {};
    return () => ws.close();
  }, [user?.id, queryClient, realtimeConnected]);

  const handleDownloadReceipt = (paymentId: string) => {
    window.open(`/api/payments/${paymentId}/receipt`, "_blank");
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="container mx-auto p-4 md:p-6 max-w-4xl">

        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="mb-4 gap-1.5 text-muted-foreground" data-testid="button-back-dashboard">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-xl" data-testid="text-page-title">My Payments</CardTitle>
              {/* Realtime connection indicator */}
              <span
                className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                  realtimeConnected
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                }`}
                data-testid="status-realtime"
                title={realtimeConnected ? "Live updates active" : "Connecting to live updates…"}
              >
                {realtimeConnected
                  ? <><Wifi className="h-2.5 w-2.5" /> Live</>
                  : <><WifiOff className="h-2.5 w-2.5" /> Offline</>}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh-payments"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="space-y-3" data-testid="skeleton-payments">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
              </div>
            ) : !payments || payments.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground" data-testid="text-no-payments">
                <Receipt className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No payments yet</p>
                <p className="text-sm mt-1">Purchase a plan or service to see your history here.</p>
                <Link href="/payment">
                  <Button size="sm" className="mt-4" data-testid="button-go-to-payment">Upgrade to Pro</Button>
                </Link>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block">
                  <Table data-testid="table-payments">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Service</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead className="text-right">Receipt</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((p) => {
                        const { label, variant } = statusConfig(p.status);
                        const isPaid = p.status === "completed" || p.status === "success";
                        return (
                          <TableRow key={p.id} data-testid={`row-payment-${p.id}`}>
                            <TableCell className="font-medium whitespace-nowrap">
                              {format(new Date(p.createdAt), "dd MMM yyyy, HH:mm")}
                            </TableCell>
                            <TableCell>{inferLabel(p)}</TableCell>
                            <TableCell className="font-semibold">
                              {p.currency} {p.amount.toLocaleString()}
                            </TableCell>
                            <TableCell>{methodLabel(p.gateway)}</TableCell>
                            <TableCell>
                              <Badge variant={variant} data-testid={`badge-status-${p.id}`}>{label}</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {refLabel(p)}
                            </TableCell>
                            <TableCell className="text-right">
                              {isPaid && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDownloadReceipt(p.id)}
                                  data-testid={`button-receipt-${p.id}`}
                                  title="Download receipt"
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile card list */}
                <div className="md:hidden space-y-3">
                  {payments.map((p) => {
                    const { label, variant } = statusConfig(p.status);
                    const isPaid = p.status === "completed" || p.status === "success";
                    return (
                      <div
                        key={p.id}
                        className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4"
                        data-testid={`card-payment-${p.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm">{inferLabel(p)}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {format(new Date(p.createdAt), "dd MMM yyyy, HH:mm")}
                              {" · "}
                              {methodLabel(p.gateway)}
                            </p>
                            <p className="text-[11px] font-mono text-muted-foreground truncate mt-0.5">
                              {refLabel(p)}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold text-sm">{p.currency} {p.amount.toLocaleString()}</p>
                            <Badge variant={variant} className="mt-1 text-[10px]">{label}</Badge>
                          </div>
                        </div>
                        {isPaid && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-3 w-full gap-1.5 text-xs"
                            onClick={() => handleDownloadReceipt(p.id)}
                            data-testid={`button-receipt-mobile-${p.id}`}
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download Receipt
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <p className="text-[11px] text-muted-foreground text-center mt-4">
                  Showing {payments.length} payment{payments.length !== 1 ? "s" : ""}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
