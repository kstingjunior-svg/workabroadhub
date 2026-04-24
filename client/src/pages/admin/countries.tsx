import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import AdminLayout from "@/components/admin-layout";
import {
  Plus,
  Edit,
  Trash2,
  ExternalLink,
  Loader2,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CountryWithDetails, JobLink } from "@shared/schema";

export default function AdminCountries() {
  const { toast } = useToast();
  const [selectedCountry, setSelectedCountry] = useState<CountryWithDetails | null>(null);
  const [isAddLinkOpen, setIsAddLinkOpen] = useState(false);
  const [newLink, setNewLink] = useState({ name: "", url: "" });
  const [editingLink, setEditingLink] = useState<JobLink | null>(null);

  const { data: countries, isLoading } = useQuery<CountryWithDetails[]>({
    queryKey: ["/api/admin/countries"],
  });

  const addLinkMutation = useMutation({
    mutationFn: async (data: { countryId: string; name: string; url: string }) => {
      return apiRequest("POST", "/api/admin/job-links", data);
    },
    onSuccess: () => {
      toast({ title: "Link added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/countries"] });
      setIsAddLinkOpen(false);
      setNewLink({ name: "", url: "" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add link", description: error.message, variant: "destructive" });
    },
  });

  const updateLinkMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PATCH", `/api/admin/job-links/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Link updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/countries"] });
      setEditingLink(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update link", description: error.message, variant: "destructive" });
    },
  });

  const deleteLinkMutation = useMutation({
    mutationFn: async (linkId: string) => {
      return apiRequest("DELETE", `/api/admin/job-links/${linkId}`);
    },
    onSuccess: () => {
      toast({ title: "Link deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/countries"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete link", description: error.message, variant: "destructive" });
    },
  });

  const toggleLinkMutation = useMutation({
    mutationFn: async (linkId: string) => {
      return apiRequest("PATCH", `/api/admin/job-links/${linkId}/toggle`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/countries"] });
    },
  });

  const handleAddLink = () => {
    if (!selectedCountry || !newLink.name || !newLink.url) {
      toast({ title: "Please fill all fields", variant: "destructive" });
      return;
    }
    addLinkMutation.mutate({
      countryId: selectedCountry.id,
      name: newLink.name,
      url: newLink.url,
    });
  };

  const handleUpdateLink = () => {
    if (!editingLink) return;
    updateLinkMutation.mutate({
      id: editingLink.id,
      data: { name: editingLink.name, url: editingLink.url },
    });
  };

  if (selectedCountry) {
    const country = countries?.find((c) => c.id === selectedCountry.id) || selectedCountry;
    
    return (
      <AdminLayout title={`${country.name} - Job Links`} showBackButton>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <Button variant="ghost" onClick={() => setSelectedCountry(null)} className="w-fit">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Countries
            </Button>
            <Dialog open={isAddLinkOpen} onOpenChange={setIsAddLinkOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-job-link">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Job Link
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Job Portal Link</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Portal Name</Label>
                    <Input
                      placeholder="e.g., Indeed USA"
                      value={newLink.name}
                      onChange={(e) => setNewLink({ ...newLink, name: e.target.value })}
                      data-testid="input-link-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>URL</Label>
                    <Input
                      placeholder="https://www.indeed.com"
                      value={newLink.url}
                      onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
                      data-testid="input-link-url"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setIsAddLinkOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleAddLink}
                      disabled={addLinkMutation.isPending}
                      data-testid="button-save-link"
                    >
                      {addLinkMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Add Link"
                      )}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <span className="text-3xl">{country.flagEmoji}</span>
                {country.name} Job Portal Links
              </CardTitle>
            </CardHeader>
            <CardContent>
              {country.jobLinks && country.jobLinks.length > 0 ? (
                <div className="space-y-3">
                  {country.jobLinks.map((link) => (
                    <div
                      key={link.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border"
                      data-testid={`job-link-${link.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium">{link.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{link.url}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge
                          variant={link.isActive ? "outline" : "secondary"}
                          className="cursor-pointer"
                          onClick={() => toggleLinkMutation.mutate(link.id)}
                        >
                          {link.isActive ? "Active" : "Inactive"}
                        </Badge>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditingLink(link)}
                          data-testid={`button-edit-link-${link.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => deleteLinkMutation.mutate(link.id)}
                          data-testid={`button-delete-link-${link.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  No job links added yet. Click "Add Job Link" to get started.
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={!!editingLink} onOpenChange={() => setEditingLink(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Job Link</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Portal Name</Label>
                  <Input
                    value={editingLink?.name || ""}
                    onChange={(e) =>
                      setEditingLink((prev) => (prev ? { ...prev, name: e.target.value } : null))
                    }
                    data-testid="input-edit-link-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>URL</Label>
                  <Input
                    value={editingLink?.url || ""}
                    onChange={(e) =>
                      setEditingLink((prev) => (prev ? { ...prev, url: e.target.value } : null))
                    }
                    data-testid="input-edit-link-url"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setEditingLink(null)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleUpdateLink}
                    disabled={updateLinkMutation.isPending}
                    data-testid="button-update-link"
                  >
                    {updateLinkMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Countries">
      <div className="space-y-4">
        {isLoading ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-12 w-12 rounded-full mb-4" />
                  <Skeleton className="h-6 w-32 mb-2" />
                  <Skeleton className="h-4 w-24" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {countries?.map((country) => (
              <Card
                key={country.id}
                className="hover-elevate cursor-pointer"
                onClick={() => setSelectedCountry(country)}
                data-testid={`card-country-${country.code}`}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <span className="text-4xl">{country.flagEmoji}</span>
                      <div>
                        <h3 className="font-semibold text-lg">{country.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {country.jobLinks?.length || 0} Job Links
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={country.isActive ? "default" : "secondary"}>
                        {country.isActive ? "Active" : "Inactive"}
                      </Badge>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
