import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft,
  Plus,
  Briefcase,
  MapPin,
  Calendar,
  ExternalLink,
  Pencil,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  TrendingUp,
  Building,
  Globe,
  DollarSign,
  StickyNote,
  Bell,
  BellOff,
  AlarmClock,
} from "lucide-react";
import { Link } from "wouter";
import type { TrackedApplication } from "@shared/schema";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  saved: { label: "Saved", color: "bg-gray-500", icon: Clock },
  applied: { label: "Applied", color: "bg-blue-500", icon: Briefcase },
  interviewing: { label: "Interviewing", color: "bg-purple-500", icon: TrendingUp },
  offered: { label: "Offered", color: "bg-green-500", icon: CheckCircle2 },
  accepted: { label: "Accepted", color: "bg-emerald-600", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "bg-red-500", icon: XCircle },
  withdrawn: { label: "Withdrawn", color: "bg-orange-500", icon: XCircle },
};

const COUNTRIES = [
  { code: "usa", name: "USA" },
  { code: "canada", name: "Canada" },
  { code: "uk", name: "United Kingdom" },
  { code: "uae", name: "UAE" },
  { code: "australia", name: "Australia" },
  { code: "europe", name: "Europe" },
];

export default function ApplicationTracker() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<TrackedApplication | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [formData, setFormData] = useState({
    jobTitle: "",
    companyName: "",
    jobUrl: "",
    targetCountry: "",
    salary: "",
    location: "",
    jobType: "",
    source: "",
    status: "saved",
    notes: "",
    appliedAt: "",
    deadline: "",
  });

  const { data: applications, isLoading } = useQuery<TrackedApplication[]>({
    queryKey: ["/api/tracked-applications"],
    enabled: !!user,
  });

  const { data: stats } = useQuery<{ total: number; applied: number; interviewing: number; offered: number }>({
    queryKey: ["/api/tracked-applications/stats"],
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/tracked-applications", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-applications/stats"] });
      toast({ title: "Application tracked!", description: "Your job application has been added." });
      setIsAddOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add application", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PATCH", `/api/tracked-applications/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-applications/stats"] });
      toast({ title: "Updated!", description: "Application details updated." });
      setEditingApp(null);
      resetForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update application", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/tracked-applications/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-applications/stats"] });
      toast({ title: "Deleted", description: "Application removed from tracker." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete application", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      jobTitle: "",
      companyName: "",
      jobUrl: "",
      targetCountry: "",
      salary: "",
      location: "",
      jobType: "",
      source: "",
      status: "saved",
      notes: "",
      appliedAt: "",
      deadline: "",
    });
  };

  const handleSubmit = () => {
    if (!formData.jobTitle || !formData.companyName || !formData.targetCountry) {
      toast({ title: "Missing fields", description: "Please fill in job title, company, and country", variant: "destructive" });
      return;
    }

    if (editingApp) {
      updateMutation.mutate({ id: editingApp.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const openEdit = (app: TrackedApplication) => {
    setEditingApp(app);
    setFormData({
      jobTitle: app.jobTitle,
      companyName: app.companyName,
      jobUrl: app.jobUrl || "",
      targetCountry: app.targetCountry,
      salary: app.salary || "",
      location: app.location || "",
      jobType: app.jobType || "",
      source: app.source || "",
      status: app.status,
      notes: app.notes || "",
      appliedAt: app.appliedAt ? new Date(app.appliedAt).toISOString().split('T')[0] : "",
      deadline: (app as any).deadline ? new Date((app as any).deadline).toISOString().split('T')[0] : "",
    });
  };

  const filteredApplications = applications?.filter(app => {
    const matchesStatus = filterStatus === "all" || app.status === filterStatus;
    const matchesSearch = !searchQuery || 
      app.jobTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.companyName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const formatDate = (date: Date | string | null) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Login Required</h3>
            <p className="text-muted-foreground mb-4">
              Please log in to track your job applications.
            </p>
            <Link href="/">
              <Button>Go to Login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            <div className="flex items-center gap-4">
              <Link href="/dashboard">
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <Briefcase className="h-6 w-6 text-primary" />
                <span className="font-semibold text-lg">Application Tracker</span>
              </div>
            </div>
            <Dialog open={isAddOpen || !!editingApp} onOpenChange={(open) => {
              if (!open) {
                setIsAddOpen(false);
                setEditingApp(null);
                resetForm();
              }
            }}>
              <DialogTrigger asChild>
                <Button onClick={() => setIsAddOpen(true)} data-testid="button-add-application">
                  <Plus className="h-4 w-4 mr-2" />
                  Track New Job
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingApp ? "Edit Application" : "Track New Application"}</DialogTitle>
                  <DialogDescription>
                    {editingApp ? "Update your job application details." : "Add a job you've saved or applied to."}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="jobTitle">Job Title *</Label>
                      <Input
                        id="jobTitle"
                        value={formData.jobTitle}
                        onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                        placeholder="Software Engineer"
                        data-testid="input-job-title"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="companyName">Company *</Label>
                      <Input
                        id="companyName"
                        value={formData.companyName}
                        onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                        placeholder="Google"
                        data-testid="input-company-name"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="targetCountry">Country *</Label>
                      <Select value={formData.targetCountry} onValueChange={(v) => setFormData({ ...formData, targetCountry: v })}>
                        <SelectTrigger data-testid="select-country">
                          <SelectValue placeholder="Select country" />
                        </SelectTrigger>
                        <SelectContent>
                          {COUNTRIES.map(c => (
                            <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="status">Status</Label>
                      <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                        <SelectTrigger data-testid="select-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_CONFIG).map(([key, val]) => (
                            <SelectItem key={key} value={key}>{val.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="jobUrl">Job URL</Label>
                    <Input
                      id="jobUrl"
                      value={formData.jobUrl}
                      onChange={(e) => setFormData({ ...formData, jobUrl: e.target.value })}
                      placeholder="https://careers.google.com/..."
                      data-testid="input-job-url"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="location">Location</Label>
                      <Input
                        id="location"
                        value={formData.location}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                        placeholder="New York, NY"
                        data-testid="input-location"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="salary">Salary</Label>
                      <Input
                        id="salary"
                        value={formData.salary}
                        onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                        placeholder="$120,000/year"
                        data-testid="input-salary"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="jobType">Job Type</Label>
                      <Select value={formData.jobType} onValueChange={(v) => setFormData({ ...formData, jobType: v })}>
                        <SelectTrigger data-testid="select-job-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="full-time">Full-time</SelectItem>
                          <SelectItem value="part-time">Part-time</SelectItem>
                          <SelectItem value="contract">Contract</SelectItem>
                          <SelectItem value="internship">Internship</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="source">Source</Label>
                      <Input
                        id="source"
                        value={formData.source}
                        onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                        placeholder="LinkedIn, Indeed..."
                        data-testid="input-source"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="appliedAt">Date Applied</Label>
                    <Input
                      id="appliedAt"
                      type="date"
                      value={formData.appliedAt}
                      onChange={(e) => setFormData({ ...formData, appliedAt: e.target.value })}
                      data-testid="input-applied-date"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="deadline" className="flex items-center gap-1.5">
                      <AlarmClock className="h-3.5 w-3.5 text-orange-500" />
                      Application Deadline
                      <span className="text-xs text-muted-foreground font-normal">(reminder 3 days before)</span>
                    </Label>
                    <Input
                      id="deadline"
                      type="date"
                      value={formData.deadline}
                      onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                      data-testid="input-deadline"
                    />
                    {formData.deadline && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Bell className="h-3 w-3" />
                        You'll receive an email reminder on {new Date(new Date(formData.deadline).getTime() - 3 * 86400000).toLocaleDateString("en-KE", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Add any notes about this application..."
                      rows={3}
                      data-testid="textarea-notes"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setIsAddOpen(false); setEditingApp(null); resetForm(); }}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleSubmit} 
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-submit-application"
                  >
                    {editingApp ? "Save Changes" : "Add Application"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold">{stats?.total || 0}</p>
                <p className="text-sm text-muted-foreground">Total Tracked</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-500">{stats?.applied || 0}</p>
                <p className="text-sm text-muted-foreground">Applied</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-purple-500">{stats?.interviewing || 0}</p>
                <p className="text-sm text-muted-foreground">Interviewing</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-green-500">{stats?.offered || 0}</p>
                <p className="text-sm text-muted-foreground">Offers</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by job title or company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full sm:w-48" data-testid="select-filter-status">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([key, val]) => (
                <SelectItem key={key} value={key}>{val.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Applications List */}
        {isLoading ? (
          <div className="grid gap-4">
            {[1, 2, 3].map(i => (
              <Card key={i} className="animate-pulse">
                <CardContent className="h-24" />
              </Card>
            ))}
          </div>
        ) : filteredApplications && filteredApplications.length > 0 ? (
          <div className="grid gap-4">
            {filteredApplications.map((app) => {
              const statusConfig = STATUS_CONFIG[app.status] || STATUS_CONFIG.saved;
              const StatusIcon = statusConfig.icon;
              const countryName = COUNTRIES.find(c => c.code === app.targetCountry)?.name || app.targetCountry;

              return (
                <Card key={app.id} className="hover-elevate" data-testid={`application-card-${app.id}`}>
                  <CardContent className="py-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className={`h-10 w-10 rounded-full ${statusConfig.color} flex items-center justify-center flex-shrink-0`}>
                          <StatusIcon className="h-5 w-5 text-white" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-semibold">{app.jobTitle}</h4>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Building className="h-3.5 w-3.5" />
                            <span>{app.companyName}</span>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <Badge variant="outline" className="text-xs gap-1">
                              <Globe className="h-3 w-3" />
                              {countryName}
                            </Badge>
                            {app.location && (
                              <Badge variant="outline" className="text-xs gap-1">
                                <MapPin className="h-3 w-3" />
                                {app.location}
                              </Badge>
                            )}
                            {app.salary && (
                              <Badge variant="outline" className="text-xs gap-1">
                                <DollarSign className="h-3 w-3" />
                                {app.salary}
                              </Badge>
                            )}
                            {app.appliedAt && (
                              <Badge variant="outline" className="text-xs gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDate(app.appliedAt)}
                              </Badge>
                            )}
                            {(app as any).deadline && (() => {
                              const dl = new Date((app as any).deadline);
                              const now = new Date();
                              const daysLeft = Math.ceil((dl.getTime() - now.getTime()) / 86400000);
                              if (daysLeft < 0) return (
                                <Badge className="text-xs gap-1 bg-gray-100 text-gray-500 border border-gray-200">
                                  <AlarmClock className="h-3 w-3" /> Deadline passed
                                </Badge>
                              );
                              const color = daysLeft <= 1
                                ? "bg-red-100 text-red-700 border-red-200"
                                : daysLeft <= 3
                                ? "bg-orange-100 text-orange-700 border-orange-200"
                                : daysLeft <= 7
                                ? "bg-amber-100 text-amber-700 border-amber-200"
                                : "bg-blue-50 text-blue-700 border-blue-200";
                              return (
                                <Badge className={`text-xs gap-1 border ${color}`} data-testid={`badge-deadline-${app.id}`}>
                                  <AlarmClock className="h-3 w-3" />
                                  {daysLeft === 0 ? "Due today!" : `${daysLeft}d left`}
                                </Badge>
                              );
                            })()}
                          </div>
                          {app.notes && (
                            <div className="flex items-start gap-1 mt-2 text-xs text-muted-foreground">
                              <StickyNote className="h-3 w-3 mt-0.5 flex-shrink-0" />
                              <span className="line-clamp-1">{app.notes}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-14 md:ml-0">
                        <Badge className={statusConfig.color}>{statusConfig.label}</Badge>
                        {app.jobUrl && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => window.open(app.jobUrl!, '_blank')}
                            data-testid={`button-open-url-${app.id}`}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => openEdit(app)}
                          data-testid={`button-edit-${app.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => {
                            if (confirm("Delete this application?")) {
                              deleteMutation.mutate(app.id);
                            }
                          }}
                          data-testid={`button-delete-${app.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Applications Yet</h3>
              <p className="text-muted-foreground mb-4">
                Start tracking the jobs you're interested in or have applied to.
              </p>
              <Button onClick={() => setIsAddOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Track Your First Application
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Tips Card */}
        <Card className="bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20">
          <CardContent className="py-6">
            <h3 className="font-semibold mb-2">Tips for Tracking Applications</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>- Keep notes about each application for interview prep</li>
              <li>- Update status regularly to stay organized</li>
              <li>- Track salary ranges to compare offers</li>
              <li>- Note which job boards work best for you</li>
            </ul>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
