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
import { Plus, Edit, Trash2, Loader2 } from "lucide-react";

interface Service {
  id: number;
  name: string;
  description: string | null;
  price: number;
  isActive: boolean;
}

export default function AdminServices() {
  const { toast } = useToast();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [newService, setNewService] = useState({
    name: "",
    description: "",
    price: "",
  });

  const { data: services, isLoading } = useQuery<Service[]>({
    queryKey: ["/api/admin/services"],
  });

  const addMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; price: number }) => {
      return apiRequest("POST", "/api/admin/services", data);
    },
    onSuccess: () => {
      toast({ title: "Service added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/services"] });
      setIsAddOpen(false);
      setNewService({ name: "", description: "", price: "" });
    },
    onError: () => {
      toast({ title: "Failed to add service", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Service> }) => {
      return apiRequest("PATCH", `/api/admin/services/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Service updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/services"] });
      setEditingService(null);
    },
    onError: () => {
      toast({ title: "Failed to update service", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/admin/services/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Service deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/services"] });
    },
    onError: () => {
      toast({ title: "Failed to delete service", variant: "destructive" });
    },
  });

  const handleAdd = () => {
    if (!newService.name || !newService.price) {
      toast({ title: "Please fill required fields", variant: "destructive" });
      return;
    }
    addMutation.mutate({
      name: newService.name,
      description: newService.description,
      price: parseInt(newService.price),
    });
  };

  const handleUpdate = () => {
    if (!editingService) return;
    updateMutation.mutate({
      id: editingService.id,
      data: {
        name: editingService.name,
        description: editingService.description,
        price: editingService.price,
        isActive: editingService.isActive,
      },
    });
  };

  return (
    <AdminLayout title="Services">
      <div className="space-y-4">
        <div className="flex justify-end">
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-service">
                <Plus className="h-4 w-4 mr-2" />
                Add Service
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Service</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input
                    placeholder="e.g., CV Review"
                    value={newService.name}
                    onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                    data-testid="input-service-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Price (KES) *</Label>
                  <Input
                    type="number"
                    placeholder="e.g., 1500"
                    value={newService.price}
                    onChange={(e) => setNewService({ ...newService, price: e.target.value })}
                    data-testid="input-service-price"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    placeholder="Describe the service..."
                    value={newService.description}
                    onChange={(e) => setNewService({ ...newService, description: e.target.value })}
                    data-testid="input-service-description"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setIsAddOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAdd}
                    disabled={addMutation.isPending}
                    data-testid="button-save-service"
                  >
                    {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Service"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-4 w-60" />
                    </div>
                    <Skeleton className="h-8 w-24" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-4 font-medium text-sm">Service Name</th>
                      <th className="text-right p-4 font-medium text-sm">Price</th>
                      <th className="text-left p-4 font-medium text-sm hidden sm:table-cell">Status</th>
                      <th className="text-right p-4 font-medium text-sm">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services?.map((service) => (
                      <tr
                        key={service.id}
                        className="border-b last:border-0"
                        data-testid={`row-service-${service.id}`}
                      >
                        <td className="p-4">
                          <div>
                            <p className="font-medium">{service.name}</p>
                            {service.description && (
                              <p className="text-sm text-muted-foreground line-clamp-1">
                                {service.description}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-right font-medium">
                          KES {service.price.toLocaleString()}
                        </td>
                        <td className="p-4 hidden sm:table-cell">
                          <Badge variant={service.isActive ? "default" : "secondary"}>
                            {service.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setEditingService(service)}
                              data-testid={`button-edit-service-${service.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => deleteMutation.mutate(service.id)}
                              data-testid={`button-delete-service-${service.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {services?.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">
                    No services found. Click "Add Service" to create one.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!editingService} onOpenChange={() => setEditingService(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Service</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={editingService?.name || ""}
                  onChange={(e) =>
                    setEditingService((prev) => (prev ? { ...prev, name: e.target.value } : null))
                  }
                  data-testid="input-edit-service-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Price (KES)</Label>
                <Input
                  type="number"
                  value={editingService?.price || ""}
                  onChange={(e) =>
                    setEditingService((prev) =>
                      prev ? { ...prev, price: parseInt(e.target.value) || 0 } : null
                    )
                  }
                  data-testid="input-edit-service-price"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editingService?.description || ""}
                  onChange={(e) =>
                    setEditingService((prev) =>
                      prev ? { ...prev, description: e.target.value } : null
                    )
                  }
                  data-testid="input-edit-service-description"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={editingService?.isActive ? "active" : "inactive"}
                  onValueChange={(value) =>
                    setEditingService((prev) =>
                      prev ? { ...prev, isActive: value === "active" } : null
                    )
                  }
                >
                  <SelectTrigger data-testid="select-edit-service-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditingService(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdate}
                  disabled={updateMutation.isPending}
                  data-testid="button-update-service"
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
