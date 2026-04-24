import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, Clock, MessageSquare, Phone, Mail, User, Search, Filter, CheckCircle, XCircle, AlertCircle, Send, ChevronDown, ChevronUp } from "lucide-react";
import type { ConsultationBooking } from "@shared/schema";
import { ref, push, orderByChild, startAt, query as fbQuery, get } from "firebase/database";
import { rtdb } from "@/lib/firebase";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  confirmed: "bg-blue-100 text-blue-800 border-blue-200",
  completed: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
  no_show: "bg-slate-100 text-slate-600 border-slate-200",
};

const STATUS_ICONS: Record<string, any> = {
  pending: AlertCircle,
  confirmed: CheckCircle,
  completed: CheckCircle,
  cancelled: XCircle,
  no_show: XCircle,
};

export default function AdminConsultationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<ConsultationBooking | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [newStatus, setNewStatus] = useState("");

  // Manual signup push
  const [pushOpen, setPushOpen] = useState(false);
  const [pushName, setPushName] = useState("");
  const [pushLocation, setPushLocation] = useState("");
  const [pushDestination, setPushDestination] = useState("");
  const [pushing, setPushing] = useState(false);

  async function handlePushSignup() {
    const name = pushName.trim();
    const location = pushLocation.trim();
    const destination = pushDestination.trim();

    if (!name || !location || !destination) {
      toast({ title: "All fields are required", variant: "destructive" });
      return;
    }
    if (name.length < 2) {
      toast({ title: "Please enter a real name", variant: "destructive" });
      return;
    }

    setPushing(true);
    try {
      // Duplicate check — same name + location within last 5 minutes
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      const signupsRef = ref(rtdb, "signups");
      const recentQ = fbQuery(signupsRef, orderByChild("joined"), startAt(fiveMinutesAgo));
      const snapshot = await get(recentQ);
      if (snapshot.exists()) {
        const existing = Object.values(snapshot.val() as Record<string, any>);
        const duplicate = existing.some(
          (d) =>
            d.firstName?.toLowerCase() === name.toLowerCase() &&
            d.location?.toLowerCase() === location.toLowerCase()
        );
        if (duplicate) {
          toast({
            title: "Duplicate detected",
            description: `${name} from ${location} was already added in the last 5 minutes.`,
            variant: "destructive",
          });
          setPushing(false);
          return;
        }
      }

      // Push to Firebase
      const newRef = push(signupsRef);
      await newRef.set({
        firstName: name,
        location,
        destination,
        joined: Date.now(),
        signupId: newRef.key,
        type: "signup",
        verified: true,
      });

      toast({
        title: "Signup pushed to live feed",
        description: `${name} from ${location} → ${destination} now appears on the landing page.`,
      });
      setPushName("");
      setPushLocation("");
      setPushDestination("");
      setPushOpen(false);
    } catch (err) {
      console.error(err);
      toast({ title: "Failed to push signup", variant: "destructive" });
    } finally {
      setPushing(false);
    }
  }

  const { data: consultations = [], isLoading } = useQuery<ConsultationBooking[]>({
    queryKey: ["/api/admin/consultations"],
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status, advisorNotes }: { id: string; status?: string; advisorNotes?: string }) =>
      apiRequest("PATCH", `/api/admin/consultations/${id}`, { status, advisorNotes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/consultations"] });
      toast({ title: "Updated successfully" });
      setSelected(null);
    },
    onError: () => {
      toast({ title: "Update failed", variant: "destructive" });
    },
  });

  const filtered = consultations.filter(c => {
    const matchSearch = !search ||
      c.userName?.toLowerCase().includes(search.toLowerCase()) ||
      c.userPhone?.includes(search) ||
      c.topic?.toLowerCase().includes(search.toLowerCase()) ||
      c.userEmail?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const counts = {
    all: consultations.length,
    pending: consultations.filter(c => c.status === "pending").length,
    confirmed: consultations.filter(c => c.status === "confirmed").length,
    completed: consultations.filter(c => c.status === "completed").length,
    cancelled: consultations.filter(c => c.status === "cancelled").length,
  };

  function openDetail(c: ConsultationBooking) {
    setSelected(c);
    setAdminNotes(c.advisorNotes || "");
    setNewStatus(c.status || "pending");
  }

  function handleSave() {
    if (!selected) return;
    updateMutation.mutate({
      id: selected.id,
      status: newStatus !== selected.status ? newStatus : undefined,
      advisorNotes: adminNotes,
    });
  }

  return (
    <AdminLayout title="Consultation Bookings">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Consultation Bookings</h1>
            <p className="text-slate-500 text-sm mt-1">Manage and respond to WhatsApp consultation requests</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPushOpen(!pushOpen)}
            className="flex items-center gap-2 border-teal-300 text-teal-700 hover:bg-teal-50 flex-shrink-0"
            data-testid="toggle-push-signup"
          >
            <Send className="h-3.5 w-3.5" />
            Push Signup to Feed
            {pushOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {/* Manual Signup Push Panel */}
        {pushOpen && (
          <Card className="border-teal-200 bg-teal-50/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-teal-800">
                <Send className="h-4 w-4" />
                Push Consultation Signup to Landing Page Feed
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                For clients who signed up via WhatsApp or phone. Appears instantly in the "Recently Joined" section on the landing page. Duplicate check: same name + location within 5 minutes is blocked.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">First Name *</label>
                  <Input
                    placeholder="e.g. John"
                    value={pushName}
                    onChange={(e) => setPushName(e.target.value)}
                    data-testid="push-signup-name"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Location (from) *</label>
                  <Input
                    placeholder="e.g. Mombasa, Kenya"
                    value={pushLocation}
                    onChange={(e) => setPushLocation(e.target.value)}
                    data-testid="push-signup-location"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Destination (going to) *</label>
                  <Input
                    placeholder="e.g. Dubai, UAE"
                    value={pushDestination}
                    onChange={(e) => setPushDestination(e.target.value)}
                    data-testid="push-signup-destination"
                    onKeyDown={(e) => e.key === "Enter" && handlePushSignup()}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={handlePushSignup}
                  disabled={pushing}
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                  data-testid="push-signup-submit"
                >
                  {pushing ? "Pushing…" : "Push to Live Feed"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setPushOpen(false); setPushName(""); setPushLocation(""); setPushDestination(""); }}>
                  Cancel
                </Button>
                <span className="text-xs text-slate-400 ml-auto">Appears on landing page within seconds</span>
              </div>
            </CardContent>
          </Card>
        )}


        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {(["all", "pending", "confirmed", "completed", "cancelled"] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-lg border p-3 text-left transition-all ${statusFilter === s ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
              data-testid={`filter-status-${s}`}
            >
              <div className="text-xl font-bold text-slate-800">{counts[s] ?? 0}</div>
              <div className="text-xs text-slate-500 capitalize mt-0.5">{s}</div>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by name, phone, topic..."
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-consultation-search"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44" data-testid="select-consultation-filter">
              <Filter className="h-4 w-4 mr-2 text-slate-400" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="no_show">No Show</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-lg bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No consultations found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(c => {
              const StatusIcon = STATUS_ICONS[c.status || "pending"] || AlertCircle;
              const date = new Date(c.scheduledDate);
              return (
                <Card
                  key={c.id}
                  className="cursor-pointer hover:shadow-md transition-shadow border-slate-200"
                  onClick={() => openDetail(c)}
                  data-testid={`card-consultation-${c.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                          <User className="h-5 w-5 text-teal-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800 truncate">{c.userName || "Unknown"}</div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                            {c.userPhone && (
                              <span className="flex items-center gap-1 text-xs text-slate-500">
                                <Phone className="h-3 w-3" />{c.userPhone}
                              </span>
                            )}
                            {c.userEmail && (
                              <span className="flex items-center gap-1 text-xs text-slate-500">
                                <Mail className="h-3 w-3" />{c.userEmail}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-1 text-xs text-slate-600">
                            <MessageSquare className="h-3 w-3" />
                            <span className="truncate">{c.topic}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <Badge className={`text-xs border ${STATUS_COLORS[c.status || "pending"]}`}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {c.status || "pending"}
                        </Badge>
                        <div className="text-right">
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <Calendar className="h-3 w-3" />
                            {date.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                            <Clock className="h-3 w-3" />
                            {date.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                      </div>
                    </div>
                    {c.notes && (
                      <div className="mt-3 text-xs text-slate-500 bg-slate-50 rounded p-2 line-clamp-2">{c.notes}</div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Consultation Details</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-slate-500 text-xs mb-1">Name</div>
                  <div className="font-medium">{selected.userName || "—"}</div>
                </div>
                <div>
                  <div className="text-slate-500 text-xs mb-1">Status</div>
                  <Badge className={`text-xs border ${STATUS_COLORS[selected.status || "pending"]}`}>
                    {selected.status || "pending"}
                  </Badge>
                </div>
                <div>
                  <div className="text-slate-500 text-xs mb-1">WhatsApp</div>
                  <a href={`https://wa.me/${selected.userPhone?.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer" className="font-medium text-teal-600 hover:underline">
                    {selected.userPhone || "—"}
                  </a>
                </div>
                <div>
                  <div className="text-slate-500 text-xs mb-1">Email</div>
                  <div className="font-medium">{selected.userEmail || "—"}</div>
                </div>
                <div>
                  <div className="text-slate-500 text-xs mb-1">Date</div>
                  <div className="font-medium">{new Date(selected.scheduledDate).toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
                </div>
                <div>
                  <div className="text-slate-500 text-xs mb-1">Time</div>
                  <div className="font-medium">{new Date(selected.scheduledDate).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-slate-500 text-xs mb-1">Topic</div>
                  <div className="font-medium">{selected.topic}</div>
                </div>
                {selected.notes && (
                  <div className="col-span-2">
                    <div className="text-slate-500 text-xs mb-1">User Notes</div>
                    <div className="text-sm bg-slate-50 rounded p-2">{selected.notes}</div>
                  </div>
                )}
              </div>

              <div className="border-t pt-4 space-y-3">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">Update Status</label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger data-testid="select-update-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="confirmed">Confirmed (sends WhatsApp)</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="no_show">No Show</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">Admin Notes</label>
                  <Textarea
                    value={adminNotes}
                    onChange={e => setAdminNotes(e.target.value)}
                    placeholder="Add internal notes about this consultation..."
                    rows={3}
                    data-testid="textarea-admin-notes"
                  />
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setSelected(null)}>Cancel</Button>
                  <Button
                    className="flex-1 bg-teal-600 hover:bg-teal-700"
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                    data-testid="button-save-consultation"
                  >
                    {updateMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
                <a
                  href={`https://wa.me/${selected.userPhone?.replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2 rounded-lg border border-green-300 text-green-700 text-sm font-medium hover:bg-green-50 transition-colors"
                  data-testid="link-open-whatsapp"
                >
                  <Phone className="h-4 w-4" />
                  Open WhatsApp Chat
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
