// /verified/:token — PUBLIC read-only view of a worker's Verified Migration
// Profile (Phase 2 of the "Direct Hire Exchange" concept). No auth required.
// Respects the owner's sharing toggles server-side; this page only ever
// renders what the API already decided to include.
import { useEffect, useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import {
  Loader2, ShieldCheck, Circle, GraduationCap, FileText, Phone, Mail,
  Calendar, MapPin, Globe, ArrowRight, Share2,
} from "lucide-react";
import { usePageSeo } from "@/hooks/use-page-seo";

interface PublicProfile {
  identity: {
    firstName: string | null;
    lastName: string | null;
    country: string | null;
    memberSince: string | null;
    phone: string | null;
    phoneVerified: boolean;
    email: string | null;
    emailVerified: boolean;
  };
  ielts: {
    overallBand: string | null;
    listeningBand: string | null;
    readingBand: string | null;
    writingBand: string | null;
    speakingBand: string | null;
    testDate: string | null;
    verified: true;
    verifiedVia: string;
  } | null;
  cv: { hasCv: true; verified: false; label: string; preview: string } | null;
  ats: { score: number | null; grade: string | null; verified: false; label: string } | null;
}

function VerifiedBadge({ label = "Verified" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-green-50 text-green-700 text-[11px] font-semibold rounded-full">
      <ShieldCheck className="h-3 w-3" /> {label}
    </span>
  );
}

function SelfReportedBadge({ label = "Self-reported" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-[#F4F2EE] text-[#5A6A7A] text-[11px] font-semibold rounded-full">
      <Circle className="h-2 w-2 fill-current" /> {label}
    </span>
  );
}

export default function VerifiedProfilePublic() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  usePageSeo({
    title: "Verified Migration Profile — WorkAbroad Hub",
    description: "A worker-controlled, verified credential — IELTS score, CV, and identity — shared via WorkAbroad Hub.",
    noIndex: true,
  });

  useEffect(() => {
    if (!token) { setError("Invalid link."); setLoading(false); return; }
    fetch(`/api/verified-profile/public/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "not_found" : "error");
        return r.json();
      })
      .then((data) => { setProfile(data); setLoading(false); })
      .catch((err) => {
        setError(err.message === "not_found" ? "This profile link is invalid, private, or has been removed." : "Failed to load profile. Please try again.");
        setLoading(false);
      });
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #F4F2EE 0%, #FFFFFF 100%)" }}>
        <Loader2 className="h-6 w-6 animate-spin text-[#1A2530]" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "linear-gradient(135deg, #F4F2EE 0%, #FFFFFF 100%)" }}>
        <div className="bg-white border border-[#E2DDD5] rounded-[24px] p-10 max-w-md w-full text-center" style={{ boxShadow: "0 20px 40px -10px rgba(0,0,0,0.05)" }}>
          <div className="text-5xl mb-4">🔍</div>
          <h2 className="text-xl font-bold text-[#1A2530] mb-2">Profile not found</h2>
          <p className="text-sm text-[#5A6A7A] mb-6">{error}</p>
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 bg-[#1A2530] text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-[#2A3A4A] transition-colors"
            data-testid="button-visit-home"
          >
            <Globe className="h-4 w-4" /> Visit WorkAbroad Hub
          </button>
        </div>
      </div>
    );
  }

  const { identity, ielts, cv, ats } = profile;
  const fullName = [identity.firstName, identity.lastName].filter(Boolean).join(" ") || "WorkAbroad Hub member";
  const memberSince = identity.memberSince
    ? new Date(identity.memberSince).toLocaleDateString("en-KE", { month: "long", year: "numeric" })
    : null;

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #F4F2EE 0%, #FFFFFF 100%)" }}>
      <div className="border-b border-[#E2DDD5] bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 group">
            <span className="text-xl">🌍</span>
            <span className="text-sm font-bold text-[#1A2530] group-hover:text-[#2A3A4A] transition-colors">WorkAbroad Hub</span>
          </button>
          <Link href="/" className="flex items-center gap-1.5 text-xs font-semibold text-[#1A2530] border border-[#E2DDD5] px-3.5 py-1.5 rounded-full hover:border-[#1A2530] bg-white transition-colors"
            data-testid="link-get-started">
            Get Started <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-10 space-y-5">
        {/* Identity card */}
        <div className="bg-white border border-[#E2DDD5] rounded-[24px] p-8" style={{ boxShadow: "0 20px 40px -10px rgba(0,0,0,0.06)" }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-block px-2.5 py-0.5 bg-[#1A2530] text-white text-[11px] font-semibold rounded-full">
              Verified Migration Profile
            </span>
          </div>
          <h1 className="text-2xl font-bold text-[#1A2530] leading-tight mb-3" style={{ fontFamily: "'Crimson Pro', Georgia, serif" }} data-testid="heading-profile-name">
            {fullName}
          </h1>
          <div className="space-y-1.5 text-sm text-[#5A6A7A]">
            {identity.country && (
              <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> {identity.country}</div>
            )}
            {memberSince && (
              <div className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5" /> WorkAbroad Hub member since {memberSince}</div>
            )}
            {identity.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5" /> {identity.phone}
                {identity.phoneVerified ? <VerifiedBadge /> : <SelfReportedBadge />}
              </div>
            )}
            {identity.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5" /> {identity.email}
                {identity.emailVerified ? <VerifiedBadge /> : <SelfReportedBadge />}
              </div>
            )}
          </div>
        </div>

        {/* IELTS card */}
        {ielts && (
          <div className="bg-white border border-[#E2DDD5] rounded-[20px] p-6" style={{ boxShadow: "0 8px 20px -8px rgba(0,0,0,0.05)" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-[#1A2530] flex items-center gap-2">
                <GraduationCap className="h-4 w-4" /> IELTS Score
              </h2>
              <VerifiedBadge label="TRF Verified" />
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
              <div>
                <p className="text-2xl font-bold text-[#1A2530]" data-testid="text-ielts-overall">{ielts.overallBand ?? "—"}</p>
                <p className="text-[11px] text-[#7A8A9A]">Overall</p>
              </div>
              <div>
                <p className="font-semibold text-[#1A2530]">{ielts.listeningBand ?? "—"}</p>
                <p className="text-[11px] text-[#7A8A9A]">Listening</p>
              </div>
              <div>
                <p className="font-semibold text-[#1A2530]">{ielts.readingBand ?? "—"}</p>
                <p className="text-[11px] text-[#7A8A9A]">Reading</p>
              </div>
              <div>
                <p className="font-semibold text-[#1A2530]">{ielts.writingBand ?? "—"}</p>
                <p className="text-[11px] text-[#7A8A9A]">Writing</p>
              </div>
              <div>
                <p className="font-semibold text-[#1A2530]">{ielts.speakingBand ?? "—"}</p>
                <p className="text-[11px] text-[#7A8A9A]">Speaking</p>
              </div>
            </div>
            <p className="text-[11px] text-[#9AAAB8] mt-3">Verified via {ielts.verifiedVia}</p>
          </div>
        )}

        {/* CV / ATS card */}
        {(cv || ats) && (
          <div className="bg-white border border-[#E2DDD5] rounded-[20px] p-6" style={{ boxShadow: "0 8px 20px -8px rgba(0,0,0,0.05)" }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-[#1A2530] flex items-center gap-2">
                <FileText className="h-4 w-4" /> CV &amp; ATS Assessment
              </h2>
              <SelfReportedBadge label="AI-reviewed" />
            </div>
            {ats && (
              <p className="text-sm text-[#1A2530] mb-2">
                ATS score: <span className="font-bold">{ats.score ?? "—"}</span>{ats.grade ? ` (${ats.grade})` : ""}
              </p>
            )}
            {cv && (
              <p className="text-sm text-[#5A6A7A] bg-[#F9F8F6] border border-[#EAE5DE] rounded-[12px] p-4 whitespace-pre-wrap" data-testid="text-cv-preview">
                {cv.preview}…
              </p>
            )}
          </div>
        )}

        {/* CTA banner */}
        <div className="bg-white border border-[#E2DDD5] rounded-[20px] p-6 flex flex-col sm:flex-row items-center gap-4" style={{ boxShadow: "0 8px 20px -8px rgba(0,0,0,0.05)" }}>
          <div className="flex-1">
            <p className="font-bold text-[#1A2530] mb-1">Hiring or recruiting from Kenya?</p>
            <p className="text-sm text-[#5A6A7A]">
              WorkAbroad Hub gives every worker a reusable, verified profile like this one — no re-proving credentials at every agent.
            </p>
          </div>
          <Link href="/" className="flex items-center gap-2 bg-[#1A2530] text-white text-sm font-bold px-6 py-3 rounded-full hover:bg-[#2A3A4A] transition-colors whitespace-nowrap flex-shrink-0"
            data-testid="btn-cta-getstarted">
            Get Started <Share2 className="h-4 w-4" />
          </Link>
        </div>

        <p className="text-center text-xs text-[#9AAAB8]">
          Generated by <strong>WorkAbroad Hub</strong> · Verified overseas job guidance for Kenyans
        </p>
      </div>
    </div>
  );
}
