import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Copy, Check, Share2, ExternalLink } from "lucide-react";
import { SiWhatsapp, SiFacebook } from "react-icons/si";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ReportShareBarProps {
  toolName: "ats" | "scam";
  reportId: string;
}

export function ReportShareBar({ toolName, reportId }: ReportShareBarProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const reportUrl = `${window.location.origin}/report/${toolName}/${reportId}`;
  const toolLabel = toolName === "ats" ? "ATS CV Analysis" : "Job Scam Check";
  const shareText = `Check out my free ${toolLabel} result on WorkAbroad Hub 🌍`;
  const encode = (s: string) => encodeURIComponent(s);

  const { mutate: trackShare } = useMutation({
    mutationFn: () => apiRequest("POST", `/api/tool-reports/${reportId}/share`),
  });

  const openShare = (url: string) => {
    trackShare();
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(reportUrl).then(() => {
      trackShare();
      setCopied(true);
      toast({ title: "Report link copied!", description: "Share it with friends." });
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Share2 className="h-4 w-4 text-blue-500" />
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">Share Your Results</p>
          <Link href={`/report/${toolName}/${reportId}`} className="ml-auto">
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-blue-600 dark:text-blue-400 px-2" data-testid="button-view-report">
              <ExternalLink className="h-3 w-3" /> View Full Report
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button
            size="sm"
            onClick={() => openShare(`https://api.whatsapp.com/send?text=${encode(`${shareText} ${reportUrl}`)}`)}
            className="h-9 text-xs gap-1.5 bg-[#25D366] hover:bg-[#1ebe5d] text-white border-0"
            data-testid="button-share-report-whatsapp"
          >
            <SiWhatsapp className="h-3.5 w-3.5" /> WhatsApp
          </Button>
          <Button
            size="sm"
            onClick={() => openShare(`https://www.facebook.com/sharer/sharer.php?u=${encode(reportUrl)}`)}
            className="h-9 text-xs gap-1.5 bg-[#1877F2] hover:bg-[#0d6be0] text-white border-0"
            data-testid="button-share-report-facebook"
          >
            <SiFacebook className="h-3.5 w-3.5" /> Facebook
          </Button>
          <Button
            size="sm"
            onClick={() => openShare(`https://www.linkedin.com/sharing/share-offsite/?url=${encode(reportUrl)}`)}
            className="h-9 text-xs gap-1.5 bg-[#0A66C2] hover:bg-[#0958a8] text-white border-0"
            data-testid="button-share-report-linkedin"
          >
            <SiLinkedin className="h-3.5 w-3.5" /> LinkedIn
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            className="h-9 text-xs gap-1.5"
            data-testid="button-copy-report-link"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied!" : "Copy Link"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
