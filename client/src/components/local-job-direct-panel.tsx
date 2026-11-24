/**
 * Job detail add-on (2026-11): verification badge, the marketplace fields
 * (estate, exact location, hours, qualifications, instructions) and the
 * Call / WhatsApp employer buttons. Renders nothing for jobs that aren't
 * live in the marketplace (e.g. expired, school jobs without contacts).
 */
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, MapPin, Clock, GraduationCap, Info, ShieldCheck } from "lucide-react";
import { LocalJobContactButtons, ljUnlockJob } from "@/components/local-job-contact";

const BADGE: Record<string, [string, string]> = {
  verified: ["Verified employer", "bg-emerald-100 text-emerald-800"],
  contact_confirmed: ["Contact details confirmed", "bg-sky-100 text-sky-800"],
  admin_posted: ["Listed by WorkAbroadHub on the employer's behalf", "bg-slate-100 text-slate-700"],
  pending: ["Verification pending", "bg-amber-50 text-amber-800"],
};

export function LocalJobDirectPanel({ jobId }: { jobId: string }) {
  const { data } = useQuery<any>({
    queryKey: ["/api/lj/jobs", jobId, "detail"],
    queryFn: async () => { const r = await fetch(`/api/lj/jobs/${jobId}`, { credentials: "include" }); return r.ok ? r.json() : null; },
  });
  const j = data?.job;
  if (!j) return null;
  const [label, cls] = BADGE[j.badge] ?? BADGE.pending;
  const rows: [any, string, string | null][] = [
    [MapPin, "Where", [j.workplaceLocation, j.estate, j.town, j.county].filter(Boolean).join(", ") || null],
    [Clock, "Working hours", j.workingHours],
    [GraduationCap, "Minimum qualification", j.minQualification],
    [GraduationCap, "Experience", j.experience],
    [Info, "Requirement", j.genderRequirement],
  ];
  return (
    <div className="mt-4 space-y-3">
      <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full ${cls}`}>
        {j.badge === "verified" ? <BadgeCheck className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}{label}
      </span>
      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {rows.filter(([, , v]) => v).map(([Icon, k, v]) => (
          <div key={k} className="flex gap-1.5"><Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" /><span><span className="text-muted-foreground">{k}:</span> {v}</span></div>
        ))}
      </div>
      {(j.canCall || j.canWhatsApp) ? (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30 p-4 space-y-2">
          <div className="font-semibold">Contact the employer directly</div>
          <LocalJobContactButtons jobId={j.id} canCall={j.canCall} canWhatsApp={j.canWhatsApp} showDetails job={ljUnlockJob(j)} />
          {j.instructions && <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-line"><b>How to apply:</b> {j.instructions}</p>}
          <p className="text-xs text-muted-foreground">Free to contact. Never pay anyone for a job, interview or training — report the listing if you're asked to.</p>
        </div>
      ) : j.instructions ? (
        <div className="rounded-xl border p-4 text-sm whitespace-pre-line"><b>How to apply:</b> {j.instructions}</div>
      ) : null}
    </div>
  );
}
