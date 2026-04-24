import { useEffect, useState, useMemo } from "react";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ref, onValue, off, update, remove,
} from "firebase/database";
import { rtdb } from "@/lib/firebase";
import {
  AlertOctagon, CheckCircle2, Trash2, Bell, RefreshCw,
  Monitor, Globe, Clock, User, Link2, AlertTriangle,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ErrorEntry {
  id: string;
  type: string;
  code: string | number;
  message: string;
  stack?: string;
  url?: string;
  method?: string;
  user?: string;
  userAgent?: string;
  lineno?: number;
  colno?: number;
  timestamp: string;
  resolved: boolean;
  environment?: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  payment:    "bg-amber-100 text-amber-800 border-amber-200",
  network:    "bg-blue-100 text-blue-800 border-blue-200",
  auth:       "bg-purple-100 text-purple-800 border-purple-200",
  validation: "bg-orange-100 text-orange-800 border-orange-200",
  notfound:   "bg-gray-100 text-gray-700 border-gray-200",
  server:     "bg-red-100 text-red-800 border-red-200",
  client:     "bg-rose-100 text-rose-800 border-rose-200",
  general:    "bg-slate-100 text-slate-700 border-slate-200",
};

const ALERT_THRESHOLD = 10;

// ─── Hook: live Firebase error subscription ────────────────────────────────────

function useErrorNodes(origin: "backend" | "frontend"): ErrorEntry[] {
  const [entries, setEntries] = useState<ErrorEntry[]>([]);

  useEffect(() => {
    const r = ref(rtdb, `errors/${origin}`);
    const unsub = onValue(r, (snap) => {
      const val = snap.val() as Record<string, Omit<ErrorEntry, "id">> | null;
      if (!val) { setEntries([]); return; }
      const list: ErrorEntry[] = Object.entries(val)
        .map(([id, e]) => ({ id, ...e }))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setEntries(list);
    });
    return () => off(r, "value", unsub as any);
  }, [origin]);

  return entries;
}

// ─── Sub-component: stat card ─────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent, icon: Icon,
}: {
  label: string; value: number; sub: string; accent: string; icon: React.ElementType;
}) {
  return (
    <Card className="border" style={{ borderColor: "#E2DDD5" }}>
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
            <p className="text-3xl font-bold" style={{ color: accent }}>{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{sub}</p>
          </div>
          <Icon className="h-6 w-6 opacity-30 mt-1" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Sub-component: error row ─────────────────────────────────────────────────

function ErrorRow({
  entry, origin, onResolve, onDelete,
}: {
  entry: ErrorEntry;
  origin: "backend" | "frontend";
  onResolve: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const typeClass = TYPE_COLORS[entry.type] ?? TYPE_COLORS.general;
  const ts = new Date(entry.timestamp);
  const timeStr = isNaN(ts.getTime())
    ? entry.timestamp
    : ts.toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div
      className={`rounded-lg border p-4 transition-opacity ${entry.resolved ? "opacity-50" : ""}`}
      style={{ borderColor: "#E2DDD5", background: entry.resolved ? "#FAFAF8" : "#FFFFFF" }}
      data-testid={`error-row-${entry.id}`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        {/* Left: badges + message */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Badge variant="outline" className={`text-xs font-medium ${typeClass}`}>
              {entry.type}
            </Badge>
            {entry.code && (
              <Badge variant="outline" className="text-xs font-mono">
                {entry.code}
              </Badge>
            )}
            {entry.resolved && (
              <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                ✓ Resolved
              </Badge>
            )}
          </div>

          <p className="text-sm font-medium text-foreground truncate" title={entry.message}>
            {entry.message}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {timeStr}
            </span>
            {entry.user && entry.user !== "anonymous" && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" /> {entry.user}
              </span>
            )}
            {entry.url && (
              <span className="flex items-center gap-1 truncate max-w-[240px]" title={entry.url}>
                <Link2 className="h-3 w-3 shrink-0" /> {entry.url}
              </span>
            )}
            {entry.environment && (
              <span className="flex items-center gap-1">
                <Globe className="h-3 w-3" /> {entry.environment}
              </span>
            )}
          </div>

          {entry.stack && (
            <details className="mt-2">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                Stack trace
              </summary>
              <pre className="mt-1 text-xs bg-muted rounded p-2 overflow-x-auto whitespace-pre-wrap break-all text-red-700 max-h-32">
                {entry.stack}
              </pre>
            </details>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 shrink-0">
          {!entry.resolved && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onResolve(entry.id)}
              data-testid={`button-resolve-${entry.id}`}
              className="text-green-700 border-green-200 hover:bg-green-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Resolve
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(entry.id)}
            data-testid={`button-delete-${entry.id}`}
            className="text-red-600 border-red-200 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-component: error list panel ──────────────────────────────────────────

function ErrorPanel({ origin }: { origin: "backend" | "frontend" }) {
  const entries = useErrorNodes(origin);
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showResolved, setShowResolved] = useState(false);

  const types = useMemo(() => {
    const s = new Set(entries.map((e) => e.type));
    return ["all", ...Array.from(s).sort()];
  }, [entries]);

  const filtered = useMemo(() =>
    entries.filter((e) => {
      if (!showResolved && e.resolved) return false;
      if (typeFilter !== "all" && e.type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          e.message?.toLowerCase().includes(q) ||
          e.url?.toLowerCase().includes(q) ||
          e.user?.toLowerCase().includes(q)
        );
      }
      return true;
    }),
  [entries, showResolved, typeFilter, search]);

  const unresolved = entries.filter((e) => !e.resolved).length;

  async function handleResolve(id: string) {
    try {
      await update(ref(rtdb, `errors/${origin}/${id}`), { resolved: true });
      toast({ title: "Marked as resolved" });
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    }
  }

  async function handleDelete(id: string) {
    try {
      await remove(ref(rtdb, `errors/${origin}/${id}`));
      toast({ title: "Error record deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  }

  async function handleResolveAll() {
    const unresolvedEntries = entries.filter((e) => !e.resolved);
    const updates: Record<string, boolean> = {};
    unresolvedEntries.forEach((e) => { updates[`errors/${origin}/${e.id}/resolved`] = true; });
    try {
      await update(ref(rtdb, "/"), updates);
      toast({ title: `Resolved ${unresolvedEntries.length} errors` });
    } catch {
      toast({ title: "Failed", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <Input
          placeholder="Search message, URL, user…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
          data-testid={`input-search-${origin}`}
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36" data-testid={`select-type-${origin}`}>
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            {types.map((t) => (
              <SelectItem key={t} value={t}>{t === "all" ? "All types" : t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={showResolved ? "default" : "outline"}
          size="sm"
          onClick={() => setShowResolved((v) => !v)}
          data-testid={`button-toggle-resolved-${origin}`}
        >
          {showResolved ? "Hide Resolved" : "Show Resolved"}
        </Button>
        {unresolved > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleResolveAll}
            data-testid={`button-resolve-all-${origin}`}
            className="text-green-700 border-green-200 hover:bg-green-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            Resolve all ({unresolved})
          </Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} of {entries.length} shown
        </span>
      </div>

      {/* Error list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {entries.length === 0 ? "No errors logged yet — all clear! ✅" : "No errors match your filters."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <ErrorRow
              key={e.id}
              entry={e}
              origin={origin}
              onResolve={handleResolve}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ErrorMonitor() {
  const backendErrors = useErrorNodes("backend");
  const frontendErrors = useErrorNodes("frontend");
  const { toast } = useToast();
  const [alertSending, setAlertSending] = useState(false);

  const backendUnresolved = backendErrors.filter((e) => !e.resolved).length;
  const frontendUnresolved = frontendErrors.filter((e) => !e.resolved).length;
  const totalAll = backendErrors.length + frontendErrors.length;

  async function sendAlert() {
    setAlertSending(true);
    try {
      await apiRequest("POST", "/api/admin/errors/alert", {
        backendUnresolved,
        frontendUnresolved,
        total: totalAll,
      });
      toast({ title: "🚨 WhatsApp alert sent to admin" });
    } catch {
      toast({ title: "Failed to send alert", variant: "destructive" });
    } finally {
      setAlertSending(false);
    }
  }

  const alertNeeded = backendUnresolved > ALERT_THRESHOLD;

  return (
    <AdminLayout title="Error Monitor">
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#1A2530" }}>
              Error Monitor
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Real-time view of backend + frontend errors logged to Firebase
            </p>
          </div>

          <div className="flex gap-2">
            {alertNeeded && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-50 text-red-700 border border-red-200 animate-pulse">
                <AlertTriangle className="h-4 w-4" />
                High error rate!
              </div>
            )}
            <Button
              onClick={sendAlert}
              disabled={alertSending}
              variant="outline"
              className="text-orange-700 border-orange-200 hover:bg-orange-50"
              data-testid="button-send-alert"
            >
              {alertSending
                ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                : <Bell className="h-4 w-4 mr-2" />}
              {alertNeeded ? "Send Alert Now" : "Test Alert"}
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            label="Backend Unresolved"
            value={backendUnresolved}
            sub={`of ${backendErrors.length} total`}
            accent={backendUnresolved > ALERT_THRESHOLD ? "#D92D20" : "#1A2530"}
            icon={Monitor}
          />
          <StatCard
            label="Frontend Unresolved"
            value={frontendUnresolved}
            sub={`of ${frontendErrors.length} total`}
            accent={frontendUnresolved > 5 ? "#E6A700" : "#1A2530"}
            icon={Globe}
          />
          <StatCard
            label="Total Backend"
            value={backendErrors.length}
            sub="all time"
            accent="#4A7C59"
            icon={AlertOctagon}
          />
          <StatCard
            label="Total Frontend"
            value={frontendErrors.length}
            sub="all time"
            accent="#4A7C59"
            icon={AlertOctagon}
          />
        </div>

        {/* High-error-rate banner */}
        {alertNeeded && (
          <div
            className="flex items-start gap-3 p-4 rounded-lg border"
            style={{ background: "#FFF4F4", borderColor: "#FCA5A5" }}
            data-testid="alert-high-error-rate"
          >
            <AlertOctagon className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-700">
                High backend error rate — {backendUnresolved} unresolved (threshold: {ALERT_THRESHOLD})
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                A WhatsApp alert will be sent to the admin automatically if not resolved.
                You can also trigger it manually using the button above.
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="backend">
          <TabsList>
            <TabsTrigger value="backend" data-testid="tab-backend">
              Backend
              {backendUnresolved > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-red-100 text-red-700">
                  {backendUnresolved}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="frontend" data-testid="tab-frontend">
              Frontend
              {frontendUnresolved > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700">
                  {frontendUnresolved}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="backend" className="mt-4">
            <ErrorPanel origin="backend" />
          </TabsContent>

          <TabsContent value="frontend" className="mt-4">
            <ErrorPanel origin="frontend" />
          </TabsContent>
        </Tabs>

      </div>
    </AdminLayout>
  );
}
