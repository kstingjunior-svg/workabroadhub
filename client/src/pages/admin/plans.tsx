import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Crown, Zap, Star, Pencil, ToggleLeft, ToggleRight,
  CheckCircle2, AlertTriangle, DollarSign, Tag, ArrowUpDown, Loader2, Info,
} from "lucide-react";
import AdminLayout from "@/components/admin-layout";

interface Plan {
  planId: string;
  planName: string;
  price: number;
  features: string[];
  description: string | null;
  badge: string | null;
  currency: string;
  billingPeriod: string;
  isActive: boolean;
  displayOrder: number;
  metadata: Record<string, any> | null;
  updatedAt: string | null;
}

const PLAN_ICONS: Record<string, any> = { free: Star, basic: Zap, pro: Crown };
const PLAN_COLOR_CLASSES: Record<string, string> = {
  free: "border-border",
  basic: "border-blue-400",
  pro: "border-amber-400",
};
const PLAN_BADGE_CLASSES: Record<string, string> = {
  free: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  basic: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  pro: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
};

const AVAILABLE_FEATURES = [
  "limited_ats", "limited_jobs", "visa_info", "country_guides",
  "ats_cv_checker", "job_access", "limited_ai", "application_tracker",
  "full_tools", "ai_job_assistant", "job_matching", "priority_listings",
  "unlimited_access", "whatsapp_consultation",
];

const FEATURE_LABELS: Record<string, string> = {
  limited_ats: "ATS CV Preview (limited)",
  limited_jobs: "Browse job listings (limited)",
  visa_info: "Visa & country guides",
  country_guides: "Country destination guides",
  ats_cv_checker: "Full ATS CV Checker",
  job_access: "Full job listings access",
  limited_ai: "AI tools (1 free use)",
  application_tracker: "Application tracker",
  full_tools: "All platform tools",
  ai_job_assistant: "AI Job Application Assistant",
  job_matching: "AI Job Matching",
  priority_listings: "Priority job visibility",
  unlimited_access: "Unlimited AI generations",
  whatsapp_consultation: "1-on-1 WhatsApp consultation",
};

interface EditState {
  planName: string;
  price: string;
  description: string;
  badge: string;
  currency: string;
  billingPeriod: string;
  displayOrder: string;
  features: string[];
}

function PlanCard({ plan, onEdit, onToggle, isToggling }: {
  plan: Plan;
  onEdit: (plan: Plan) => void;
  onToggle: (plan: Plan) => void;
  isToggling: boolean;
}) {
  const Icon = PLAN_ICONS[plan.planId] ?? Star;

  return (
    <Card className={`border-2 ${PLAN_COLOR_CLASSES[plan.planId]} ${!plan.isActive ? "opacity-60" : ""}`} data-testid={`plan-admin-card-${plan.planId}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${plan.planId === "pro" ? "bg-amber-100 dark:bg-amber-900/30" : plan.planId === "basic" ? "bg-blue-100 dark:bg-blue-900/30" : "bg-muted"}`}>
              <Icon className={`h-5 w-5 ${plan.planId === "pro" ? "text-amber-600" : plan.planId === "basic" ? "text-blue-600" : "text-muted-foreground"}`} />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {plan.planName}
                {!plan.isActive && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">ID: <code className="font-mono">{plan.planId}</code> · Order: {plan.displayOrder}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onEdit(plan)}
              data-testid={`btn-edit-plan-${plan.planId}`}
            >
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
            <Button
              size="sm"
              variant={plan.isActive ? "destructive" : "default"}
              onClick={() => onToggle(plan)}
              disabled={isToggling}
              data-testid={`btn-toggle-plan-${plan.planId}`}
            >
              {isToggling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : plan.isActive ? (
                <><ToggleRight className="h-3.5 w-3.5 mr-1" /> Deactivate</>
              ) : (
                <><ToggleLeft className="h-3.5 w-3.5 mr-1" /> Activate</>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Price */}
        <div className="flex items-center gap-4 bg-muted/50 rounded-lg p-3">
          <div>
            <p className="text-xs text-muted-foreground">Price</p>
            <p className="text-2xl font-bold" data-testid={`text-plan-price-${plan.planId}`}>
              {plan.price === 0 ? "Free" : `${plan.currency} ${plan.price.toLocaleString()}`}
            </p>
            {plan.price > 0 && (
              <p className="text-xs text-muted-foreground">/{plan.billingPeriod} · ≈ {plan.currency} {Math.round(plan.price / 12).toLocaleString()}/mo</p>
            )}
          </div>
          {plan.badge && (
            <span className={`ml-auto text-xs font-bold px-3 py-1 rounded-full ${PLAN_BADGE_CLASSES[plan.planId]}`}>
              {plan.badge}
            </span>
          )}
        </div>

        {/* Description */}
        {plan.description && (
          <p className="text-sm text-muted-foreground">{plan.description}</p>
        )}

        {/* Features */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Features ({(plan.features ?? []).length})</p>
          <div className="flex flex-wrap gap-1.5">
            {(plan.features ?? []).map((f) => (
              <span key={f} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium" data-testid={`feature-tag-${plan.planId}-${f}`}>
                {FEATURE_LABELS[f] ?? f}
              </span>
            ))}
          </div>
        </div>

        {/* Metadata */}
        {plan.metadata && Object.keys(plan.metadata).length > 0 && (
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-2 font-mono">
            {JSON.stringify(plan.metadata, null, 2)}
          </div>
        )}

        {plan.updatedAt && (
          <p className="text-xs text-muted-foreground text-right">
            Last updated: {new Date(plan.updatedAt).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminPlans() {
  const { toast } = useToast();
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);

  const { data: plans = [], isLoading } = useQuery<Plan[]>({
    queryKey: ["/api/admin/plans"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ planId, data }: { planId: string; data: Partial<EditState> }) => {
      const payload: Record<string, any> = {};
      if (data.planName !== undefined) payload.planName = data.planName;
      if (data.price !== undefined) payload.price = parseInt(data.price, 10);
      if (data.description !== undefined) payload.description = data.description || null;
      if (data.badge !== undefined) payload.badge = data.badge || null;
      if (data.currency !== undefined) payload.currency = data.currency;
      if (data.billingPeriod !== undefined) payload.billingPeriod = data.billingPeriod;
      if (data.displayOrder !== undefined) payload.displayOrder = parseInt(data.displayOrder, 10);
      if (data.features !== undefined) payload.features = data.features;
      const res = await apiRequest("PATCH", `/api/admin/plans/${planId}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
      setEditingPlan(null);
      setEditState(null);
      toast({ title: "Plan updated", description: "Changes saved and live immediately." });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (planId: string) => {
      setTogglingId(planId);
      const res = await apiRequest("POST", `/api/admin/plans/${planId}/toggle`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
      setTogglingId(null);
      toast({ title: `Plan ${data.isActive ? "activated" : "deactivated"}`, description: `${data.planName} is now ${data.isActive ? "visible to users" : "hidden from public pricing"}.` });
    },
    onError: (err: any) => {
      setTogglingId(null);
      toast({ title: "Toggle failed", description: err.message, variant: "destructive" });
    },
  });

  function openEdit(plan: Plan) {
    setEditingPlan(plan);
    setEditState({
      planName: plan.planName,
      price: String(plan.price),
      description: plan.description ?? "",
      badge: plan.badge ?? "",
      currency: plan.currency,
      billingPeriod: plan.billingPeriod,
      displayOrder: String(plan.displayOrder),
      features: [...(plan.features ?? [])],
    });
  }

  function toggleFeature(feat: string) {
    if (!editState) return;
    const has = editState.features.includes(feat);
    setEditState({
      ...editState,
      features: has
        ? editState.features.filter(f => f !== feat)
        : [...editState.features, feat],
    });
  }

  function saveEdit() {
    if (!editingPlan || !editState) return;
    updateMutation.mutate({ planId: editingPlan.planId, data: editState });
  }

  return (
    <AdminLayout title="Plan & Pricing Manager">
      <div className="max-w-4xl mx-auto space-y-6 p-4 md:p-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" />
            Plan & Pricing Manager
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Update prices, features, badges and visibility without any code changes. Changes take effect immediately.
          </p>
        </div>

        {/* Info banner */}
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="flex items-start gap-3 py-4">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800 dark:text-blue-300">
              <p className="font-semibold">Live pricing — no code required</p>
              <p className="text-xs mt-0.5 opacity-80">
                Prices are stored in the database. Every change here updates the public pricing page and the M-Pesa STK Push amount instantly.
                The planId (free / basic / pro) is permanent and cannot be changed as it is used by the payment system.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Summary stats */}
        {!isLoading && (
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-foreground" data-testid="stat-active-plans">
                  {plans.filter(p => p.isActive).length}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Active Plans</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-foreground">
                  {plans.filter(p => p.price > 0).map(p => `KES ${p.price.toLocaleString()}`).join(" / ")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Paid Plan Prices</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-foreground">
                  {plans.reduce((acc, p) => acc + (p.features ?? []).length, 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Total Features</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Plan cards */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-5">
            {plans.map((plan) => (
              <PlanCard
                key={plan.planId}
                plan={plan}
                onEdit={openEdit}
                onToggle={(p) => toggleMutation.mutate(p.planId)}
                isToggling={togglingId === plan.planId}
              />
            ))}
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={!!editingPlan} onOpenChange={(open) => { if (!open) { setEditingPlan(null); setEditState(null); } }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-4 w-4" />
                Edit Plan: <span className="text-primary">{editingPlan?.planName}</span>
                <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono text-muted-foreground">{editingPlan?.planId}</code>
              </DialogTitle>
            </DialogHeader>

            {editState && (
              <div className="space-y-5 py-2">
                {/* Basic info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-plan-name">Plan Display Name</Label>
                    <Input
                      id="edit-plan-name"
                      value={editState.planName}
                      onChange={(e) => setEditState({ ...editState, planName: e.target.value })}
                      placeholder="e.g. Pro, VIP, Basic"
                      data-testid="input-plan-name"
                    />
                    <p className="text-xs text-muted-foreground">Shown on the pricing page. planId is locked.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-badge">Badge Text</Label>
                    <Input
                      id="edit-badge"
                      value={editState.badge}
                      onChange={(e) => setEditState({ ...editState, badge: e.target.value })}
                      placeholder="e.g. Most Popular, VIP Access"
                      data-testid="input-plan-badge"
                    />
                    <p className="text-xs text-muted-foreground">Shown as a pill above the plan card. Leave blank for none.</p>
                  </div>
                </div>

                <Separator />

                {/* Price */}
                <div>
                  <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" /> Pricing
                  </p>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-price">Price</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">{editState.currency}</span>
                        <Input
                          id="edit-price"
                          type="number"
                          min={0}
                          value={editState.price}
                          onChange={(e) => setEditState({ ...editState, price: e.target.value })}
                          className="pl-12"
                          data-testid="input-plan-price"
                        />
                      </div>
                      {parseInt(editState.price) > 0 && (
                        <p className="text-xs text-green-600">≈ {editState.currency} {Math.round(parseInt(editState.price) / 12).toLocaleString()}/month</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-currency">Currency</Label>
                      <Input
                        id="edit-currency"
                        value={editState.currency}
                        onChange={(e) => setEditState({ ...editState, currency: e.target.value.toUpperCase() })}
                        placeholder="KES"
                        maxLength={5}
                        data-testid="input-plan-currency"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-billing">Billing Period</Label>
                      <Input
                        id="edit-billing"
                        value={editState.billingPeriod}
                        onChange={(e) => setEditState({ ...editState, billingPeriod: e.target.value })}
                        placeholder="annual"
                        data-testid="input-plan-billing"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Description */}
                <div className="space-y-1.5">
                  <Label htmlFor="edit-description">Plan Description</Label>
                  <Textarea
                    id="edit-description"
                    value={editState.description}
                    onChange={(e) => setEditState({ ...editState, description: e.target.value })}
                    placeholder="Short description shown under the plan name"
                    rows={2}
                    data-testid="input-plan-description"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-order">Display Order</Label>
                  <Input
                    id="edit-order"
                    type="number"
                    min={0}
                    value={editState.displayOrder}
                    onChange={(e) => setEditState({ ...editState, displayOrder: e.target.value })}
                    className="w-24"
                    data-testid="input-plan-order"
                  />
                  <p className="text-xs text-muted-foreground">Lower number appears first on the pricing page.</p>
                </div>

                <Separator />

                {/* Features */}
                <div>
                  <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Features ({editState.features.length} selected)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {AVAILABLE_FEATURES.map((feat) => {
                      const active = editState.features.includes(feat);
                      return (
                        <label
                          key={feat}
                          className={`flex items-center gap-3 rounded-lg border p-2.5 cursor-pointer transition-colors ${active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                          data-testid={`feature-toggle-${feat}`}
                        >
                          <Switch
                            checked={active}
                            onCheckedChange={() => toggleFeature(feat)}
                            className="shrink-0"
                          />
                          <span className="text-sm">{FEATURE_LABELS[feat]}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Price change warning */}
                {editingPlan && parseInt(editState.price) !== editingPlan.price && parseInt(editState.price) > 0 && (
                  <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold">Price change: {editingPlan.currency} {editingPlan.price.toLocaleString()} → {editState.currency} {parseInt(editState.price).toLocaleString()}</p>
                      <p className="text-xs mt-0.5 opacity-80">
                        This immediately updates the M-Pesa STK Push amount for new purchases. Existing subscriptions are not affected.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => { setEditingPlan(null); setEditState(null); }}
                disabled={updateMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={saveEdit}
                disabled={updateMutation.isPending}
                data-testid="btn-save-plan"
              >
                {updateMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
