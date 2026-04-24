import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
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
