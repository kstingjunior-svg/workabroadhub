import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Globe, ArrowLeft, Download, Eye, Send, Share2, FileText, RefreshCw, MessageCircle, FileDown } from "lucide-react";
import type { ServiceOrder, ServiceDeliverable } from "@shared/schema";

type OrderWithDeliverables = ServiceOrder & { deliverables?: ServiceDeliverable[] };

type UserDocument = ServiceDeliverable & {
  serviceName: string;
  serviceId: string;
  orderedAt: string | null;
};

type UserDocumentsResponse = {
  userId: string;
  documents: UserDocument[];
  count: number;
};

type Payment = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  gateway: string;
  type: string;
  planId: string | null;
  createdAt: string;
  transactionRef: string | null;
};

type PlanData = {
  planId: string;
  plan: { planName: string; price: number };
  subscription: { startDate: string; endDate: string | null; status: string } | null;
};

const SERVICE_ICONS: Record<string, string> = {
  ats_cv: "📄", country_cv: "🌍", cover_letter: "✉️", linkedin: "💼",
  interview_coaching: "🎯", interview_pack: "📋", visa_guidance: "🛂",
  sop: "📝", motivation_letter: "✨", contract_review: "⚖️",
  employer_verification: "🔍", pre_departure: "✈️", guided_apply: "🤝",
  app_tracking: "📊", reminder_alerts: "⏰",
  "ats cv": "📄", "cv rewrite": "📄", "cover letter": "✉️",
  "interview coaching": "🎯", "visa guidance": "🛂",
  "motivation letter": "✨", "contract review": "⚖️",
  "employer verification": "🔍", "pre-departure": "✈️", "guided application": "🤝",
  "application tracking": "📊", "reminder system": "⏰",
};

function getDocumentIcon(order: OrderWithDeliverables): string {
  const key = (order.serviceId || order.serviceName || "").toLowerCase();
  for (const [k, v] of Object.entries(SERVICE_ICONS)) {
    if (key.includes(k)) return v;
  }
  return "📄";
}

function getAiContent(order: OrderWithDeliverables): string | null {
  const output = order.aiOutput as any;
  return output?.content || null;
}

function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type Tab = "documents" | "purchases" | "subscriptions";

export default function MyDocuments() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("documents");
  const [viewingOrder, setViewingOrder] = useState<OrderWithDeliverables | null>(null);
  const [revisionText, setRevisionText] = useState("");
  const [showRevisionInput, setShowRevisionInput] = useState(false);

  const { data: orders = [], isLoading: ordersLoading } = useQuery<OrderWithDeliverables[]>({
    queryKey: ["/api/service-orders"],
  });

  const { data: userDocsData, isLoading: docsLoading } = useQuery<UserDocumentsResponse>({
    queryKey: ["/api/user/documents"],
    enabled: activeTab === "documents",
  });

  const { data: paymentsData, isLoading: paymentsLoading } = useQuery<{ payments: Payment[]; total: number }>({
    queryKey: ["/api/payments/history"],
    enabled: activeTab === "purchases",
  });

  const { data: planData } = useQuery<PlanData>({
    queryKey: ["/api/user/plan"],
  });

  const revisionMutation = useMutation({
    mutationFn: async ({ orderId, notes }: { orderId: string; notes: string }) => {
      const res = await apiRequest("POST", `/api/service-orders/${orderId}/revise`, { revisionNotes: notes });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Revision Requested", description: "Our team will update your document within 24 hours." });
      queryClient.invalidateQueries({ queryKey: ["/api/service-orders"] });
      setShowRevisionInput(false);
      setRevisionText("");
    },
    onError: () => {
      toast({ title: "Request Failed", description: "Unable to submit revision. Please try again.", variant: "destructive" });
    },
  });

  const completedOrders = orders.filter(o => o.status === "completed" && getAiContent(o));
  const totalSpent = (paymentsData?.payments || [])
    .filter(p => p.status === "completed" || p.status === "success")
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const firstName = user?.firstName || "User";
  const initial = firstName.charAt(0).toUpperCase();
  const memberSince = user?.createdAt
    ? new Date(user.createdAt as string).toLocaleDateString("en-KE", { month: "short", year: "numeric" })
    : "—";

  const activeSub = planData?.subscription?.status === "active" ? planData : null;

  function shareViaWhatsApp(doc: { id: string; serviceName?: string; content?: string | null }) {
    const serviceName = doc.serviceName || "Document";
    const content = doc.content || "";
    const preview = content.substring(0, 200).trim() + (content.length > 200 ? "…" : "");
    const shareUrl = `${window.location.origin}/shared/${doc.id}`;
    const message =
      `📄 *${serviceName}* from WorkAbroad Hub\n\n` +
      (preview ? `"${preview}"\n\n` : "") +
      `🔗 View full document: ${shareUrl}\n\n` +
      `_Generated by WorkAbroad Hub — Verified overseas job guidance for Kenyans_`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
  }

  function copyShareLink(orderId: string) {
    const url = `${window.location.origin}/shared/${orderId}`;
    navigator.clipboard?.writeText(url).then(() => {
      toast({ title: "Link Copied", description: "Shareable link copied to clipboard." });
    });
  }

  return (
    <div className="min-h-screen bg-[#F4F2EE]" data-testid="page-my-documents">
      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pb-5 mb-6 border-b border-[#D1CEC8]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/")}
              className="p-2 rounded-full border border-[#D1CEC8] hover:border-[#1A2530] bg-white transition-colors"
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4 text-[#1A2530]" />
            </button>
            <div>
              <h4 className="font-bold text-xl text-[#1A2530] tracking-tight">WORKABROAD HUB</h4>
              <p className="text-xs text-[#7A8A9A]">My Documents</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-[#3A4A5A] hidden sm:block" data-testid="text-username">
              {firstName}
            </span>
            <div
              className="w-10 h-10 rounded-full bg-[#D8CFC0] flex items-center justify-center font-bold text-[#1A2530]"
              data-testid="avatar-initial"
            >
              {initial}
            </div>
          </div>
        </div>

        {/* ── Welcome Card ────────────────────────────────────────────────────── */}
        <div className="bg-white border border-[#E2DDD5] rounded-[20px] p-5 mb-5">
          <h1 className="text-2xl font-bold text-[#1A2530] mb-1">
            Welcome back, <span data-testid="text-display-name">{firstName}</span>!
          </h1>
          <p className="text-sm text-[#5A6A7A]">Manage your documents, track purchases, and access your career resources.</p>
        </div>

        {/* ── Stats Grid ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            {
              label: "Total Documents",
              value: (docsLoading || ordersLoading) ? "—" : Math.max(userDocsData?.count ?? 0, completedOrders.length).toString(),
              sub: "Generated services",
            },
            {
              label: "Plan Status",
              value: activeSub ? (planData?.plan?.planName || "Pro") : "FREE",
              sub: activeSub ? "Active subscription" : "Upgrade for more",
            },
            {
              label: "Total Spent",
              value: `KES ${totalSpent > 0 ? totalSpent.toLocaleString() : "0"}`,
              sub: "Lifetime payments",
            },
            { label: "Member Since", value: memberSince, sub: "WorkAbroad Hub" },
          ].map(card => (
            <div
              key={card.label}
              className="bg-white border border-[#E2DDD5] rounded-[16px] p-4"
              data-testid={`stat-${card.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <p className="text-[10px] uppercase tracking-widest text-[#7A8A9A] mb-1">{card.label}</p>
              <p className="text-xl font-bold text-[#1A2530] leading-none mb-1">{card.value}</p>
              <p className="text-[11px] text-[#5A6A7A]">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────────────── */}
        <div className="flex gap-1 border-b border-[#E2DDD5] mb-5">
          {(["documents", "purchases", "subscriptions"] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
                activeTab === tab
                  ? "border-[#1A2530] text-[#1A2530]"
                  : "border-transparent text-[#7A8A9A] hover:text-[#1A2530]"
              }`}
              data-testid={`tab-${tab}`}
            >
              {tab === "documents" ? "📄 My Documents" : tab === "purchases" ? "💰 Purchase History" : "⭐ Subscriptions"}
            </button>
          ))}
        </div>

        {/* ── Documents Tab ───────────────────────────────────────────────────── */}
        {activeTab === "documents" && (
          <div className="bg-white border border-[#E2DDD5] rounded-[20px] p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-[#1A2530]">Your Documents</h2>
              <Link href="/services">
                <span className="text-xs font-medium text-[#3A4A5A] px-3 py-1.5 border border-[#D1CEC8] rounded-lg hover:border-[#1A2530] cursor-pointer transition-colors">
                  + Browse Services
                </span>
              </Link>
            </div>

            {(docsLoading || ordersLoading) ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-[#F9F8F6] border border-[#EAE5DE] rounded-[16px] p-5">
                    <Skeleton className="h-8 w-8 rounded mb-3" />
                    <Skeleton className="h-5 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-1/2 mb-4" />
                    <div className="flex gap-2">
                      <Skeleton className="h-7 w-16 rounded-lg" />
                      <Skeleton className="h-7 w-20 rounded-lg" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (userDocsData?.documents.length ?? 0) === 0 && completedOrders.length === 0 ? (
              <div className="text-center py-14 text-[#7A8A9A]" data-testid="empty-documents">
                <div className="text-5xl mb-3">📄</div>
                <h3 className="font-semibold text-[#1A2530] mb-1">No documents yet</h3>
                <p className="text-sm mb-4">Purchase a service to generate your first document!</p>
                <Link href="/services">
                  <span className="inline-block bg-[#1A2530] text-white text-sm font-medium px-5 py-2.5 rounded-full cursor-pointer hover:bg-[#2A3540] transition-colors">
                    Browse Services →
                  </span>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Deliverables from /api/user/documents (real files from DB) */}
                {(userDocsData?.documents ?? []).map(doc => {
                  const docKey = (doc.serviceId || doc.serviceName || "").toLowerCase();
                  let icon = "📄";
                  for (const [k, v] of Object.entries(SERVICE_ICONS)) {
                    if (docKey.includes(k)) { icon = v; break; }
                  }
                  const date = doc.orderedAt
                    ? new Date(doc.orderedAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })
                    : new Date(doc.createdAt!).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
                  return (
                    <div
                      key={doc.id}
                      className="bg-[#F9F8F6] border border-[#EAE5DE] rounded-[16px] p-5 hover:border-[#8B7A66] hover:shadow-sm transition-all"
                      data-testid={`card-deliverable-${doc.id}`}
                    >
                      <div className="text-3xl mb-3">{icon}</div>
                      <h3 className="font-semibold text-[#1A2530] text-base mb-1 leading-snug">{doc.serviceName}</h3>
                      <div className="text-[11px] text-[#7A8A9A] mb-4 space-y-0.5">
                        <div>Generated: {date}</div>
                        <div className="flex items-center gap-1">
                          Status:{" "}
                          <span className="inline-block px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-[10px] font-semibold">
                            Ready
                          </span>
                        </div>
                        {doc.downloadCount > 0 && (
                          <div className="text-[10px] text-[#7A8A9A]">Downloaded {doc.downloadCount}×</div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={doc.fileUrl}
                          download={doc.fileName}
                          className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 border border-[#D1CEC8] rounded-lg bg-white hover:border-[#1A2530] transition-colors"
                          data-testid={`button-download-deliverable-${doc.id}`}
                        >
                          <Download className="h-3.5 w-3.5" /> Download
                        </a>
                        <Link href={`/order/${doc.orderId}`}>
                          <span className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 border border-[#D1CEC8] rounded-lg bg-white hover:border-[#1A2530] transition-colors cursor-pointer">
                            <Eye className="h-3.5 w-3.5" /> View
                          </span>
                        </Link>
                        <button
                          onClick={() => shareViaWhatsApp({ id: doc.orderId, serviceName: doc.serviceName })}
                          className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 border border-[#D1CEC8] rounded-lg bg-white hover:bg-[#25D366] hover:text-white hover:border-[#25D366] transition-colors"
                          data-testid={`button-whatsapp-deliverable-${doc.id}`}
                          title="Share via WhatsApp"
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> Share
                        </button>
                      </div>
                    </div>
                  );
                })}
                {/* AI-output orders not yet in deliverables table */}
                {completedOrders
                  .filter(o => !(userDocsData?.documents ?? []).some(d => d.orderId === o.id))
                  .map(order => {
                    const date = new Date(order.createdAt).toLocaleDateString("en-KE", {
                      day: "numeric", month: "short", year: "numeric",
                    });
                    const icon = getDocumentIcon(order);
                    return (
                      <div
                        key={order.id}
                        className="bg-[#F9F8F6] border border-[#EAE5DE] rounded-[16px] p-5 hover:border-[#8B7A66] hover:shadow-sm transition-all cursor-pointer"
                        onClick={() => setViewingOrder(order)}
                        data-testid={`card-document-${order.id}`}
                      >
                        <div className="text-3xl mb-3">{icon}</div>
                        <h3 className="font-semibold text-[#1A2530] text-base mb-1 leading-snug">{order.serviceName}</h3>
                        <div className="text-[11px] text-[#7A8A9A] mb-4 space-y-0.5">
                          <div>Generated: {date}</div>
                          <div>
                            Status:{" "}
                            <span className="inline-block px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-[10px] font-semibold">
                              Ready
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => setViewingOrder(order)}
                            className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 border border-[#D1CEC8] rounded-lg bg-white hover:border-[#1A2530] transition-colors"
                            data-testid={`button-view-${order.id}`}
                          >
                            <Eye className="h-3.5 w-3.5" /> View
                          </button>
                          <button
                            onClick={() => {
                              const content = getAiContent(order);
                              if (content) downloadText(content, `${order.serviceName}_${Date.now()}.txt`);
                            }}
                            className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 border border-[#D1CEC8] rounded-lg bg-white hover:border-[#1A2530] transition-colors"
                            data-testid={`button-download-${order.id}`}
                          >
                            <Download className="h-3.5 w-3.5" /> Download
                          </button>
                          <button
                            onClick={() => shareViaWhatsApp({ id: order.id, serviceName: order.serviceName, content: getAiContent(order) })}
                            className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 border border-[#D1CEC8] rounded-lg bg-white hover:bg-[#25D366] hover:text-white hover:border-[#25D366] transition-colors"
                            data-testid={`button-whatsapp-${order.id}`}
                            title="Share via WhatsApp"
                          >
                            <MessageCircle className="h-3.5 w-3.5" /> Share
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* ── Purchases Tab ───────────────────────────────────────────────────── */}
        {activeTab === "purchases" && (
          <div className="bg-white border border-[#E2DDD5] rounded-[20px] p-5">
            <h2 className="text-lg font-bold text-[#1A2530] mb-5">Purchase History</h2>

            {paymentsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded" />)}
              </div>
            ) : !paymentsData?.payments?.length ? (
              <div className="text-center py-14 text-[#7A8A9A]" data-testid="empty-purchases">
                <div className="text-5xl mb-3">💰</div>
                <h3 className="font-semibold text-[#1A2530] mb-1">No purchases yet</h3>
                <p className="text-sm mb-4">Your payment history will appear here.</p>
                <Link href="/services">
                  <span className="inline-block bg-[#1A2530] text-white text-sm font-medium px-5 py-2.5 rounded-full cursor-pointer">
                    Browse Services →
                  </span>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-purchases">
                  <thead>
                    <tr className="border-b border-[#E2DDD5]">
                      {["Date", "Service / Type", "Amount", "Gateway", "Reference", "Status"].map(h => (
                        <th key={h} className="text-left py-2.5 pr-4 text-[10px] uppercase tracking-wider text-[#7A8A9A] font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paymentsData.payments.map(p => {
                      const date = new Date(p.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
                      const isOk = p.status === "completed" || p.status === "success";
                      const isFail = p.status === "failed";
                      return (
                        <tr key={p.id} className="border-b border-[#F0EDE8]" data-testid={`row-payment-${p.id}`}>
                          <td className="py-3 pr-4 text-[#5A6A7A]">{date}</td>
                          <td className="py-3 pr-4 font-medium text-[#1A2530]">
                            {p.planId ? `Pro Plan (${p.planId})` : p.type === "service" ? "Service" : p.type}
                          </td>
                          <td className="py-3 pr-4 font-bold text-[#1A2530]">
                            KES {Number(p.amount).toLocaleString()}
                          </td>
                          <td className="py-3 pr-4 text-[#5A6A7A] capitalize">{p.gateway}</td>
                          <td className="py-3 pr-4 font-mono text-[11px] text-[#7A8A9A]">
                            {p.transactionRef?.slice(0, 14) || "—"}
                          </td>
                          <td className="py-3">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              isOk ? "bg-green-50 text-green-700" :
                              isFail ? "bg-red-50 text-red-600" :
                              "bg-amber-50 text-amber-700"
                            }`}>
                              {isOk ? "Completed" : isFail ? "Failed" : p.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Subscriptions Tab ───────────────────────────────────────────────── */}
        {activeTab === "subscriptions" && (
          <div className="bg-white border border-[#E2DDD5] rounded-[20px] p-5">
            <h2 className="text-lg font-bold text-[#1A2530] mb-5">Active Subscriptions</h2>

            {!activeSub ? (
              <div className="text-center py-14 text-[#7A8A9A]" data-testid="empty-subscriptions">
                <div className="text-5xl mb-3">⭐</div>
                <h3 className="font-semibold text-[#1A2530] mb-1">No active subscriptions</h3>
                <p className="text-sm mb-4">Upgrade to Pro Plan for unlimited access!</p>
                <Link href="/pricing">
                  <span className="inline-block bg-[#1A2530] text-white text-sm font-medium px-5 py-2.5 rounded-full cursor-pointer">
                    View Plans →
                  </span>
                </Link>
              </div>
            ) : (
              <div className="space-y-3" data-testid="list-subscriptions">
                <div className="bg-[#F9F8F6] border border-[#EAE5DE] rounded-[16px] p-5 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className="font-semibold text-[#1A2530] mb-1">
                      ⭐ {planData?.plan?.planName || "Pro Plan"}
                    </h3>
                    <p className="text-[13px] text-[#5A6A7A]">
                      Started:{" "}
                      {planData?.subscription?.startDate
                        ? new Date(planData.subscription.startDate).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })
                        : "—"}
                    </p>
                    {planData?.subscription?.endDate && (
                      <p className="text-[13px] text-[#5A6A7A]">
                        Expires:{" "}
                        {new Date(planData.subscription.endDate).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-3 py-1 bg-green-50 text-green-700 text-xs font-bold rounded-full mb-2">
                      Active
                    </span>
                    {planData?.subscription?.endDate && (() => {
                      const daysLeft = Math.max(0, Math.ceil((new Date(planData.subscription!.endDate!).getTime() - Date.now()) / 86400000));
                      return (
                        <p className={`text-xs font-medium ${daysLeft < 30 ? "text-amber-600" : "text-[#5A6A7A]"}`}>
                          {daysLeft} days remaining
                        </p>
                      );
                    })()}
                  </div>
                </div>

                <div className="bg-[#F0F9FF] border border-[#BAE6FD] rounded-[16px] p-4 flex items-center gap-3">
                  <span className="text-2xl">💬</span>
                  <div>
                    <p className="text-sm font-semibold text-[#0369A1]">WhatsApp AI + Voice Support</p>
                    <p className="text-xs text-[#0284C7]">Included with Pro Plan — powered by Nanjila AI</p>
                  </div>
                  <span className="ml-auto inline-block px-2.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full">Active</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Document Viewer Modal ────────────────────────────────────────────── */}
      <Dialog open={!!viewingOrder} onOpenChange={open => { if (!open) { setViewingOrder(null); setShowRevisionInput(false); setRevisionText(""); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-white rounded-[24px]">
          {viewingOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg font-bold text-[#1A2530] flex items-center gap-2">
                  <span>{getDocumentIcon(viewingOrder)}</span>
                  <span data-testid="modal-title">{viewingOrder.serviceName}</span>
                </DialogTitle>
                <p className="text-xs text-[#7A8A9A]">
                  Generated on{" "}
                  {new Date(viewingOrder.createdAt).toLocaleDateString("en-KE", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </p>
              </DialogHeader>

              <div
                className="bg-[#F9F8F6] rounded-[12px] p-4 text-sm leading-relaxed whitespace-pre-wrap text-[#1A2530] font-mono max-h-64 overflow-y-auto border border-[#EAE5DE]"
                data-testid="modal-content"
              >
                {getAiContent(viewingOrder) || "Content not available."}
              </div>

              {showRevisionInput && (
                <div className="mt-3">
                  <Textarea
                    placeholder="Describe what changes you'd like..."
                    value={revisionText}
                    onChange={e => setRevisionText(e.target.value)}
                    className="resize-none text-sm border-[#D1CEC8] focus:border-[#1A2530]"
                    rows={3}
                    data-testid="input-revision"
                  />
                </div>
              )}

              {/* Modal actions — order matches reference: TXT · PDF · WhatsApp · Revision */}
              <div className="flex flex-wrap gap-2 mt-3">

                {/* 1 — Download TXT (btn-primary) */}
                <button
                  onClick={() => {
                    const content = getAiContent(viewingOrder);
                    if (content) downloadText(content, `${viewingOrder.serviceName}_${Date.now()}.txt`);
                  }}
                  className="flex items-center gap-1.5 bg-[#1A2530] text-white text-sm font-medium px-4 py-2 rounded-full hover:bg-[#2A3540] transition-colors"
                  data-testid="button-modal-download-txt"
                >
                  <Download className="h-3.5 w-3.5" /> Download TXT
                </button>

                {/* 2 — Export PDF (btn-primary) */}
                <button
                  onClick={() => window.open(`/api/document/${viewingOrder.id}/pdf`, "_blank")}
                  className="flex items-center gap-1.5 bg-[#1A2530] text-white text-sm font-medium px-4 py-2 rounded-full hover:bg-[#2A3540] transition-colors"
                  data-testid="button-modal-download-pdf"
                >
                  <FileDown className="h-3.5 w-3.5" /> Export PDF
                </button>

                {/* 3 — Share via WhatsApp (btn-small) */}
                <button
                  onClick={() => shareViaWhatsApp({
                    id: viewingOrder.id,
                    serviceName: viewingOrder.serviceName,
                    content: getAiContent(viewingOrder),
                  })}
                  className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 bg-[#25D366] text-white rounded-full hover:bg-[#20B558] transition-colors"
                  data-testid="button-share-whatsapp"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> Share via WhatsApp
                </button>

                {/* 4 — Request Revision / Submit (btn-small) */}
                {!showRevisionInput ? (
                  <button
                    onClick={() => setShowRevisionInput(true)}
                    className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 border border-[#D1CEC8] rounded-full hover:border-[#1A2530] bg-white transition-colors"
                    data-testid="button-request-revision"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Request Revision
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (!revisionText.trim()) return;
                      revisionMutation.mutate({ orderId: viewingOrder.id, notes: revisionText });
                    }}
                    disabled={revisionMutation.isPending || !revisionText.trim()}
                    className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 bg-[#4A7C59] text-white rounded-full hover:bg-[#3A6A49] transition-colors disabled:opacity-50"
                    data-testid="button-submit-revision"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {revisionMutation.isPending ? "Sending…" : "Submit Request"}
                  </button>
                )}

                {/* Copy Link — supplementary, stays last */}
                <button
                  onClick={() => copyShareLink(viewingOrder.id)}
                  className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 border border-[#D1CEC8] rounded-full hover:border-[#1A2530] bg-white transition-colors"
                  data-testid="button-copy-link"
                >
                  <Share2 className="h-3.5 w-3.5" /> Copy Link
                </button>

                <Link href={`/order/${viewingOrder.id}`}>
                  <button
                    className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 border border-[#D1CEC8] rounded-full hover:border-[#1A2530] bg-white transition-colors"
                    data-testid="button-full-order"
                  >
                    <FileText className="h-3.5 w-3.5" /> Full Order
                  </button>
                </Link>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
