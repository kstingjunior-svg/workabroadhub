import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Globe, 
  ArrowLeft, 
  Package, 
  Clock, 
  CheckCircle, 
  Download, 
  FileText,
  Loader2,
  AlertCircle,
  ChevronRight
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ServiceOrder, ServiceDeliverable } from "@shared/schema";
import { getServiceSLA, getExpectedDeliveryDate, formatDeliveryTime } from "@shared/sla-config";

type OrderWithDeliverables = ServiceOrder & { deliverables?: ServiceDeliverable[] };

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Pending Payment", color: "bg-yellow-500", icon: Clock },
  paid: { label: "Payment Received", color: "bg-blue-500", icon: CheckCircle },
  intake_required: { label: "Intake Required", color: "bg-orange-500", icon: FileText },
  processing: { label: "In Progress", color: "bg-blue-500", icon: Loader2 },
  completed: { label: "Completed", color: "bg-green-500", icon: CheckCircle },
  cancelled: { label: "Cancelled", color: "bg-red-500", icon: AlertCircle },
};

export default function MyOrders() {
  const { toast } = useToast();

  const { data: orders, isLoading } = useQuery<ServiceOrder[]>({
    queryKey: ["/api/service-orders"],
  });

  const downloadMutation = useMutation({
    mutationFn: async (deliverableId: string) => {
      const res = await apiRequest("GET", `/api/deliverables/${deliverableId}/download`);
      return res.json();
    },
    onSuccess: (data) => {
      // Handle file download
      if (data.fileUrl) {
        // If it's a base64 data URL, create download
        if (data.fileUrl.startsWith('data:')) {
          const link = document.createElement('a');
          link.href = data.fileUrl;
          link.download = data.fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          // Open URL in new tab
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
    });
  };

  const getStatusBadge = (status: string) => {
    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;
    return (
      <Badge className={`${config.color} text-white`}>
        <Icon className={`h-3 w-3 mr-1 ${status === "processing" ? "animate-spin" : ""}`} />
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Globe className="h-6 w-6 text-primary" />
              <span className="font-semibold text-lg">My Orders</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Your Service Orders</h1>
          <p className="text-muted-foreground">
            Track your career service orders and download completed deliverables.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-6 w-48 mb-2" />
                  <Skeleton className="h-4 w-32 mb-4" />
                  <Skeleton className="h-8 w-24" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : orders && orders.length > 0 ? (
          <div className="space-y-4">
            {orders.map((order) => (
              <Card key={order.id} className="hover-elevate" data-testid={`order-card-${order.id}`}>
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-semibold text-lg">{order.serviceName}</h3>
                        {getStatusBadge(order.status)}
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                        <span>Order ID: {order.id.slice(0, 8)}...</span>
                        <span>Ordered: {formatDate(order.createdAt)}</span>
                        <span className="font-medium text-foreground">{formatPrice(order.amount)}</span>
                      </div>
                      {order.status === "completed" && order.completedAt && (
                        <p className="text-sm text-green-600 dark:text-green-400">
                          Completed on {formatDate(order.completedAt)}
                        </p>
                      )}
                      {(order.status === "processing" || order.status === "paid") && (
                        <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                          <Clock className="h-4 w-4" />
                          <span>⚡ Instant AI Delivery — ready within 3 minutes of payment confirmation</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center">
                      <Link href={`/order/${order.id}`}>
                        <Button variant="outline" data-testid={`button-view-order-${order.id}`}>
                          View Details
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Orders Yet</h3>
              <p className="text-muted-foreground mb-6">
                You haven't placed any service orders yet. Browse our career services to get started.
              </p>
              <Link href="/services">
                <Button data-testid="button-browse-services">
                  Browse Services
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        <div className="mt-8">
          <Card className="bg-muted/50">
            <CardContent className="p-6">
              <h3 className="font-semibold mb-2">Need Help?</h3>
              <p className="text-sm text-muted-foreground">
                If you have questions about your order or need assistance, please contact our support team.
                We typically respond within 24 hours.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
