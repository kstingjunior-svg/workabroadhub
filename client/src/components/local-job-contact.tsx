/**
 * Call / WhatsApp the employer (local jobs, 2026-11).
 * Numbers are fetched only when tapped, only for signed-in visitors, and
 * only if the employer authorised publishing them. Taps are counted.
 */
import { useState } from "react";
import { Phone, MessageCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Contact = { phone: string | null; telUrl: string | null; whatsapp: string | null; whatsappUrl: string | null; contactPerson: string | null; altContact: string | null; instructions: string | null };
const cache = new Map<string, Contact>();

async function loadContact(jobId: string): Promise<Contact> {
  if (cache.has(jobId)) return cache.get(jobId)!;
  const r = await fetch(`/api/lj/jobs/${jobId}/contact`, { credentials: "include", headers: { accept: "application/json" } });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(b?.message || "Could not load the employer's contact."), { code: b?.code, status: r.status });
  cache.set(jobId, b);
  return b;
}
const track = (jobId: string, kind: "call" | "whatsapp") =>
  fetch(`/api/lj/jobs/${jobId}/click`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ kind }) }).catch(() => {});

export function LocalJobContactButtons({ jobId, canCall, canWhatsApp, size = "md", showDetails = false }: {
  jobId: string; canCall: boolean; canWhatsApp: boolean; size?: "sm" | "md"; showDetails?: boolean;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [shown, setShown] = useState<Contact | null>(cache.get(jobId) ?? null);
  if (!canCall && !canWhatsApp) return null;

  async function go(kind: "call" | "whatsapp") {
    setBusy(kind);
    try {
      const c = await loadContact(jobId);
      setShown(c);
      const url = kind === "call" ? c.telUrl : c.whatsappUrl;
      if (!url) { toast({ title: "Not available", description: kind === "call" ? "No phone number for this job." : "No WhatsApp number for this job." }); return; }
      track(jobId, kind);
      if (kind === "whatsapp") window.open(url, "_blank", "noopener"); else window.location.href = url;
    } catch (e: any) {
      if (e.code === "SIGNIN" || e.status === 401) {
        toast({ title: "Sign in to contact the employer", description: "It's free — it takes 30 seconds." });
        window.location.href = `/signup?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      } else toast({ title: "Couldn't open contact", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  }

  const base = size === "sm" ? "h-9 px-3 text-sm" : "h-11 px-5 text-base";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {canCall && (
          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); go("call"); }}
            className={`${base} inline-flex items-center gap-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold`} data-testid={`btn-call-${jobId}`}>
            {busy === "call" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />} Call employer
          </button>
        )}
        {canWhatsApp && (
          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); go("whatsapp"); }}
            className={`${base} inline-flex items-center gap-2 rounded-full bg-[#25D366] hover:bg-[#1ebe5b] text-white font-semibold`} data-testid={`btn-whatsapp-${jobId}`}>
            {busy === "whatsapp" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />} WhatsApp
          </button>
        )}
      </div>
      {showDetails && shown && (
        <div className="text-sm text-slate-600 dark:text-slate-300">
          {shown.contactPerson && <div>Contact: <b>{shown.contactPerson}</b></div>}
          {shown.phone && <div>Phone: <a className="underline" href={shown.telUrl ?? "#"}>{shown.phone}</a></div>}
          {shown.whatsapp && shown.whatsapp !== shown.phone && <div>WhatsApp: {shown.whatsapp}</div>}
          {shown.altContact && <div>Also: {shown.altContact}</div>}
        </div>
      )}
    </div>
  );
}
