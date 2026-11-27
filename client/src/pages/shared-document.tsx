import { useEffect, useState } from "react";
import { neutralDocName } from "@/lib/doc-filename";
import { useParams, useLocation, Link } from "wouter";
import { Loader2, Download, Globe, Share2, ArrowRight, FileDown } from "lucide-react";

type SharedDoc = {
  orderId: string;
  serviceName: string;
  serviceId: string;
  content: string;
  createdAt: string;
  sharedBy: string;
};

const SERVICE_ICONS: Record<string, string> = {
  ats_cv: "📄", country_cv: "🌍", cover_letter: "✉️", linkedin: "💼",
  interview: "🎯", visa: "🛂", sop: "📝", motivation: "✨",
  contract: "⚖️", employer: "🔍", departure: "✈️", guided: "🤝",
};

function getIcon(serviceId = "", serviceName = "") {
  const key = (serviceId + serviceName).toLowerCase();
  for (const [k, v] of Object.entries(SERVICE_ICONS)) {
    if (key.includes(k)) return v;
  }
  return "📄";
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

function shareAgain(doc: SharedDoc) {
  const preview = doc.content.substring(0, 200).trim() + (doc.content.length > 200 ? "…" : "");
  const shareUrl = window.location.href;
  const message =
    `📄 *${doc.serviceName}*\n\n` +
    `"${preview}"\n\n` +
    `🔗 View full document: ${shareUrl}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
}

export default function SharedDocument() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [doc, setDoc] = useState<SharedDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) { setError("Invalid link."); setLoading(false); return; }
    fetch(`/api/shared/${id}`)
      .then(r => {
        if (!r.ok) throw new Error(r.status === 404 ? "not_found" : "error");
        return r.json();
      })
      .then(data => { setDoc(data); setLoading(false); })
      .catch(err => {
        setError(err.message === "not_found" ? "This document link is invalid or has been removed." : "Failed to load document. Please try again.");
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #F4F2EE 0%, #FFFFFF 100%)" }}>
        <Loader2 className="h-6 w-6 animate-spin text-[#1A2530]" />
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "linear-gradient(135deg, #F4F2EE 0%, #FFFFFF 100%)" }}>
        <div className="bg-white border border-[#E2DDD5] rounded-[24px] p-10 max-w-md w-full text-center" style={{ boxShadow: "0 20px 40px -10px rgba(0,0,0,0.05)" }}>
          <div className="text-5xl mb-4">🔍</div>
          <h2 className="text-xl font-bold text-[#1A2530] mb-2">Document not found</h2>
          <p className="text-sm text-[#5A6A7A] mb-6">{error || "This shared document could not be found."}</p>
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 bg-[#1A2530] text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-[#2A3A4A] transition-colors"
          >
            <Globe className="h-4 w-4" /> Go back
          </button>
        </div>
      </div>
    );
  }

  const icon = getIcon(doc.serviceId, doc.serviceName);
  const date = new Date(doc.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #F4F2EE 0%, #FFFFFF 100%)" }}>
      {/* 2026-11-27 (Tony): no WorkAbroad Hub branding on a shared document —
          the person may forward this link to an employer. */}
      <div className="max-w-3xl mx-auto px-5 py-10">
        {/* Document card */}
        <div className="bg-white border border-[#E2DDD5] rounded-[24px] overflow-hidden" style={{ boxShadow: "0 20px 40px -10px rgba(0,0,0,0.06)" }}>
          {/* Card header */}
          <div className="px-8 pt-8 pb-6 border-b border-[#F0ECE6]">
            <div className="flex items-start gap-4">
              <div className="text-5xl flex-shrink-0">{icon}</div>
              <div className="flex-1 min-w-0">
                <h1
                  className="text-2xl font-bold text-[#1A2530] leading-tight mb-1"
                  style={{ fontFamily: "'Crimson Pro', Georgia, serif" }}
                  data-testid="heading-document-title"
                >
                  {doc.serviceName}
                </h1>
                <p className="text-sm text-[#7A8A9A]">
                  Shared by <strong className="text-[#1A2530]">{doc.sharedBy}</strong>
                  {" · "}Generated on {date}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="inline-block px-2.5 py-0.5 bg-green-50 text-green-700 text-[11px] font-semibold rounded-full">
                    Verified Document
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-8 py-6">
            <div
              className="bg-[#F9F8F6] border border-[#EAE5DE] rounded-[16px] p-6 text-sm leading-relaxed whitespace-pre-wrap text-[#1A2530] font-mono"
              data-testid="text-document-content"
            >
              {doc.content}
            </div>
          </div>

          {/* Action row */}
          <div className="px-8 pb-8 flex flex-wrap gap-3">
            <button
              onClick={() => window.open(`/api/shared/${doc.orderId}/pdf`, "_blank")}
              className="flex items-center gap-2 bg-[#1A2530] text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-[#2A3A4A] transition-colors"
              data-testid="btn-download-pdf-shared"
            >
              <FileDown className="h-4 w-4" /> Download PDF
            </button>
            <button
              onClick={() => downloadText(doc.content, neutralDocName(doc.serviceId || doc.serviceName, "txt"))}
              className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-full border border-[#E2DDD5] bg-white text-[#1A2530] hover:border-[#1A2530] transition-colors"
              data-testid="btn-download-txt-shared"
            >
              <Download className="h-4 w-4" /> Download .txt
            </button>
            <button
              onClick={() => shareAgain(doc)}
              className="flex items-center gap-2 bg-[#25D366] text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-[#20B558] transition-colors"
              data-testid="btn-reshare-whatsapp"
            >
              <Share2 className="h-4 w-4" /> Share via WhatsApp
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
