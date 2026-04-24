import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar, RefreshCw, CheckCircle, XCircle, Clock, Phone, User,
  MessageCircle, Filter, AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  getAllBookings, updateBookingStatus, type Booking, type BookingStatus,
} from "@/lib/firebase-bookings";

const STATUS_CONFIG: Record<BookingStatus, { label: string; color: string }> = {
  confirmed:  { label: "Confirmed",  color: "bg-blue-100 text-blue-700 border-blue-200" },
  completed:  { label: "Completed",  color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  cancelled:  { label: "Cancelled",  color: "bg-red-100 text-red-700 border-red-200" },
  no_show:    { label: "No Show",    color: "bg-amber-100 text-amber-700 border-amber-200" },
};

function formatDateTime(dt: string) {
  try {
    return new Date(dt).toLocaleString("en-KE", {
      weekday: "short", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return dt;
  }
}

export default function AdminBookingsPage() {
  const { toast } = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<BookingStatus | "all">("all");

  async function loadData() {
    setLoading(true);
    try {
      setBookings(await getAllBookings());
    } catch {
      toast({ title: "Failed to load bookings", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function handleStatus(id: string, status: BookingStatus) {
    setProcessing(id);
    try {
      await updateBookingStatus(id, status);
      setBookings(b => b.map(x => x.id === id ? { ...x, status } : x));
      toast({ title: `Booking marked as ${STATUS_CONFIG[status].label}` });
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  }

  const filtered = filter === "all" ? bookings : bookings.filter(b => b.status === filter);

  const counts = {
    all: bookings.length,
    confirmed: bookings.filter(b => b.status === "confirmed").length,
    completed: bookings.filter(b => b.status === "completed").length,
    cancelled: bookings.filter(b => b.status === "cancelled").length,
    no_show: bookings.filter(b => b.status === "no_show").length,
  };

  // Group upcoming confirmed bookings by advisor
  const advisorLoad: Record<string, number> = {};
  bookings.filter(b => b.status === "confirmed").forEach(b => {
    advisorLoad[b.advisorName] = (advisorLoad[b.advisorName] ?? 0) + 1;
  });

  return (
    <AdminLayout title="Consultation Bookings">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Consultation Bookings</h1>
            <p className="text-slate-500 text-sm mt-1">Firebase real-time booking management</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-2">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { key: "confirmed", label: "Upcoming",  icon: Clock,        color: "text-blue-600" },
            { key: "completed", label: "Completed", icon: CheckCircle,  color: "text-emerald-600" },
            { key: "cancelled", label: "Cancelled", icon: XCircle,      color: "text-red-500" },
            { key: "no_show",   label: "No Shows",  icon: AlertCircle,  color: "text-amber-600" },
          ].map(({ key, label, icon: Icon, color }) => (
            <div key={key} className="bg-white border border-slate-200 rounded-lg p-4 text-center">
              <Icon className={`h-5 w-5 ${color} mx-auto mb-1`} />
              <div className={`text-2xl font-bold ${color}`}>{counts[key as BookingStatus]}</div>
              <div className="text-xs text-slate-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Advisor load */}
        {Object.keys(advisorLoad).length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Advisor queue:</span>
            {Object.entries(advisorLoad).map(([name, count]) => (
              <Badge key={name} variant="secondary" className="gap-1 text-xs">
                {name} — {count} upcoming
              </Badge>
            ))}
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2">
          {[
            { key: "all",       label: `All (${counts.all})` },
            { key: "confirmed", label: `Upcoming (${counts.confirmed})` },
            { key: "completed", label: `Completed (${counts.completed})` },
            { key: "cancelled", label: `Cancelled (${counts.cancelled})` },
            { key: "no_show",   label: `No Shows (${counts.no_show})` },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key as typeof filter)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                filter === key
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
              data-testid={`filter-${key}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Booking list */}
        {loading ? (
          <div className="text-sm text-slate-400 py-8 text-center">Loading bookings…</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-slate-400 py-8 text-center border border-dashed border-slate-200 rounded-lg">
            No bookings in this category
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(b => {
              const { label, color } = STATUS_CONFIG[b.status];
              return (
                <Card key={b.id} data-testid={`booking-card-${b.id}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-start gap-4">
                      {/* Left: booking info */}
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-800">{b.advisorName}</span>
                          <Badge variant="secondary" className="text-xs">{b.advisorSpecialty}</Badge>
                          <Badge variant="outline" className={`text-xs ${color}`}>{label}</Badge>
                        </div>
                        <div className="grid sm:grid-cols-3 gap-x-4 gap-y-1 text-sm text-slate-600">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-slate-400" />
                            {formatDateTime(b.dateTime)}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-slate-400" />
                            {b.userName}
                          </span>
                          <a
                            href={`https://wa.me/${b.whatsappNumber.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-emerald-600 hover:underline"
                          >
                            <Phone className="h-3.5 w-3.5" />
                            {b.whatsappNumber}
                          </a>
                        </div>
                        <p className="text-xs text-slate-400">
                          Booked: {new Date(b.timestamp).toLocaleString()}
                        </p>
                      </div>

                      {/* Right: action buttons */}
                      <div className="flex flex-wrap gap-2 shrink-0">
                        {b.status === "confirmed" && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleStatus(b.id, "completed")}
                              disabled={processing === b.id}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs h-8"
                              data-testid={`complete-booking-${b.id}`}
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                              Mark Done
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleStatus(b.id, "no_show")}
                              disabled={processing === b.id}
                              className="gap-1 text-xs h-8 text-amber-600 border-amber-200"
                              data-testid={`no-show-booking-${b.id}`}
                            >
                              <AlertCircle className="h-3.5 w-3.5" />
                              No Show
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleStatus(b.id, "cancelled")}
                              disabled={processing === b.id}
                              className="gap-1 text-xs h-8 text-red-500"
                              data-testid={`cancel-booking-${b.id}`}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Cancel
                            </Button>
                          </>
                        )}
                        <a
                          href={`https://wa.me/${b.whatsappNumber.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button size="sm" variant="outline" className="gap-1 text-xs h-8 text-emerald-600 border-emerald-200" data-testid={`whatsapp-booking-${b.id}`}>
                            <MessageCircle className="h-3.5 w-3.5" />
                            WhatsApp
                          </Button>
                        </a>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
