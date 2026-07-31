/**
 * ShareSuccessModal — the "share your win" popup after a successful order.
 *
 * Rationale: every paid user becomes a billboard. When someone finishes a
 * CV Revamp / LinkedIn / Cover Letter, we auto-show this modal with a
 * pre-designed shareable image + one-tap share to WhatsApp Status.
 *
 * Share flow on mobile (the 95% case):
 *   1. Tap "Share to WhatsApp" → navigator.share() opens native share sheet
 *      with the PNG file + suggested caption. User picks Status / a friend
 *      / any app. Zero friction.
 *
 * Share flow on desktop / older browsers (fallback):
 *   1. Tap "Download image" → PNG saves to Downloads
 *   2. Tap "Copy link" → shareable URL copied to clipboard
 *   3. User opens WhatsApp Web / desktop and does it themselves
 *
 * Both flows include a "Copy referral link" button as a lightweight share
 * option for anyone who doesn't want to post the image.
 */

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Share2, Download, Link as LinkIcon, Check, MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ShareSuccessCard, buildShareCardSvg, type ShareCardProps } from "@/components/share-success-card";
import { buildShareUrl, svgToPngBlob } from "@/lib/referral";

interface ShareSuccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  card: ShareCardProps;
}

export function ShareSuccessModal({ open, onOpenChange, orderId, card }: ShareSuccessModalProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<"share" | "download" | "copy" | null>(null);
  const [copied, setCopied] = useState(false);

  const svg = useMemo(() => buildShareCardSvg(card), [card]);
  const shareUrl = useMemo(() => buildShareUrl(orderId), [orderId]);

  // Feature detection — done once, memoized so buttons don't flicker
  const [canNativeShare, setCanNativeShare] = useState(false);
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    // Probe with a dummy file — some browsers report canShare() true for
    // { title, text } but throw on { files: [...] }, so we test the file path.
    try {
      const probeFile = new File([new Blob(["x"])], "probe.png", { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
      if (typeof nav.share === "function" && typeof nav.canShare === "function") {
        setCanNativeShare(nav.canShare({ files: [probeFile] }));
      }
    } catch {
      setCanNativeShare(false);
    }
  }, []);

  const caption = useMemo(() => {
    const first = (card.firstName || "").split(/\s+/)[0] || "I";
    const service = card.serviceName || "CV";
    const country = card.targetCountry ? ` for ${card.targetCountry}` : "";
    return `${first} just got a professional ${service}${country} on WorkAbroadHub — for KES 99. Take a look and get yours 👇\n${shareUrl}`;
  }, [card, shareUrl]);

  async function handleNativeShare() {
    if (busy) return;
    setBusy("share");
    try {
      const blob = await svgToPngBlob(svg);
      const file = new File([blob], "my-workabroadhub-win.png", { type: "image/png" });
      const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
      if (!nav.share) throw new Error("Share API unavailable");
      await nav.share({
        files: [file],
        title: "My CV is optimized",
        text: caption,
      });
      toast({ title: "Thanks for sharing!", description: "Every share helps another Kenyan land a real overseas job." });
      // Don't auto-close — let the user share to multiple places if they want
    } catch (e: any) {
      // AbortError means the user cancelled the share sheet — not an error
      if (e?.name !== "AbortError") {
        // 2026-07: auto-fall-through to download instead of showing a scary
        // toast. Web Share fails often on desktop Chrome + some in-app
        // WebViews, and users don't understand what "manually on WhatsApp
        // Status" means. Just download the image + tell them what to do.
        try {
          await handleDownload();
          toast({
            title: "Image saved instead",
            description: "Your browser blocked the share sheet — we saved the image to your downloads. Open WhatsApp → Status → Add photo → pick it.",
            duration: 8000,
          });
        } catch {
          toast({
            title: "Couldn't share",
            description: "Please tap 'Download image' below and post it manually on WhatsApp Status.",
            variant: "destructive",
          });
        }
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleDownload() {
    if (busy) return;
    setBusy("download");
    try {
      const blob = await svgToPngBlob(svg);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "my-workabroadhub-win.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: "Image saved",
        description: "Now open WhatsApp → Status → Add photo → pick the image you just downloaded.",
      });
    } catch {
      toast({ title: "Download failed", description: "Please try again or use the copy-link option.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function handleCopyLink() {
    if (busy) return;
    setBusy("copy");
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast({ title: "Link copied", description: "Paste it anywhere — WhatsApp, Facebook, X, wherever." });
    } catch {
      toast({ title: "Couldn't copy", description: "Long-press the link box and copy manually.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  function handleWhatsAppText() {
    // Fallback that opens WhatsApp with a pre-filled text message (no image).
    // Useful on iOS Safari when navigator.share() doesn't play nicely.
    const encoded = encodeURIComponent(caption);
    window.open(`https://wa.me/?text=${encoded}`, "_blank", "noopener,noreferrer");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="modal-share-success">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-gray-900 dark:text-white">
            Share your win — help a friend do it too
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-600 dark:text-gray-400">
            Post this on your WhatsApp Status. When a friend gets theirs through your link, we'll credit you.
          </DialogDescription>
        </DialogHeader>

        {/* Card preview */}
        <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-sm">
          <ShareSuccessCard {...card} />
        </div>

        {/* Actions */}
        <div className="space-y-2">
          {canNativeShare ? (
            <Button
              onClick={handleNativeShare}
              disabled={busy !== null}
              className="w-full h-12 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-semibold text-base"
              data-testid="button-native-share"
            >
              {busy === "share" ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Share2 className="h-5 w-5 mr-2" />}
              Share to WhatsApp Status
            </Button>
          ) : (
            <Button
              onClick={handleWhatsAppText}
              className="w-full h-12 bg-green-500 hover:bg-green-600 text-white font-semibold text-base"
              data-testid="button-whatsapp-text"
            >
              <MessageCircle className="h-5 w-5 mr-2" />
              Open WhatsApp
            </Button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={handleDownload}
              disabled={busy !== null}
              variant="outline"
              className="h-11"
              data-testid="button-download-image"
            >
              {busy === "download" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Download image
            </Button>
            <Button
              onClick={handleCopyLink}
              disabled={busy !== null}
              variant="outline"
              className="h-11"
              data-testid="button-copy-link"
            >
              {copied ? <Check className="h-4 w-4 mr-2 text-green-600" /> : <LinkIcon className="h-4 w-4 mr-2" />}
              {copied ? "Copied!" : "Copy link"}
            </Button>
          </div>
        </div>

        {/* Referral link — always visible so users can copy manually */}
        <div className="rounded-md bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-1">Your referral link</p>
          <p className="text-xs text-gray-700 dark:text-gray-300 font-mono break-all">{shareUrl}</p>
        </div>

        <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center leading-relaxed">
          When someone signs up and pays through your link, we credit you with a free CV re-check or KES 20 balance —
          whichever you prefer. Check your account after a friend converts.
        </p>
      </DialogContent>
    </Dialog>
  );
}
