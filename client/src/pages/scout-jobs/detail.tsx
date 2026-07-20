/**
 * Scout Job detail page — /scout-jobs/:id
 *
 * Shows full job + scout details. Contact fields (WhatsApp, email, howToApply)
 * are gated behind sign-in. Signed-in users see a prominent WhatsApp button
 * that opens wa.me with a prefilled message.
 */

import { useEffect } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  MessageCircle, Mail, MapPin, Briefcase, ArrowLeft, Shield, User, ExternalLink,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { fetchCsrfToken } from "@/lib/queryClient";

interface ScoutJobDetail {
  id: string;
  scoutName: string;
  scoutCountry: string;
  scoutWhatsapp: string | null;
  scoutEmail: string | null;
  contactLocked: boolean;
  jobTitle: string;
  jobCountry: string;
  jobCity: string | null;
  jobIndustry: string;
  jobDescription: string;
  salaryText: string | null;
  howToApply: string | null;
  viewCount: number;
  approvedAt: string | null;
  createdAt: string;
}

function whatsappLink(phone: string, jobTitle: string, scoutName: string): string {
  const cleaned = phone.replace(/\D/g, "");
  const msg = encodeURIComponent(
    `Hi ${scoutName}, I saw your Job Scout listing for "${jobTitle}" on WorkAbroad Hub. I would love to know more about the opportunity.`,
  );
  return `https://wa.me/${cleaned}?text=${msg}`;
}

export default function ScoutJobDetailPage() {
  const [, params] = useRoute<{ id: string }>("/scout-jobs/:id");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const jobId = params?.id;

  const { data, isLoading, error } = useQuery<ScoutJobDetail>({
    queryKey: ["/api/scout-jobs", jobId],
    queryFn: () =>
      fetch(`/api/scout-jobs/${jobId}`, { credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      }),
    enabled: !!jobId,
  });

  // Bump contact-click counter when a signed-in user opens the page — best-effort.
  useEffect(() => {
    if (!jobId || !user) return;
    (async () => {
      try {
        const csrf = await fetchCsrfToken();
        await fetch(`/api/scout-jobs/${jobId}/contact`, {
          method: "POST",
          credentials: "include",
          headers: { "X-CSRF-Token": csrf },
        });
      } catch { /* silent */ }
    })();
    // Intentionally only fires once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, user?.id]);

  if (isLoading) {
    return <div className="mx-auto max-w-3xl px-4 py-8 text-sm text-gray-500">Loading scout job...</div>;
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-3">
        <p className="text-sm text-gray-600">This scout job is not available.</p>
        <Link href="/scout-jobs"><Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" />Back to scout jobs</Button></Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-5" data-testid="page-scout-detail">
      <Link href="/scout-jobs">
        <button className="text-sm text-teal-600 hover:text-teal-700 flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> All scout jobs
        </button>
      </Link>

      {/* ── Job header ────────────────────────────────────────────────── */}
      <Card className="border-teal-100 dark:border-teal-900/50">
        <CardContent className="pt-5 pb-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Briefcase className="h-5 w-5 text-teal-500" />
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  {data.jobTitle}
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <MapPin className="h-4 w-4" />
                <span>
                  {data.jobCountry}
                  {data.jobCity ? `, ${data.jobCity}` : ""}
                </span>
                <span>·</span>
                <Badge variant="secondary">{data.jobIndustry}</Badge>
              </div>
            </div>
            {data.salaryText && (
              <div className="text-right">
                <div className="text-xs text-gray-500 dark:text-gray-400">Salary</div>
                <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {data.salaryText}
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold mb-1">
              Job details
            </div>
            <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
              {data.jobDescription}
            </p>
          </div>

          {data.howToApply && (
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold mb-1">
                How to apply
              </div>
              <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                {data.howToApply}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Scout contact ─────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-5 pb-5 space-y-3">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-gray-500" />
            <div className="text-sm">
              <span className="font-semibold text-gray-900 dark:text-white">{data.scoutName}</span>
              <span className="text-gray-500"> — Scout, based in {data.scoutCountry}</span>
            </div>
          </div>

          {data.contactLocked ? (
            <div className="rounded-lg border border-dashed border-teal-300 dark:border-teal-800 p-4 space-y-2 bg-teal-50/40 dark:bg-teal-950/20">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Sign in to see the scout's WhatsApp and email so you can contact them directly.
              </p>
              <Button
                onClick={() => navigate("/login?returnTo=" + encodeURIComponent(location.pathname))}
                className="bg-teal-500 hover:bg-teal-600 text-white"
                data-testid="button-signin-to-contact"
              >
                Sign in to see contact
              </Button>
            </div>
          ) : (
            <div className="grid gap-2">
              {data.scoutWhatsapp && (
                <a
                  href={whatsappLink(data.scoutWhatsapp, data.jobTitle, data.scoutName)}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="link-whatsapp-scout"
                >
                  <Button className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold">
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Message on WhatsApp
                    <ExternalLink className="h-3 w-3 ml-2 opacity-70" />
                  </Button>
                </a>
              )}
              {data.scoutEmail && (
                <a
                  href={`mailto:${data.scoutEmail}?subject=${encodeURIComponent(`Interested in: ${data.jobTitle}`)}`}
                  data-testid="link-email-scout"
                >
                  <Button variant="outline" className="w-full">
                    <Mail className="h-4 w-4 mr-2" />
                    Email {data.scoutEmail}
                  </Button>
                </a>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Safety card ───────────────────────────────────────────────── */}
      <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900">
        <CardContent className="pt-4 pb-4 flex gap-3">
          <Shield className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
            <strong className="font-semibold">Stay safe.</strong> Never pay the scout,
            an agent, or anyone else to secure the job, arrange the visa, or
            "book your slot". Real overseas employers pay for your visa and
            flights. If you are asked for money, report the listing to
            WorkAbroad Hub via WhatsApp support.
          </div>
        </CardContent>
      </Card>

      <div className="text-[11px] text-gray-400 text-center pt-2">
        {data.viewCount} view{data.viewCount === 1 ? "" : "s"} · Posted {new Date(data.createdAt).toLocaleDateString()}
      </div>
    </div>
  );
}
