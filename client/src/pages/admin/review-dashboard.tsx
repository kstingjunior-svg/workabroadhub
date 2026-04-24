import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { 
  AlertTriangle, 
  Bot, 
  CheckCircle, 
  Clock, 
  Eye, 
  FileText, 
  Loader2, 
  RefreshCw, 
  ThumbsUp,
  XCircle,
  AlertCircle,
  TrendingUp,
  Shield
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ServiceOrder {
  id: string;
  userId: string;
  serviceId: string;
  serviceName: string;
  amount: number;
  status: string;
  intakeData: Record<string, any> | null;
  aiProcessedAt: string | null;
  aiOutput: any;
  qualityScore: number | null;
  qualityPassed: boolean | null;
  qualityCheckData: any;
  needsHumanReview: boolean | null;
  humanReviewNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export default function ReviewDashboard() {
  const { toast } = useToast();
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);
  const [reviewDialog, setReviewDialog] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [editedContent, setEditedContent] = useState("");

  const { data: orders, isLoading } = useQuery<ServiceOrder[]>({
    queryKey: ["/api/admin/service-orders"],
  });

  const flaggedOrders = orders?.filter(o => o.needsHumanReview) || [];
  const recentlyReviewed = orders?.filter(o => o.reviewedAt && !o.needsHumanReview).slice(0, 5) || [];
  
  const stats = {
    pending: flaggedOrders.length,
    reviewedToday: orders?.filter(o => {
      if (!o.reviewedAt) return false;
      const today = new Date().toDateString();
      return new Date(o.reviewedAt).toDateString() === today;
    }).length || 0,
    avgQualityScore: Math.round(
      (orders?.filter(o => o.qualityScore !== null).reduce((sum, o) => sum + (o.qualityScore || 0), 0) || 0) /
      (orders?.filter(o => o.qualityScore !== null).length || 1)
    ),
    autoApproved: orders?.filter(o => o.qualityPassed && !o.needsHumanReview).length || 0,
  };

  const reviewOrderMutation = useMutation({
    mutationFn: async (data: { orderId: string; action: string; notes: string; editedContent?: string }) => {
      const res = await apiRequest("POST", `/api/admin/service-orders/${data.orderId}/review`, data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/service-orders"] });
      setReviewDialog(false);
      setSelectedOrder(null);
      setReviewNotes("");
      setEditedContent("");
      toast({ 
        title: data.action === "approved" ? "Order Approved" : "Order Reprocessed", 
        description: data.action === "approved" ? "Order has been approved and delivered." : "Order sent for reprocessing." 
      });
    },
    onError: () => {
      toast({ title: "Review Failed", description: "Failed to complete review.", variant: "destructive" });
    },
  });

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getRiskBadge = (checkData: any) => {
    const risk = checkData?.hallucinationRisk || "low";
    const colors: Record<string, string> = {
      high: "bg-red-500",
      medium: "bg-orange-500",
      low: "bg-green-500",
    };
    return (
      <Badge className={`${colors[risk]} text-white`}>
        <Shield className="h-3 w-3 mr-1" />
        {risk.toUpperCase()} Risk
      </Badge>
    );
  };

  const openReviewDialog = (order: ServiceOrder) => {
    setSelectedOrder(order);
    setEditedContent((order.aiOutput as any)?.content || "");
    setReviewNotes("");
    setReviewDialog(true);
  };

  return (
    <AdminLayout title="Review Dashboard">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">AI Review Dashboard</h1>
          <p className="text-muted-foreground">Review and approve orders flagged for human review</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                  <p className="text-xs text-muted-foreground">Pending Review</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.reviewedToday}</p>
                  <p className="text-xs text-muted-foreground">Reviewed Today</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.avgQualityScore}%</p>
                  <p className="text-xs text-muted-foreground">Avg Quality</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <Bot className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.autoApproved}</p>
                  <p className="text-xs text-muted-foreground">Auto-Approved</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  Orders Needing Review
                </CardTitle>
                <CardDescription>
                  {flaggedOrders.length} order(s) flagged for human review
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-24 w-full" />
                    ))}
                  </div>
                ) : flaggedOrders.length > 0 ? (
                  <div className="space-y-3">
                    {flaggedOrders.map(order => (
                      <div
                        key={order.id}
                        className="p-4 border rounded-lg hover-elevate cursor-pointer"
                        onClick={() => openReviewDialog(order)}
                        data-testid={`review-order-${order.id}`}
                      >
                        <div className="flex flex-col md:flex-row justify-between gap-3">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-semibold">{order.serviceName}</h4>
                              <Badge variant="outline" className={order.qualityPassed ? "text-green-600" : "text-red-600"}>
                                Score: {order.qualityScore || 0}%
                              </Badge>
                              {order.qualityCheckData && getRiskBadge(order.qualityCheckData)}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Order #{order.id.slice(0, 8)} • {formatDate(order.createdAt)}
                            </p>
                            {order.qualityCheckData?.failConditions?.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {(order.qualityCheckData.failConditions as string[]).slice(0, 3).map((fc, i) => (
                                  <Badge key={i} variant="destructive" className="text-xs">
                                    {fc}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          <Button size="sm" data-testid={`button-review-${order.id}`}>
                            <Eye className="h-4 w-4 mr-1" />
                            Review
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                    <h4 className="font-semibold">All Caught Up!</h4>
                    <p className="text-sm text-muted-foreground">No orders need review right now</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recently Reviewed</CardTitle>
              </CardHeader>
              <CardContent>
                {recentlyReviewed.length > 0 ? (
                  <div className="space-y-3">
                    {recentlyReviewed.map(order => (
                      <div key={order.id} className="flex items-center gap-3 text-sm">
                        <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{order.serviceName}</p>
                          <p className="text-xs text-muted-foreground">
                            {order.reviewedAt && formatDate(order.reviewedAt)}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-green-600 shrink-0">
                          {order.qualityScore}%
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No reviews yet
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quality Guidelines</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <span>CV longer than 4 pages</span>
                </div>
                <div className="flex items-start gap-2">
                  <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <span>Missing key sections</span>
                </div>
                <div className="flex items-start gap-2">
                  <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <span>Hallucinations detected</span>
                </div>
                <div className="flex items-start gap-2">
                  <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <span>Language quality below 75%</span>
                </div>
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                  <span>Overall score below 75%</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={reviewDialog} onOpenChange={setReviewDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Review: {selectedOrder?.serviceName}
            </DialogTitle>
            <DialogDescription>
              Order #{selectedOrder?.id.slice(0, 8)} • Quality Score: {selectedOrder?.qualityScore}%
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Quality Issues</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedOrder.qualityCheckData?.failConditions?.length > 0 ? (
                      <ul className="space-y-2 text-sm">
                        {(selectedOrder.qualityCheckData.failConditions as string[]).map((fc, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                            {fc}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No specific issues flagged</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Quality Scores</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      {selectedOrder.qualityCheckData && Object.entries(selectedOrder.qualityCheckData)
                        .filter(([key]) => !["status", "failConditions", "hallucinationPatterns"].includes(key))
                        .slice(0, 6)
                        .map(([key, value]) => (
                          <div key={key} className="flex justify-between">
                            <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                            <span className="font-medium">
                              {typeof value === "number" ? (value > 1 ? `${value}%` : `${Math.round(value * 100)}%`) : String(value)}
                            </span>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div>
                <Label className="text-sm font-medium">AI Generated Content (editable)</Label>
                <Textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  className="mt-2 min-h-[300px] font-mono text-sm"
                  data-testid="textarea-review-content"
                />
              </div>

              <div>
                <Label className="text-sm font-medium">Review Notes</Label>
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Add notes about your review decision..."
                  className="mt-2"
                  data-testid="textarea-review-notes"
                />
              </div>

              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setReviewDialog(false)}>
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    reviewOrderMutation.mutate({
                      orderId: selectedOrder.id,
                      action: "reprocess",
                      notes: reviewNotes,
                    });
                  }}
                  disabled={reviewOrderMutation.isPending}
                  data-testid="button-reprocess"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reprocess
                </Button>
                <Button
                  onClick={() => {
                    reviewOrderMutation.mutate({
                      orderId: selectedOrder.id,
                      action: "approve",
                      notes: reviewNotes,
                      editedContent,
                    });
                  }}
                  disabled={reviewOrderMutation.isPending}
                  data-testid="button-approve"
                >
                  {reviewOrderMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ThumbsUp className="h-4 w-4 mr-2" />
                  )}
                  Approve & Deliver
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
