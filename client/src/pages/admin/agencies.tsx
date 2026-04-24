import { useState, useRef } from "react";
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
import { Plus, Edit, Trash2, Loader2, Search, Upload, AlertTriangle, FileSpreadsheet, Download } from "lucide-react";

interface NeaAgency {
  id: string;
  agencyName: string;
  licenseNumber: string;
  issueDate: string;
  expiryDate: string;
  statusOverride: string | null;
  notes: string | null;
  isPublished: boolean;
  lastUpdated: string;
  updatedBy: string | null;
}

interface AgencyReport {
  id: string;
  agencyId: string | null;
  agencyName: string;
  reporterEmail: string | null;
  reporterPhone: string | null;
  description: string;
  status: string;
  createdAt: string;
}

function getAgencyStatus(agency: NeaAgency): { status: string; color: "green" | "red" | "orange" } {
  if (agency.statusOverride === "suspended") {
    return { status: "Suspended", color: "orange" };
  }
  const today = new Date();
  const expiryDate = new Date(agency.expiryDate);
  if (expiryDate < today) {
    return { status: "Expired", color: "red" };
  }
  return { status: "Active", color: "green" };
}

export default function AdminAgencies() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isReportsOpen, setIsReportsOpen] = useState(false);
  const [editingAgency, setEditingAgency] = useState<NeaAgency | null>(null);
  const [bulkData, setBulkData] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newAgency, setNewAgency] = useState({
    agencyName: "",
    licenseNumber: "",
    issueDate: "",
    expiryDate: "",
    statusOverride: "",
    notes: "",
    isPublished: true,
  });

  const { data: agencies, isLoading } = useQuery<NeaAgency[]>({
    queryKey: ["/api/admin/nea-agencies", searchQuery],
    queryFn: async () => {
      const url = searchQuery
        ? `/api/admin/nea-agencies?search=${encodeURIComponent(searchQuery)}`
        : "/api/admin/nea-agencies";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch agencies");
      return res.json();
    },
  });

  const { data: reports } = useQuery<AgencyReport[]>({
    queryKey: ["/api/admin/agency-reports"],
  });

  const addMutation = useMutation({
    mutationFn: async (data: typeof newAgency) => {
      return apiRequest("POST", "/api/admin/nea-agencies", data);
    },
    onSuccess: () => {
      toast({ title: "Agency added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/nea-agencies"] });
      setIsAddOpen(false);
      setNewAgency({
        agencyName: "",
        licenseNumber: "",
        issueDate: "",
        expiryDate: "",
        statusOverride: "",
        notes: "",
        isPublished: true,
      });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to add agency", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<NeaAgency> }) => {
      return apiRequest("PATCH", `/api/admin/nea-agencies/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Agency updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/nea-agencies"] });
      setEditingAgency(null);
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to update agency", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/nea-agencies/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Agency deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/nea-agencies"] });
    },
    onError: () => {
      toast({ title: "Failed to delete agency", variant: "destructive" });
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async (agencies: any[]) => {
      return apiRequest("POST", "/api/admin/nea-agencies/bulk", { agencies });
    },
    onSuccess: (data: any) => {
      toast({ title: `${data.count} agencies imported successfully` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/nea-agencies"] });
      setIsBulkOpen(false);
      setBulkData("");
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to import agencies", variant: "destructive" });
    },
  });

  const updateReportMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/admin/agency-reports/${id}/status`, { status });
    },
    onSuccess: () => {
      toast({ title: "Report status updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agency-reports"] });
    },
  });

  const handleAdd = () => {
    if (!newAgency.agencyName || !newAgency.licenseNumber || !newAgency.issueDate || !newAgency.expiryDate) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    addMutation.mutate(newAgency);
  };

  const handleUpdate = () => {
    if (!editingAgency) return;
    updateMutation.mutate({
      id: editingAgency.id,
      data: {
        agencyName: editingAgency.agencyName,
        licenseNumber: editingAgency.licenseNumber,
        issueDate: editingAgency.issueDate,
        expiryDate: editingAgency.expiryDate,
        statusOverride: editingAgency.statusOverride,
        notes: editingAgency.notes,
        isPublished: editingAgency.isPublished,
      },
    });
  };

  const handleBulkImport = () => {
    try {
      const lines = bulkData.trim().split("\n");
      if (lines.length < 2) {
        toast({ title: "Please provide data with headers and at least one row", variant: "destructive" });
        return;
      }
      const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/['"]/g, ""));
      const agencies = lines.slice(1).map(line => {
        const values = line.split(",").map(v => v.trim().replace(/['"]/g, ""));
        const agency: any = {};
        headers.forEach((header, i) => {
          if (header.includes("name") && header.includes("agency")) agency.agencyName = values[i];
          else if (header.includes("license") || header === "license_number") agency.licenseNumber = values[i];
          else if (header.includes("issue")) agency.issueDate = values[i];
          else if (header.includes("expir")) agency.expiryDate = values[i];
          else if (header.includes("note")) agency.notes = values[i];
        });
        return agency;
      }).filter(a => a.agencyName && a.licenseNumber && a.issueDate && a.expiryDate);
      
      if (agencies.length === 0) {
        toast({ title: "No valid agencies found in the data", variant: "destructive" });
        return;
      }
      bulkMutation.mutate(agencies);
    } catch (e) {
      toast({ title: "Failed to parse CSV data", variant: "destructive" });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setBulkData(text);
    };
    reader.readAsText(file);
  };

  const pendingReports = reports?.filter(r => r.status === "pending") || [];

  return (
    <AdminLayout title="NEA Agency Registry">
      <div className="space-y-4">
        <Card className="p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-800 dark:text-amber-200">
              <p className="font-medium">Legal Disclaimer</p>
              <p className="text-amber-700 dark:text-amber-300">
                Agency status information is provided for public awareness only. This platform is not affiliated with or endorsed by the National Employment Authority. Status may change. Always confirm directly with NEA.
              </p>
            </div>
          </div>
        </Card>

        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or license..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-agencies"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {pendingReports.length > 0 && (
              <Button variant="outline" onClick={() => setIsReportsOpen(true)} data-testid="button-view-reports">
                <AlertTriangle className="h-4 w-4 mr-2 text-amber-500" />
                Reports ({pendingReports.length})
              </Button>
            )}
            <a href="/api/admin/nea-agencies/download" download>
              <Button variant="outline" data-testid="button-download-agencies">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </a>
            <Dialog open={isBulkOpen} onOpenChange={setIsBulkOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="button-bulk-upload">
                  <Upload className="h-4 w-4 mr-2" />
                  Bulk Upload
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Bulk Import Agencies</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="flex gap-2">
                    <input
                      type="file"
                      accept=".csv,.txt"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Upload CSV
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label>Paste CSV Data</Label>
                    <Textarea
                      placeholder="agency_name,license_number,issue_date,expiry_date,notes&#10;Example Agency,NEA/001/2024,2024-01-01,2025-01-01,Optional notes"
                      value={bulkData}
                      onChange={(e) => setBulkData(e.target.value)}
                      rows={10}
                      className="font-mono text-sm"
                      data-testid="textarea-bulk-data"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Required columns: agency_name, license_number, issue_date (YYYY-MM-DD), expiry_date (YYYY-MM-DD)
                  </p>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsBulkOpen(false)}>Cancel</Button>
                    <Button onClick={handleBulkImport} disabled={bulkMutation.isPending} data-testid="button-import">
                      {bulkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-agency">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Agency
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Agency</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2">
                      <Label>Agency Name *</Label>
                      <Input
                        placeholder="e.g., ABC Employment Agency"
                        value={newAgency.agencyName}
                        onChange={(e) => setNewAgency({ ...newAgency, agencyName: e.target.value })}
                        data-testid="input-agency-name"
                      />
                    </div>
                    <div className="space-y-2 col-span-2 sm:col-span-1">
                      <Label>License Number *</Label>
                      <Input
                        placeholder="e.g., NEA/001/2024"
                        value={newAgency.licenseNumber}
                        onChange={(e) => setNewAgency({ ...newAgency, licenseNumber: e.target.value })}
                        data-testid="input-license-number"
                      />
                    </div>
                    <div className="space-y-2 col-span-2 sm:col-span-1">
                      <Label>Status Override</Label>
                      <Select
                        value={newAgency.statusOverride || "none"}
                        onValueChange={(value) => setNewAgency({ ...newAgency, statusOverride: value === "none" ? "" : value })}
                      >
                        <SelectTrigger data-testid="select-status-override">
                          <SelectValue placeholder="Auto (based on dates)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Auto (based on dates)</SelectItem>
                          <SelectItem value="suspended">Suspended</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Issue Date *</Label>
                      <Input
                        type="date"
                        value={newAgency.issueDate}
                        onChange={(e) => setNewAgency({ ...newAgency, issueDate: e.target.value })}
                        data-testid="input-issue-date"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Expiry Date *</Label>
                      <Input
                        type="date"
                        value={newAgency.expiryDate}
                        onChange={(e) => setNewAgency({ ...newAgency, expiryDate: e.target.value })}
                        data-testid="input-expiry-date"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes (visible to users)</Label>
                    <Textarea
                      placeholder="Warning or additional information..."
                      value={newAgency.notes}
                      onChange={(e) => setNewAgency({ ...newAgency, notes: e.target.value })}
                      data-testid="input-agency-notes"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                    <Button onClick={handleAdd} disabled={addMutation.isPending} data-testid="button-save-agency">
                      {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Agency"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-4 w-32" />
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
                      <th className="text-left p-4 font-medium text-sm">Agency Name</th>
                      <th className="text-left p-4 font-medium text-sm hidden sm:table-cell">License</th>
                      <th className="text-left p-4 font-medium text-sm hidden md:table-cell">Expiry</th>
                      <th className="text-center p-4 font-medium text-sm">Status</th>
                      <th className="text-right p-4 font-medium text-sm">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agencies?.map((agency) => {
                      const status = getAgencyStatus(agency);
                      return (
                        <tr key={agency.id} className="border-b last:border-0" data-testid={`row-agency-${agency.id}`}>
                          <td className="p-4">
                            <div>
                              <p className="font-medium">{agency.agencyName}</p>
                              <p className="text-sm text-muted-foreground sm:hidden">{agency.licenseNumber}</p>
                              {agency.notes && (
                                <p className="text-xs text-amber-600 mt-1 line-clamp-1">{agency.notes}</p>
                              )}
                            </div>
                          </td>
                          <td className="p-4 hidden sm:table-cell">
                            <code className="text-sm bg-muted px-2 py-1 rounded">{agency.licenseNumber}</code>
                          </td>
                          <td className="p-4 hidden md:table-cell text-sm">
                            {new Date(agency.expiryDate).toLocaleDateString()}
                          </td>
                          <td className="p-4 text-center">
                            <Badge
                              variant={status.color === "green" ? "default" : status.color === "red" ? "destructive" : "secondary"}
                              className={status.color === "orange" ? "bg-amber-500 text-white" : ""}
                            >
                              {status.status}
                            </Badge>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setEditingAgency(agency)}
                                data-testid={`button-edit-agency-${agency.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => {
                                  if (confirm("Are you sure you want to delete this agency?")) {
                                    deleteMutation.mutate(agency.id);
                                  }
                                }}
                                data-testid={`button-delete-agency-${agency.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {agencies?.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">
                    No agencies found. Click "Add Agency" or "Bulk Upload" to add agencies.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!editingAgency} onOpenChange={() => setEditingAgency(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Agency</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label>Agency Name</Label>
                  <Input
                    value={editingAgency?.agencyName || ""}
                    onChange={(e) => setEditingAgency(prev => prev ? { ...prev, agencyName: e.target.value } : null)}
                    data-testid="input-edit-agency-name"
                  />
                </div>
                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <Label>License Number</Label>
                  <Input
                    value={editingAgency?.licenseNumber || ""}
                    onChange={(e) => setEditingAgency(prev => prev ? { ...prev, licenseNumber: e.target.value } : null)}
                    data-testid="input-edit-license-number"
                  />
                </div>
                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <Label>Status Override</Label>
                  <Select
                    value={editingAgency?.statusOverride || "none"}
                    onValueChange={(value) => setEditingAgency(prev => prev ? { ...prev, statusOverride: value === "none" ? null : value } : null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Auto (based on dates)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Auto (based on dates)</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Issue Date</Label>
                  <Input
                    type="date"
                    value={editingAgency?.issueDate ? new Date(editingAgency.issueDate).toISOString().split("T")[0] : ""}
                    onChange={(e) => setEditingAgency(prev => prev ? { ...prev, issueDate: e.target.value } : null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Expiry Date</Label>
                  <Input
                    type="date"
                    value={editingAgency?.expiryDate ? new Date(editingAgency.expiryDate).toISOString().split("T")[0] : ""}
                    onChange={(e) => setEditingAgency(prev => prev ? { ...prev, expiryDate: e.target.value } : null)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={editingAgency?.notes || ""}
                  onChange={(e) => setEditingAgency(prev => prev ? { ...prev, notes: e.target.value } : null)}
                />
              </div>
              <div className="space-y-2">
                <Label>Published</Label>
                <Select
                  value={editingAgency?.isPublished ? "yes" : "no"}
                  onValueChange={(value) => setEditingAgency(prev => prev ? { ...prev, isPublished: value === "yes" } : null)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes (visible to users)</SelectItem>
                    <SelectItem value="no">No (hidden)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditingAgency(null)}>Cancel</Button>
                <Button onClick={handleUpdate} disabled={updateMutation.isPending} data-testid="button-update-agency">
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isReportsOpen} onOpenChange={setIsReportsOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Suspicious Agency Reports</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {reports?.map(report => (
                <Card key={report.id} className="p-4">
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-1 flex-1">
                      <p className="font-medium">{report.agencyName}</p>
                      <p className="text-sm text-muted-foreground">{report.description}</p>
                      {(report.reporterEmail || report.reporterPhone) && (
                        <p className="text-xs text-muted-foreground">
                          Contact: {report.reporterEmail || report.reporterPhone}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {new Date(report.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <Select
                      value={report.status}
                      onValueChange={(status) => updateReportMutation.mutate({ id: report.id, status })}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="reviewed">Reviewed</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="dismissed">Dismissed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </Card>
              ))}
              {reports?.length === 0 && (
                <p className="text-center text-muted-foreground py-8">No reports submitted yet.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
