import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { triggerDownload } from "@/components/delivery-banner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { 
  Globe, 
  ArrowLeft, 
  Clock, 
  CheckCircle, 
  Download, 
  FileText,
  Loader2,
  AlertCircle,
  Calendar,
  User,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  File
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { ServiceOrder, ServiceDeliverable } from "@shared/schema";

type OrderWithDeliverables = ServiceOrder & { deliverables?: ServiceDeliverable[] };

const statusConfig: Record<string, { label: string; color: string; icon: any; description: string }> = {
  pending: { 
    label: "Pending Payment", 
    color: "bg-yellow-500", 
    icon: Clock,
    description: "Your payment is being processed."
  },
  paid: { 
    label: "Payment Received", 
    color: "bg-blue-500", 
    icon: CheckCircle,
    description: "Payment confirmed. We're preparing to start your order."
  },
  intake_required: { 
    label: "Information Needed", 
    color: "bg-orange-500", 
    icon: FileText,
    description: "We need additional information to proceed with your order."
  },
  processing: { 
    label: "In Progress", 
    color: "bg-blue-500", 
    icon: Loader2,
    description: "⚡ Our AI is generating your document — it will be ready within 3 minutes of payment confirmation."
  },
  completed: { 
    label: "Completed", 
    color: "bg-green-500", 
    icon: CheckCircle,
    description: "Your order is complete! Download your deliverables below."
  },
  cancelled: { 
    label: "Cancelled", 
    color: "bg-red-500", 
    icon: AlertCircle,
    description: "This order has been cancelled."
  },
};

export default function OrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const { toast } = useToast();

  const { data: order, isLoading } = useQuery<OrderWithDeliverables>({
    queryKey: ["/api/service-orders", orderId],
  });

  const downloadMutation = useMutation({
    mutationFn: async (deliverableId: string) => {
      const res = await apiRequest("GET", `/api/deliverables/${deliverableId}/download`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.fileUrl) {
        if (data.fileUrl.startsWith('data:')) {
          const link = document.createElement('a');
          link.href = data.fileUrl;
          link.download = data.fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          window.open(data.fileUrl, '_blank');
        }
        toast({
          title: "Download Started",
          description: `Downloading ${data.fileName}`,
        });
      }
    },
    onError: () => {
      toast({
        title: "Download Failed",
        description: "Unable to download the file. Please try again.",
        variant: "destructive",
      });
    },
  });

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 0,
    }).format(price);
  };

  const formatDate = (date: string | Date | null) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Order Not Found</h2>
            <p className="text-muted-foreground mb-4">The order you're looking for doesn't exist or you don't have access to it.</p>
            <Link href="/my-orders">
              <Button>View My Orders</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusInfo = statusConfig[order.status] || statusConfig.pending;
  const StatusIcon = statusInfo.icon;
  const intakeData = order.intakeData as Record<string, string> | null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-4">
            <Link href="/my-orders">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Globe className="h-6 w-6 text-primary" />
              <span className="font-semibold text-lg">Order Details</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Card className={`border-l-4 ${statusInfo.color.replace('bg-', 'border-')}`}>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-xl font-bold">{order.serviceName}</h1>
                  <Badge className={`${statusInfo.color} text-white`}>
                    <StatusIcon className={`h-3 w-3 mr-1 ${order.status === "processing" ? "animate-spin" : ""}`} />
                    {statusInfo.label}
                  </Badge>
                </div>
                <p className="text-muted-foreground">{statusInfo.description}</p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold">{formatPrice(order.amount)}</span>
                <p className="text-sm text-muted-foreground">{order.paymentMethod?.toUpperCase() || "Pending"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Order Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Order Placed</span>
                <span>{formatDate(order.createdAt)}</span>
              </div>
              {order.status === "completed" && order.completedAt && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Completed</span>
                  <span className="text-green-600">{formatDate(order.completedAt)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Order ID</span>
                <span className="font-mono text-xs">{order.id}</span>
              </div>
              {order.paymentRef && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Payment Ref</span>
                  <span className="font-mono text-xs">{order.paymentRef}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {intakeData && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Your Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {intakeData.fullName && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{intakeData.fullName}</span>
                  </div>
                )}
                {intakeData.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{intakeData.email}</span>
                  </div>
                )}
                {intakeData.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{intakeData.phone}</span>
                  </div>
                )}
                {intakeData.targetCountry && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>Target: {intakeData.targetCountry}</span>
                  </div>
                )}
                {intakeData.currentRole && (
                  <div className="flex items-center gap-2 text-sm">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <span>{intakeData.currentRole}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* 2026-07 PRODUCTION FIX: new-flow AI service orders (CV Revamp,
            CV Rewrite, Cover Letter, SOP, etc.) don't populate the legacy
            service_deliverables table — the output lives in
            service_orders.output_text and is streamed via
            /api/services/order/:id/download/pdf|docx.
            When status='completed' but no legacy deliverables exist, show
            direct PDF + Word download buttons pointing at the new endpoint.
            Users like the KES 699 CV Rewrite case (2026-07-31 report)
            were stranded on this page seeing "Completed" with no download.  */}
        {order.status === "completed" && (!order.deliverables || order.deliverables.length === 0) && (
          <Card className="border-green-200 dark:border-green-900">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-green-600 dark:text-green-400">
                <Download className="h-5 w-5" />
                Your Deliverables
              </CardTitle>
              <CardDescription>
                Your document is ready. Download in the format you prefer.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <FallbackDownloadButton orderId={order.id} kind="pdf" label="PDF" color="red" />
                <FallbackDownloadButton orderId={order.id} kind="docx" label="Word" color="blue" />
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Trouble downloading? Also available on your{" "}
                <a href="/my-documents" className="text-primary hover:underline">My Documents</a> page.
              </p>
            </CardContent>
          </Card>
        )}

        {order.deliverables && order.deliverables.length > 0 && (
          <Card className="border-green-200 dark:border-green-900">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-green-600 dark:text-green-400">
                <Download className="h-5 w-5" />
                Your Deliverables
              </CardTitle>
              <CardDescription>
                Download your completed files below.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {order.deliverables.map((deliverable) => (
                  <div
                    key={deliverable.id}
                    className="flex items-center justify-between p-4 rounded-lg border bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <File className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{deliverable.fileName}</p>
                        <p className="text-sm text-muted-foreground">
                          {deliverable.description || deliverable.fileType}
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={() => downloadMutation.mutate(deliverable.id)}
                      disabled={downloadMutation.isPending}
                      data-testid={`button-download-${deliverable.id}`}
                    >
                      {downloadMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </>
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {order.status === "processing" && (
          <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <Loader2 className="h-6 w-6 text-blue-500 animate-spin flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-blue-700 dark:text-blue-400 mb-1">
                    Your Order is Being Processed
                  </h3>
                  <p className="text-sm text-blue-600 dark:text-blue-300">
                    ⚡ Our AI is generating your {order.serviceName.toLowerCase()}.
                    Your document will be ready within 3 minutes of payment confirmation —
                    you'll receive a WhatsApp message and a notification here the moment it's done.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

/**
 * Mobile-safe fallback download. Uses fetch → blob → programmatic click
 * instead of a plain <a href> so mobile Chrome + in-app WebViews save the
 * file instead of trying to navigate to the API endpoint (which they can
 * silently fail to do).
 */
function FallbackDownloadButton({
  orderId, kind, label, color,
}: { orderId: string; kind: "pdf" | "docx"; label: string; color: "red" | "blue" }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bg = color === "red"
    ? "bg-red-600 hover:bg-red-700"
    : "bg-blue-600 hover:bg-blue-700";
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setErr(null);
          setBusy(true);
          try {
            await triggerDownload(
              `/api/services/order/${orderId}/download/${kind}`,
              `workabroadhub-${orderId.slice(0, 8)}.${kind}`,
            );
          } catch (e: any) {
            setErr(e?.message || "Download failed. Please refresh.");
          } finally {
            setBusy(false);
          }
        }}
        className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg ${bg} disabled:opacity-70 disabled:cursor-wait text-white font-semibold text-sm`}
        data-testid={`button-download-${kind}-fallback`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {label}
      </button>
      {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}
    </div>
  );
}
