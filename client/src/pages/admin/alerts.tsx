import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "@/components/admin-layout";
import { Plus, Edit, Trash2, Loader2, AlertTriangle } from "lucide-react";
import type { CountryWithDetails } from "@shared/schema";

interface ScamAlert {
  id: number;
  countryId: string | null;
  title: string;
  description: string;
  isActive: boolean;
  createdAt: string;
}

export default function AdminAlerts() {
  const { toast } = useToast();
  const [countryFilter, setCountryFilter] = useState("all");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<ScamAlert | null>(null);
  const [newAlert, setNewAlert] = useState({
    title: "",
    description: "",
    countryId: "all",
  });

  const { data: countries } = useQuery<CountryWithDetails[]>({
    queryKey: ["/api/admin/countries"],
  });

  const { data: allAlerts, isLoading } = useQuery<ScamAlert[]>({
    queryKey: ["/api/admin/scam-alerts"],
  });

  const alerts = allAlerts?.filter((alert) => {
    if (countryFilter === "all") return true;
    return alert.countryId === countryFilter;
  });

  const addMutation = useMutation({
    mutationFn: async (data: { title: string; description: string; countryId?: string }) => {
      return apiRequest("POST", "/api/admin/scam-alerts", data);
    },
    onSuccess: () => {
      toast({ title: "Alert added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scam-alerts"] });
      setIsAddOpen(false);
      setNewAlert({ title: "", description: "", countryId: "all" });
    },
    onError: () => {
      toast({ title: "Failed to add alert", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<ScamAlert> }) => {
      return apiRequest("PATCH", `/api/admin/scam-alerts/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Alert updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scam-alerts"] });
      setEditingAlert(null);
    },
    onError: () => {
      toast({ title: "Failed to update alert", variant: "destructive" });
    },
  });

  const handleAdd = () => {
    if (!newAlert.title || !newAlert.description) {
      toast({ title: "Please fill required fields", variant: "destructive" });
      return;
    }
    addMutation.mutate({
      title: newAlert.title,
      description: newAlert.description,
      countryId: newAlert.countryId === "all" ? undefined : newAlert.countryId,
    });
  };

  const handleUpdate = () => {
    if (!editingAlert) return;
    updateMutation.mutate({
      id: editingAlert.id,
      data: {
        title: editingAlert.title,
        description: editingAlert.description,
        isActive: editingAlert.isActive,
      },
    });
  };

  const getCountryName = (countryId: string | null) => {
    if (!countryId) return "All Countries";
    return countries?.find((c) => c.id === countryId)?.name || countryId;
  };

  return (
    <AdminLayout title="Scam Alerts">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Select value={countryFilter} onValueChange={setCountryFilter}>
            <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-country-filter">
              <SelectValue placeholder="Filter by Country" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Countries</SelectItem>
              {countries?.map((country) => (
                <SelectItem key={country.id} value={country.id}>
                  {country.flagEmoji} {country.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-alert">
                <Plus className="h-4 w-4 mr-2" />
                Add Alert
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Scam Alert</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Title *</Label>
                  <Input
                    placeholder="e.g., Fake Visa Agency Warning"
                    value={newAlert.title}
                    onChange={(e) => setNewAlert({ ...newAlert, title: e.target.value })}
                    data-testid="input-alert-title"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Country (optional)</Label>
                  <Select
                    value={newAlert.countryId}
                    onValueChange={(value) => setNewAlert({ ...newAlert, countryId: value })}
                  >
                    <SelectTrigger data-testid="select-alert-country">
                      <SelectValue placeholder="All Countries" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Countries</SelectItem>
                      {countries?.map((country) => (
                        <SelectItem key={country.id} value={country.id}>
                          {country.flagEmoji} {country.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Description *</Label>
                  <Textarea
                    placeholder="Describe the scam and how to avoid it..."
                    value={newAlert.description}
                    onChange={(e) => setNewAlert({ ...newAlert, description: e.target.value })}
                    rows={4}
                    data-testid="input-alert-description"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setIsAddOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAdd}
                    disabled={addMutation.isPending}
                    data-testid="button-save-alert"
                  >
                    {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Alert"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-6 w-48 mb-2" />
                  <Skeleton className="h-4 w-full mb-1" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : alerts && alerts.length > 0 ? (
          <div className="space-y-4">
            {alerts.map((alert) => (
              <Card key={alert.id} data-testid={`card-alert-${alert.id}`}>
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                        <h3 className="font-semibold">{alert.title}</h3>
                        <Badge variant="outline" className="text-xs">
                          {getCountryName(alert.countryId)}
                        </Badge>
                        {!alert.isActive && (
                          <Badge variant="secondary" className="text-xs">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {alert.description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Created: {new Date(alert.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditingAlert(alert)}
                        data-testid={`button-edit-alert-${alert.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                No scam alerts found. Click "Add Alert" to create one.
              </p>
            </CardContent>
          </Card>
        )}

        <Dialog open={!!editingAlert} onOpenChange={() => setEditingAlert(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Scam Alert</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={editingAlert?.title || ""}
                  onChange={(e) =>
                    setEditingAlert((prev) => (prev ? { ...prev, title: e.target.value } : null))
                  }
                  data-testid="input-edit-alert-title"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editingAlert?.description || ""}
                  onChange={(e) =>
                    setEditingAlert((prev) => (prev ? { ...prev, description: e.target.value } : null))
                  }
                  rows={4}
                  data-testid="input-edit-alert-description"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={editingAlert?.isActive ? "active" : "inactive"}
                  onValueChange={(value) =>
                    setEditingAlert((prev) =>
                      prev ? { ...prev, isActive: value === "active" } : null
                    )
                  }
                >
                  <SelectTrigger data-testid="select-edit-alert-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditingAlert(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdate}
                  disabled={updateMutation.isPending}
                  data-testid="button-update-alert"
                >
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
