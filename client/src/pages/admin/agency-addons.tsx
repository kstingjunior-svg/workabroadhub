import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "@/components/admin-layout";
import { Plus, Edit, Trash2, Loader2, Eye, BarChart3, Star, Building2, Globe, CheckCircle } from "lucide-react";
import { SPONSORSHIP_PACKAGES, INDIVIDUAL_ADDONS, ALL_ADDON_TYPES, formatPrice, getDaysRemaining } from "@shared/sponsorship-packages";

interface NeaAgency {
  id: string;
  agencyName: string;
  licenseNumber: string;
  expiryDate: string;
}

interface AgencyAddOn {
  id: string;
  agencyId: string;
  addOnType: string;
  price: number;
  countryId: string | null;
  startDate: string;
  endDate: string;
  isActive: boolean;
  paymentRef: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
}

const PACKAGE_ICONS = {
  basic_sponsored: Building2,
  featured_top: Star,
  premium_banner: Globe,
};

function getAddOnLabel(type: string): string {
  const addon = ALL_ADDON_TYPES[type as keyof typeof ALL_ADDON_TYPES];
  return addon?.name || type;
}

function getAddOnPrice(type: string): number {
  const addon = ALL_ADDON_TYPES[type as keyof typeof ALL_ADDON_TYPES];
  return addon?.price || 0;
}

function getPackageIcon(type: string) {
  return PACKAGE_ICONS[type as keyof typeof PACKAGE_ICONS] || Building2;
}

function getAddonIncludes(type: string) {
  const addon = ALL_ADDON_TYPES[type as keyof typeof ALL_ADDON_TYPES];
  return addon?.includes || {};
}

export default function AdminAgencyAddOns() {
  const { toast } = useToast();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingAddOn, setEditingAddOn] = useState<AgencyAddOn | null>(null);
  const [selectedAgency, setSelectedAgency] = useState<string>("all");
  const [viewingClicks, setViewingClicks] = useState<string | null>(null);
  const [newAddOn, setNewAddOn] = useState({
    agencyId: "",
    addOnType: "basic_sponsored",
    price: 10000,
    countryId: "",
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    paymentRef: "",
    notes: "",
  });

  const { data: agencies = [], isLoading: agenciesLoading } = useQuery<NeaAgency[]>({
    queryKey: ["/api/admin/nea-agencies"],
  });

  const { data: addOns = [], isLoading: addOnsLoading } = useQuery<AgencyAddOn[]>({
    queryKey: ["/api/admin/agency-add-ons", selectedAgency],
    queryFn: () => fetch(`/api/admin/agency-add-ons${selectedAgency && selectedAgency !== "all" ? `?agencyId=${selectedAgency}` : ""}`).then(r => r.json()),
  });

  const { data: countries = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/countries"],
  });

  const { data: clickStats } = useQuery<{ stats: { source: string; count: number }[]; total: number }>({
    queryKey: ["/api/admin/agency-clicks", viewingClicks],
    enabled: !!viewingClicks,
    queryFn: () => fetch(`/api/admin/agency-clicks/${viewingClicks}`).then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof newAddOn) => apiRequest("POST", "/api/admin/agency-add-ons", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agency-add-ons"] });
      setIsAddOpen(false);
      resetForm();
      toast({ title: "Add-on created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create add-on", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: AgencyAddOn) => apiRequest("PATCH", `/api/admin/agency-add-ons/${data.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agency-add-ons"] });
      setEditingAddOn(null);
      toast({ title: "Add-on updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update add-on", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/agency-add-ons/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agency-add-ons"] });
      toast({ title: "Add-on deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete add-on", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setNewAddOn({
      agencyId: "",
      addOnType: "basic_sponsored",
      price: 10000,
      countryId: "",
      startDate: new Date().toISOString().split("T")[0],
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      paymentRef: "",
      notes: "",
    });
  };

  const handleCreate = () => {
    if (!newAddOn.agencyId) {
      toast({ title: "Please select an agency", variant: "destructive" });
      return;
    }
    createMutation.mutate(newAddOn);
  };

  const handleUpdate = () => {
    if (!editingAddOn) return;
    updateMutation.mutate(editingAddOn);
  };

  const getAgencyName = (agencyId: string) => {
    return agencies.find(a => a.id === agencyId)?.agencyName || "Unknown";
  };

  const isAddOnActive = (addOn: AgencyAddOn) => {
    const now = new Date();
    const start = new Date(addOn.startDate);
    const end = new Date(addOn.endDate);
    return addOn.isActive && start <= now && end >= now;
  };

  if (agenciesLoading || addOnsLoading) {
    return (
      <AdminLayout title="Agency Add-Ons">
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Agency Add-Ons">
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Agency Premium Add-Ons</h1>
            <p className="text-muted-foreground">Manage premium features for NEA licensed agencies</p>
          </div>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-addon">
                <Plus className="w-4 h-4 mr-2" />
                Add New Add-On
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Premium Add-On</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Agency</Label>
                  <Select
                    value={newAddOn.agencyId}
                    onValueChange={(v) => setNewAddOn({ ...newAddOn, agencyId: v })}
                  >
                    <SelectTrigger data-testid="select-agency">
                      <SelectValue placeholder="Select agency" />
                    </SelectTrigger>
                    <SelectContent>
                      {agencies.map((agency) => (
                        <SelectItem key={agency.id} value={agency.id}>
                          {agency.agencyName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sponsorship Package</Label>
                  <Select
                    value={newAddOn.addOnType}
                    onValueChange={(v) => {
                      const addon = ALL_ADDON_TYPES[v as keyof typeof ALL_ADDON_TYPES];
                      const startDate = new Date(newAddOn.startDate);
                      const endDate = new Date(startDate);
                      endDate.setDate(endDate.getDate() + (addon?.duration || 30));
                      setNewAddOn({
                        ...newAddOn,
                        addOnType: v,
                        price: addon?.price || 10000,
                        endDate: endDate.toISOString().split("T")[0],
                      });
                    }}
                  >
                    <SelectTrigger data-testid="select-addon-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Packages</div>
                      {Object.values(SPONSORSHIP_PACKAGES).map((pkg) => (
                        <SelectItem key={pkg.id} value={pkg.id}>
                          {pkg.name} (KES {pkg.price.toLocaleString()})
                        </SelectItem>
                      ))}
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground border-t mt-1 pt-1">Individual Add-Ons</div>
                      {Object.values(INDIVIDUAL_ADDONS).map((addon) => (
                        <SelectItem key={addon.id} value={addon.id}>
                          {addon.name} (KES {addon.price.toLocaleString()})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="mt-2 p-3 bg-muted rounded-md">
                    <p className="text-sm font-medium mb-2">Includes:</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {ALL_ADDON_TYPES[newAddOn.addOnType as keyof typeof ALL_ADDON_TYPES]?.features.map((f, i) => (
                        <li key={i} className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={newAddOn.startDate}
                      onChange={(e) => setNewAddOn({ ...newAddOn, startDate: e.target.value })}
                      data-testid="input-start-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={newAddOn.endDate}
                      onChange={(e) => setNewAddOn({ ...newAddOn, endDate: e.target.value })}
                      data-testid="input-end-date"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Price (KES)</Label>
                  <Input
                    type="number"
                    value={newAddOn.price}
                    onChange={(e) => setNewAddOn({ ...newAddOn, price: parseInt(e.target.value) || 0 })}
                    data-testid="input-price"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Payment Reference</Label>
                  <Input
                    value={newAddOn.paymentRef}
                    onChange={(e) => setNewAddOn({ ...newAddOn, paymentRef: e.target.value })}
                    placeholder="M-Pesa transaction code"
                    data-testid="input-payment-ref"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={newAddOn.notes}
                    onChange={(e) => setNewAddOn({ ...newAddOn, notes: e.target.value })}
                    placeholder="Optional notes..."
                    data-testid="input-notes"
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                  data-testid="button-create-addon"
                >
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Create Add-On
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <CardTitle>Premium Add-Ons</CardTitle>
              <Select
                value={selectedAgency}
                onValueChange={setSelectedAgency}
              >
                <SelectTrigger className="w-[250px]" data-testid="select-filter-agency">
                  <SelectValue placeholder="Filter by agency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Agencies</SelectItem>
                  {agencies.map((agency) => (
                    <SelectItem key={agency.id} value={agency.id}>
                      {agency.agencyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agency</TableHead>
                  <TableHead>Add-On Type</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {addOns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No premium add-ons found
                    </TableCell>
                  </TableRow>
                ) : (
                  addOns.map((addOn) => (
                    <TableRow key={addOn.id} data-testid={`row-addon-${addOn.id}`}>
                      <TableCell className="font-medium">{getAgencyName(addOn.agencyId)}</TableCell>
                      <TableCell>{getAddOnLabel(addOn.addOnType)}</TableCell>
                      <TableCell>KES {addOn.price.toLocaleString()}</TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {new Date(addOn.startDate).toLocaleDateString()} - {new Date(addOn.endDate).toLocaleDateString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={isAddOnActive(addOn) ? "default" : "secondary"}>
                          {isAddOnActive(addOn) ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getAddonIncludes(addOn.addOnType)?.clickAnalytics && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setViewingClicks(addOn.agencyId)}
                              data-testid={`button-view-clicks-${addOn.id}`}
                              title="View Click Analytics"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditingAddOn(addOn)}
                            data-testid={`button-edit-addon-${addOn.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              if (confirm("Are you sure you want to delete this add-on?")) {
                                deleteMutation.mutate(addOn.id);
                              }
                            }}
                            data-testid={`button-delete-addon-${addOn.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sponsorship Packages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {Object.values(SPONSORSHIP_PACKAGES).map((pkg) => {
                const Icon = getPackageIcon(pkg.id);
                return (
                  <div key={pkg.id} className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="w-5 h-5 text-primary" />
                      <span className="font-medium">{pkg.name}</span>
                    </div>
                    <p className="text-2xl font-bold text-primary">KES {pkg.price.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground mb-3">{pkg.duration} days</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {pkg.features.map((f, i) => (
                        <li key={i} className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Individual Add-Ons</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
              {Object.values(INDIVIDUAL_ADDONS).map((addon) => (
                <div key={addon.id} className="p-4 border rounded-lg">
                  <span className="font-medium text-sm">{addon.name}</span>
                  <p className="text-xl font-bold text-primary mt-1">KES {addon.price.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{addon.duration} days</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Dialog open={!!editingAddOn} onOpenChange={() => setEditingAddOn(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Add-On</DialogTitle>
            </DialogHeader>
            {editingAddOn && (
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Agency</Label>
                  <Input value={getAgencyName(editingAddOn.agencyId)} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Package / Add-On</Label>
                  <Select
                    value={editingAddOn.addOnType}
                    onValueChange={(v) => setEditingAddOn({ ...editingAddOn, addOnType: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Packages</div>
                      {Object.values(SPONSORSHIP_PACKAGES).map((pkg) => (
                        <SelectItem key={pkg.id} value={pkg.id}>
                          {pkg.name}
                        </SelectItem>
                      ))}
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground border-t mt-1 pt-1">Individual Add-Ons</div>
                      {Object.values(INDIVIDUAL_ADDONS).map((addon) => (
                        <SelectItem key={addon.id} value={addon.id}>
                          {addon.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={editingAddOn.startDate.split("T")[0]}
                      onChange={(e) => setEditingAddOn({ ...editingAddOn, startDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={editingAddOn.endDate.split("T")[0]}
                      onChange={(e) => setEditingAddOn({ ...editingAddOn, endDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Price (KES)</Label>
                  <Input
                    type="number"
                    value={editingAddOn.price}
                    onChange={(e) => setEditingAddOn({ ...editingAddOn, price: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={editingAddOn.isActive}
                    onChange={(e) => setEditingAddOn({ ...editingAddOn, isActive: e.target.checked })}
                  />
                  <Label htmlFor="isActive">Active</Label>
                </div>
                <div className="space-y-2">
                  <Label>Payment Reference</Label>
                  <Input
                    value={editingAddOn.paymentRef || ""}
                    onChange={(e) => setEditingAddOn({ ...editingAddOn, paymentRef: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={editingAddOn.notes || ""}
                    onChange={(e) => setEditingAddOn({ ...editingAddOn, notes: e.target.value })}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleUpdate}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Update Add-On
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={!!viewingClicks} onOpenChange={() => setViewingClicks(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Click Analytics</DialogTitle>
            </DialogHeader>
            {clickStats && (
              <div className="space-y-4 mt-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-4xl font-bold">{clickStats.total}</p>
                  <p className="text-muted-foreground">Total Clicks</p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">By Source</h4>
                  {clickStats.stats.map((stat) => (
                    <div key={stat.source} className="flex justify-between items-center p-2 border rounded">
                      <span className="capitalize">{stat.source}</span>
                      <Badge variant="secondary">{stat.count}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
