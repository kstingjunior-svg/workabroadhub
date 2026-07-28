/**
 * PhotoUploadField — optional passport-style photo picker for CV services.
 *
 * Design intent (founder Tony's brief, 2026-07):
 *   "I want our CVs not to be same as anyone. It doesn't matter even if it
 *   is human written. I want ours to be the best. Warm, human, real."
 *
 * So the copy is deliberately conversational, the whole field is 100%
 * optional (Skip is one tap), and the preview shows a REAL rounded card
 * so the user sees exactly what will land on the final PDF/DOCX.
 *
 * On mobile Chrome the file picker natively offers "Take a photo" so users
 * can snap a fresh photo on the spot — no gallery-only limitation.
 *
 * Client-side compression: everything gets squashed to a 400x400 max JPEG
 * at 0.85 quality (usually 40-150 KB) so the upload is fast even on 3G,
 * AND server storage stays cheap.
 */

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, X, ImagePlus, Loader2, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PhotoUploadFieldProps {
  /** Currently-selected photo (compressed JPEG blob). Null when empty. */
  value: Blob | null;
  onChange: (photo: Blob | null) => void;
  /** Optional label override; sensible default when omitted. */
  label?: string;
}

/**
 * Compress an image File in-browser: fit inside a 400x400 box (preserving
 * aspect ratio) then export as JPEG q=0.85. Handles landscape or portrait
 * gracefully — the CV renderer will center-crop to a square anyway.
 */
async function compressToJpeg(file: File, maxDim = 400, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the image file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not decode the image"));
      img.onload = () => {
        try {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width  = Math.max(1, Math.round(img.width  * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("Canvas context unavailable"));
          // Fill white (not black) as background — matters if the source is
          // a transparent PNG or a corner-clipped photo.
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error("Compression returned null"))),
            "image/jpeg",
            quality,
          );
        } catch (e) {
          reject(e);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function PhotoUploadField({ value, onChange, label }: PhotoUploadFieldProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Keep an object URL for the preview as long as `value` is set.
  // Re-derive whenever value changes, and revoke the previous URL.
  if (value) {
    // Only recompute if the current previewUrl doesn't match the current blob.
    // Cheap check: object URLs are unique-per-call so we can compare by reference
    // via a hidden data attribute — but simpler: just always recreate on onChange.
  }

  async function handleFile(f: File | null) {
    if (!f) return;
    if (!/^image\//.test(f.type)) {
      toast({
        title: "That's not a photo",
        description: "Please pick an image (JPG or PNG). Even a phone snap works great.",
        variant: "destructive",
      });
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast({
        title: "Photo is very large",
        description: "Please pick a smaller image. Anything under 5 MB is perfect.",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    try {
      const compressed = await compressToJpeg(f);
      onChange(compressed);
      // Fresh preview URL for the new blob
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(compressed));
    } catch (err: any) {
      toast({
        title: "Couldn't process the photo",
        description: err?.message || "Please try a different photo, or skip this step.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  }

  function handleRemove() {
    onChange(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-2" data-testid="photo-upload-field">
      <div className="flex items-start justify-between gap-3">
        <div>
          <label className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {label || "Add your photo"}
            {" "}
            <span className="text-xs font-normal text-muted-foreground">
              (optional — most professional CVs include one)
            </span>
          </label>
          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
            A friendly, passport-style headshot goes top-right on your CV.
            A phone photo works — clear background, good light, look at the camera.
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        // On mobile, "capture" nudges the camera to open instead of the gallery.
        // Omitted so users still have both options — gallery + fresh photo.
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        className="hidden"
        data-testid="input-photo"
      />

      {/* Empty state — big friendly card */}
      {!value && !processing && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full flex items-center gap-3 border-2 border-dashed border-teal-300 dark:border-teal-800 hover:border-teal-500 dark:hover:border-teal-600 hover:bg-teal-50/40 dark:hover:bg-teal-950/20 rounded-xl px-4 py-4 transition-colors group"
          data-testid="button-pick-photo"
        >
          <div className="h-14 w-14 rounded-full bg-teal-100 dark:bg-teal-950/40 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
            <Camera className="h-6 w-6 text-teal-600 dark:text-teal-400" />
          </div>
          <div className="text-left flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Take or upload a photo
            </p>
            <p className="text-xs text-muted-foreground">
              Tap to pick from your gallery or snap a fresh one
            </p>
          </div>
          <ImagePlus className="h-5 w-5 text-teal-500 flex-shrink-0" />
        </button>
      )}

      {/* Processing state */}
      {processing && (
        <div className="w-full flex items-center gap-3 border-2 border-teal-300 dark:border-teal-800 rounded-xl px-4 py-4 bg-teal-50/40 dark:bg-teal-950/20">
          <Loader2 className="h-6 w-6 text-teal-600 animate-spin flex-shrink-0" />
          <p className="text-sm text-gray-700 dark:text-gray-300">Preparing your photo…</p>
        </div>
      )}

      {/* Preview — this is EXACTLY how it'll look on the CV (rounded square). */}
      {value && previewUrl && !processing && (
        <div className="flex items-start gap-4 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-4 bg-white dark:bg-gray-950">
          <div className="relative flex-shrink-0">
            {/* Rounded square matches the PDF/DOCX embed shape */}
            <div className="h-24 w-24 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 shadow-sm bg-gray-100">
              <img
                src={previewUrl}
                alt="Your CV photo"
                className="h-full w-full object-cover"
                data-testid="img-photo-preview"
              />
            </div>
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Looking good.
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This is exactly how your photo will appear at the top-right of your CV.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
                data-testid="button-change-photo"
              >
                <Camera className="h-3.5 w-3.5 mr-1.5" />
                Change
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemove}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                data-testid="button-remove-photo"
              >
                <X className="h-3.5 w-3.5 mr-1.5" />
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Privacy nudge — always shown, small but visible */}
      <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground leading-relaxed">
        <Info className="h-3 w-3 flex-shrink-0 mt-0.5" />
        <span>
          Your photo is only used to embed in YOUR CV. We don't share it, sell it, or use it for AI training.
          You can also skip this — a clean text CV is still a great CV.
        </span>
      </div>
    </div>
  );
}
