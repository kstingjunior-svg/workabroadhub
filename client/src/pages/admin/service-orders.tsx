import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Package, 
  Clock, 
  CheckCircle, 
  Loader2, 
  AlertCircle,
  Eye,
  Upload,
  User,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  FileText,
  Download,
  Zap,
  AlertTriangle,
  ThumbsUp,
  RefreshCw,
  Bot
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ServiceOrder, ServiceDeliverable } from "@shared/schema";

type OrderWithDeliverables = ServiceOrder & { deliverables?: ServiceDeliverable[] };

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Pending", color: "bg-yellow-500", icon: Clock },
  pending_payment: { label: "Awaiting Payment", color: "bg-orange-400", icon: Clock },
  paid: { label: "Paid", color: "bg-blue-500", icon: CheckCircle },
  intake_required: { label: "Intake Required", color: "bg-orange-500", icon: FileText },
  processing: { label: "Processing", color: "bg-blue-500", icon: Loader2 },
  completed: { label: "Completed", color: "bg-green-500", icon: CheckCircle },
  cancelled: { label: "Cancelled", color: "bg-red-500", icon: AlertCircle },
};

export default function AdminServiceOrders() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDeliverables | null>(null);
  const [uploadDialog, setUploadDialog] = useState(false);
  const [uploadData, setUploadData] = useState({ fileName: "", description: "", fileUrl: "" });
  const [reviewDialog, setReviewDialog] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [editedContent, setEditedContent] = useState("");

  const { data: orders, isLoading } = useQuery<ServiceOrder[]>({
    queryKey: ["/api/admin/service-orders", statusFilter],
    queryFn: async () => {
      const url = statusFilter === "all" 
        ? "/api/admin/service-orders" 
        : `/api/admin/service-orders?status=${statusFilter}`;
      const res = await fetch(url, { credentials: "include" });
      return res.json();
    },
  });

  const { data: orderDetails, isLoading: detailsLoading } = useQuery<OrderWithDeliverables>({
    queryKey: ["/api/service-orders", selectedOrder?.id],
    queryFn: async () => {
      if (!selectedOrder?.id) return null;
      const res = await fetch(`/api/service-orders/${selectedOrder.id}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!selectedOrder?.id,
  });

  const updateOrderMutation = useMutation({
    mutationFn: async (data: { id: string; status?: string; adminNotes?: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/service-orders/${data.id}`, {
        status: data.status,
        adminNotes: data.adminNotes,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/service-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-orders"] });
      toast({ title: "Order Updated", description: "Order status has been updated successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update order.", variant: "destructive" });
    },
  });

  const uploadDeliverableMutation = useMutation({
    mutationFn: async (data: { orderId: string; fileName: string; fileType: string; fileUrl: string; description: string }) => {
      const res = await apiRequest("POST", `/api/admin/service-orders/${data.orderId}/deliverables`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-orders"] });
      setUploadDialog(false);
      setUploadData({ fileName: "", description: "", fileUrl: "" });
      toast({ title: "Deliverable Uploaded", description: "The file has been uploaded successfully." });
    },
    onError: () => {
      toast({ title: "Upload Failed", description: "Failed to upload deliverable.", variant: "destructive" });
    },
  });

  const processOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiRequest("POST", `/api/admin/service-orders/${orderId}/process`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/service-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-orders"] });
      if (data.autoDelivered) {
        toast({ title: "Order Auto-Delivered", description: "AI processing passed quality checks and order was delivered." });
      } else if (data.needsReview) {
        toast({ title: "Needs Human Review", description: "AI processing flagged this order for human review.", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Processing Failed", description: "Failed to process order with AI.", variant: "destructive" });
    },
  });

  const processQueueMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/service-orders/process-queue", {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/service-orders"] });
      toast({ 
        title: "Queue Processed", 
        description: `Processed: ${data.processed}, Auto-delivered: ${data.autoDelivered}, Flagged: ${data.flaggedForReview}` 
      });
    },
    onError: () => {
      toast({ title: "Queue Processing Failed", description: "Failed to process order queue.", variant: "destructive" });
    },
  });

  const reviewOrderMutation = useMutation({
    mutationFn: async (data: { orderId: string; action: string; notes: string; editedContent?: string }) => {
      const res = await apiRequest("POST", `/api/admin/service-orders/${data.orderId}/review`, data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/service-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-orders"] });
      setReviewDialog(false);
      setReviewNotes("");
      setEditedContent("");
      toast({ 
        title: data.action === "approved" ? "Order Approved" : "Order Reprocessed", 
        description: data.action === "approved" ? "Order has been approved and delivered." : "Order has been sent for reprocessing." 
      });
    },
    onError: () => {
      toast({ title: "Review Failed", description: "Failed to complete review.", variant: "destructive" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadData(prev => ({
          ...prev,
          fileName: file.name,
          fileUrl: reader.result as string,
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadSubmit = () => {
    if (!selectedOrder || !uploadData.fileName || !uploadData.fileUrl) return;
    
    const fileType = uploadData.fileName.split('.').pop() || 'file';
    uploadDeliverableMutation.mutate({
      orderId: selectedOrder.id,
      fileName: uploadData.fileName,
      fileType,
      fileUrl: uploadData.fileUrl,
      description: uploadData.description,
    });
  };

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

  const intakeData = orderDetails?.intakeData as Record<string, string> | null;

  return (
    <AdminLayout title="Service Orders">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Service Orders</h1>
            <p className="text-muted-foreground">Manage customer service orders and deliverables</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => processQueueMutation.mutate()}
              disabled={processQueueMutation.isPending}
              data-testid="button-process-queue"
            >
              {processQueueMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Bot className="h-4 w-4 mr-2" />
              )}
              Process Queue with AI
            </Button>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48" data-testid="select-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Orders</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="pending_payment">Awaiting Payment</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <Skeleton className="h-6 w-48 mb-2" />
                      <Skeleton className="h-4 w-32" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : orders && orders.length > 0 ? (
              orders.map((order) => (
                <Card
                  key={order.id}
                  className={`cursor-pointer transition-all ${
                    selectedOrder?.id === order.id ? "ring-2 ring-primary" : "hover-elevate"
                  }`}
                  onClick={() => setSelectedOrder(order)}
                  data-testid={`order-row-${order.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold">{order.serviceName}</h3>
                          {getStatusBadge(order.status)}
                          {order.needsHumanReview && (
                            <Badge variant="destructive" className="bg-orange-500">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Needs Review
                            </Badge>
                          )}
                          {order.aiProcessedAt && order.qualityPassed && (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              <Bot className="h-3 w-3 mr-1" />
                              AI Passed
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Order #{order.id.slice(0, 8)} • {formatDate(order.createdAt)} • {formatPrice(order.amount)}
                          {order.qualityScore !== null && order.qualityScore !== undefined && (
                            <span className="ml-2">• Quality: {order.qualityScore}%</span>
                          )}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" data-testid={`button-view-${order.id}`}>
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">No Orders Found</h3>
                  <p className="text-muted-foreground">
                    {statusFilter === "all" 
                      ? "No service orders have been placed yet."
                      : `No orders with status "${statusFilter}" found.`}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            {selectedOrder ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Order Details</CardTitle>
                    <CardDescription>#{selectedOrder.id.slice(0, 8)}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-muted-foreground">Service</Label>
                      <p className="font-medium">{selectedOrder.serviceName}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Amount</Label>
                      <p className="font-medium">{formatPrice(selectedOrder.amount)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Status</Label>
                      <Select
                        value={selectedOrder.status}
                        onValueChange={(value) => {
                          updateOrderMutation.mutate({ id: selectedOrder.id, status: value });
                          setSelectedOrder({ ...selectedOrder, status: value });
                        }}
                      >
                        <SelectTrigger className="mt-1" data-testid="select-order-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                          <SelectItem value="processing">Processing</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedOrder.paymentRef && (
                      <div>
                        <Label className="text-muted-foreground">Payment Reference</Label>
                        <p className="font-mono text-sm mt-1 break-all">{selectedOrder.paymentRef}</p>
                      </div>
                    )}
                    {selectedOrder.paymentMethod && (
                      <div>
                        <Label className="text-muted-foreground">Payment Method</Label>
                        <p className="text-sm mt-1 capitalize">{selectedOrder.paymentMethod.replace(/_/g, " ")}</p>
                      </div>
                    )}
                    <div>
                      <Label className="text-muted-foreground">Created</Label>
                      <p className="text-sm">{formatDate(selectedOrder.createdAt)}</p>
                    </div>
                    {selectedOrder.completedAt && (
                      <div>
                        <Label className="text-muted-foreground">Completed</Label>
                        <p className="text-sm text-green-600">{formatDate(selectedOrder.completedAt)}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {intakeData && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <User className="h-5 w-5" />
                        Customer Info
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      {intakeData.fullName && (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span>{intakeData.fullName}</span>
                        </div>
                      )}
                      {intakeData.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span>{intakeData.email}</span>
                        </div>
                      )}
                      {intakeData.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span>{intakeData.phone}</span>
                        </div>
                      )}
                      {intakeData.targetCountry && (
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span>{intakeData.targetCountry}</span>
                        </div>
                      )}
                      {intakeData.currentRole && (
                        <div className="flex items-center gap-2">
                          <Briefcase className="h-4 w-4 text-muted-foreground" />
                          <span>{intakeData.currentRole} ({intakeData.yearsExperience})</span>
                        </div>
                      )}
                      {intakeData.additionalInfo && (
                        <div className="pt-2 border-t">
                          <Label className="text-muted-foreground">Additional Notes</Label>
                          <p className="mt-1 text-sm">{intakeData.additionalInfo}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* AI Processing Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Bot className="h-5 w-5" />
                      AI Processing
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {selectedOrder.aiProcessedAt ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Quality Score</span>
                          <Badge 
                            variant={selectedOrder.qualityPassed ? "default" : "destructive"}
                            className={selectedOrder.qualityPassed ? "bg-green-500" : ""}
                          >
                            {selectedOrder.qualityScore ?? 0}%
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Status</span>
                          <span className="text-sm">
                            {selectedOrder.qualityPassed ? "Passed" : "Failed - Needs Review"}
                          </span>
                        </div>
                        {selectedOrder.needsHumanReview && (
                          <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded border border-orange-200 dark:border-orange-800">
                            <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 mb-2">
                              <AlertTriangle className="h-4 w-4" />
                              <span className="font-medium">Human Review Required</span>
                            </div>
                            <p className="text-sm text-muted-foreground mb-3">
                              AI output needs review before delivery.
                            </p>
                            <Button
                              size="sm"
                              onClick={() => {
                                setEditedContent((selectedOrder.aiOutput as any)?.content || "");
                                setReviewDialog(true);
                              }}
                              data-testid="button-review-order"
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              Review & Approve
                            </Button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-4">
                        <p className="text-sm text-muted-foreground mb-3">
                          Not yet processed by AI
                        </p>
                        {selectedOrder.status === "processing" && (
                          <Button
                            size="sm"
                            onClick={() => processOrderMutation.mutate(selectedOrder.id)}
                            disabled={processOrderMutation.isPending}
                            data-testid="button-process-single"
                          >
                            {processOrderMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Zap className="h-4 w-4 mr-2" />
                            )}
                            Process with AI
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Download className="h-5 w-5" />
                        Deliverables
                      </CardTitle>
                      <Button size="sm" onClick={() => setUploadDialog(true)} data-testid="button-upload-deliverable">
                        <Upload className="h-4 w-4 mr-1" />
                        Upload
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {orderDetails?.deliverables && orderDetails.deliverables.length > 0 ? (
                      <div className="space-y-2">
                        {orderDetails.deliverables.map((d) => (
                          <div key={d.id} className="flex items-center justify-between p-2 bg-muted rounded">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4" />
                              <span className="text-sm">{d.fileName}</span>
                            </div>
                            <Badge variant="outline">{d.downloadCount} downloads</Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No deliverables uploaded yet
                      </p>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <Eye className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">Select an order to view details</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <Dialog open={uploadDialog} onOpenChange={setUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Deliverable</DialogTitle>
            <DialogDescription>
              Upload a completed file for the customer to download.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>File</Label>
              <Input
                type="file"
                onChange={handleFileChange}
                className="mt-1"
                data-testid="input-file-upload"
              />
              {uploadData.fileName && (
                <p className="text-sm text-muted-foreground mt-1">Selected: {uploadData.fileName}</p>
              )}
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea
                value={uploadData.description}
                onChange={(e) => setUploadData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="e.g., Optimized CV for tech roles"
                className="mt-1"
                data-testid="input-file-description"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setUploadDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleUploadSubmit}
                disabled={!uploadData.fileName || uploadDeliverableMutation.isPending}
                data-testid="button-confirm-upload"
              >
                {uploadDeliverableMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Upload
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Human Review Dialog */}
      <Dialog open={reviewDialog} onOpenChange={setReviewDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Human Review Required
            </DialogTitle>
            <DialogDescription>
              Review the AI-generated content and approve or request reprocessing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {(() => {
              const checkData = selectedOrder?.qualityCheckData;
              if (!checkData || typeof checkData !== 'object') return null;
              const issues = (checkData as Record<string, unknown>)?.issues;
              if (!Array.isArray(issues)) return null;
              return (
                <div className="bg-muted p-3 rounded">
                  <h4 className="font-medium mb-2">Quality Check Issues:</h4>
                  <ul className="list-disc list-inside text-sm text-muted-foreground">
                    {(issues as string[]).map((issue: string, i: number) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                </div>
              );
            })()}
            
            <div>
              <Label>AI Generated Content (editable)</Label>
              <Textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="mt-1 min-h-[300px] font-mono text-sm"
                placeholder="AI generated content will appear here..."
                data-testid="textarea-ai-content"
              />
            </div>

            <div>
              <Label>Review Notes</Label>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Add notes about your review..."
                className="mt-1"
                data-testid="textarea-review-notes"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setReviewDialog(false)}>
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (selectedOrder) {
                    reviewOrderMutation.mutate({
                      orderId: selectedOrder.id,
                      action: "reprocess",
                      notes: reviewNotes,
                    });
                  }
                }}
                disabled={reviewOrderMutation.isPending}
                data-testid="button-reprocess"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Reprocess with AI
              </Button>
              <Button
                onClick={() => {
                  if (selectedOrder) {
                    reviewOrderMutation.mutate({
                      orderId: selectedOrder.id,
                      action: "approve",
                      notes: reviewNotes,
                      editedContent,
                    });
                  }
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
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
