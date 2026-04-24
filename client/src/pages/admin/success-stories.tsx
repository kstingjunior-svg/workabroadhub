import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Clock, Briefcase, MapPin, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAllSuccessStories, verifyStory, rejectStory, type SuccessStoryEntry } from "@/lib/firebase-success-stories";

export default function AdminSuccessStoriesPage() {
  const { toast } = useToast();
  const [stories, setStories] = useState<SuccessStoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  async function loadStories() {
    setLoading(true);
    try {
      const all = await getAllSuccessStories();
      setStories(all);
    } catch (err) {
      toast({ title: "Failed to load stories", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadStories(); }, []);

  async function handleVerify(id: string, initials: string) {
    setProcessing(id);
    try {
      await verifyStory(id);
      setStories(s => s.map(x => x.id === id ? { ...x, verifiedByAdmin: true } : x));
      toast({ title: `✅ Verified`, description: `${initials} story is now live on the landing page.` });
    } catch {
      toast({ title: "Verify failed", variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  }

  async function handleReject(id: string, initials: string) {
    setProcessing(id);
    try {
      await rejectStory(id);
      setStories(s => s.filter(x => x.id !== id));
      toast({ title: `Removed`, description: `${initials}'s story has been deleted.` });
    } catch {
      toast({ title: "Remove failed", variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  }

  const pending = stories.filter(s => !s.verifiedByAdmin);
  const verified = stories.filter(s => s.verifiedByAdmin);

  return (
    <AdminLayout title="Success Stories">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Success Stories</h1>
            <p className="text-slate-500 text-sm mt-1">
              Verify placement reports before they appear on the landing page
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadStories} disabled={loading} className="gap-2">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Pending review", count: pending.length, color: "text-amber-600" },
            { label: "Verified & live", count: verified.length, color: "text-emerald-600" },
            { label: "Total submitted", count: stories.length, color: "text-slate-700" },
          ].map(({ label, count, color }) => (
            <div key={label} className="bg-white border border-slate-200 rounded-lg p-4 text-center">
              <div className={`text-2xl font-bold ${color}`}>{count}</div>
              <div className="text-xs text-slate-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Pending queue */}
        <div>
          <h2 className="text-base font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" /> Awaiting Verification ({pending.length})
          </h2>
          {loading ? (
            <div className="text-sm text-slate-400 py-6 text-center">Loading…</div>
          ) : pending.length === 0 ? (
            <div className="text-sm text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded-lg">
              No pending stories
            </div>
          ) : (
            <div className="space-y-3">
              {pending.map(s => (
                <Card key={s.id} className="border-amber-200 bg-amber-50/30">
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-slate-800 text-lg">{s.initials}</span>
                        <Badge variant="outline" className="text-amber-700 border-amber-300 text-xs">Pending</Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-slate-400" />
                          {s.from} → {s.to}
                        </span>
                        <span className="flex items-center gap-1">
                          <Briefcase className="h-3.5 w-3.5 text-slate-400" />
                          {s.jobTitle}
                        </span>
                        <span className="text-slate-400 text-xs">
                          {new Date(s.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handleVerify(s.id, s.initials)}
                        disabled={processing === s.id}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                        data-testid={`verify-story-${s.id}`}
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Verify & Publish
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReject(s.id, s.initials)}
                        disabled={processing === s.id}
                        className="text-red-600 border-red-200 hover:bg-red-50 gap-1"
                        data-testid={`reject-story-${s.id}`}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Remove
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Verified stories */}
        {verified.length > 0 && (
          <div>
            <h2 className="text-base font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-500" /> Live on Landing Page ({verified.length})
            </h2>
            <div className="space-y-2">
              {verified.map(s => (
                <div
                  key={s.id}
                  className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-4 py-3 text-sm"
                  data-testid={`verified-story-${s.id}`}
                >
                  <span className="text-slate-700">
                    <strong>{s.initials}</strong> from {s.from} → <strong>{s.jobTitle}</strong>, {s.to}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Live</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleReject(s.id, s.initials)}
                      disabled={processing === s.id}
                      className="text-red-500 hover:text-red-700 h-7 px-2"
                      data-testid={`remove-verified-story-${s.id}`}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
