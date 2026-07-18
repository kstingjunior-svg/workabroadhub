/**
 * Wrong Document Card — shared component.
 *
 * Rendered when a screening endpoint responds with
 *   { wrongDocumentType: true, detected, expected, message, suggestedTool, ... }
 *
 * Instead of a red error toast, we render a friendly card telling the user
 * what type of document we detected and linking them to the correct tool.
 * This is what makes the screening tools feel "smart" — they don't blindly
 * run analysis on the wrong document, they redirect the user.
 */

import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileWarning,
  ArrowRight,
  Info,
} from "lucide-react";

export type DocumentType =
  | "cv" | "job_advert" | "offer_letter" | "visa" | "unknown";

export interface WrongDocumentPayload {
  wrongDocumentType: true;
  detected:          DocumentType;
  expected:          DocumentType;
  confidence:        number;
  message:           string;
  suggestedTool: {
    path:  string;
    label: string;
  };
  reasons?: Array<{ category: string; weight: number; signal: string }>;
}

interface Props {
  payload: WrongDocumentPayload;
  onTryAnother?: () => void;
  /** 2026-07: user overrides the wrong-doc gate and forces a full analysis.
   *  Wired up on the caller side so the caller can re-submit with
   *  { forceAnalyze: true }. */
  onAnalyzeAnyway?: () => void;
}

export function WrongDocumentCard({ payload, onTryAnother, onAnalyzeAnyway }: Props) {
  const isUnknown = payload.detected === "unknown";
  const showRedirect = !isUnknown && payload.suggestedTool.path !== "";
  const showOverride = isUnknown && !!onAnalyzeAnyway;

  return (
    <Card className="border-2 border-amber-200 dark:border-amber-800">
      <CardContent className="pt-6 space-y-5">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex-shrink-0">
            <FileWarning className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-1">
              Wrong document type
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              {isUnknown
                ? "We couldn't identify this document"
                : `This looks like a ${humanType(payload.detected)}`}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {payload.message}
            </p>
          </div>
        </div>

        {/* Suggested tool card */}
        {showRedirect && (
          <Link href={payload.suggestedTool.path}>
            <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 hover:border-indigo-400 dark:hover:border-indigo-600 hover:shadow-md transition-all cursor-pointer group">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-indigo-600 dark:text-indigo-400 uppercase tracking-wide mb-1">
                    Try this tool instead
                  </div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    {payload.suggestedTool.label}
                  </div>
                </div>
                <ArrowRight className="h-6 w-6 text-indigo-500 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </Link>
        )}

        {/* Why did we say that? — signals */}
        {payload.reasons && payload.reasons.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-2">
              <Info className="h-4 w-4" />
              Why did we say that? ({payload.confidence}% confidence)
            </summary>
            <ul className="mt-3 space-y-1 pl-6">
              {payload.reasons.slice(0, 5).map((r, i) => (
                <li key={i} className="text-xs text-slate-600 dark:text-slate-400 list-disc">
                  {r.signal}
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* 2026-07: escape hatch for false-negatives. If the classifier
            couldn't identify the doc but the user knows it IS the right
            type, they can force-continue and we'll run the full analysis. */}
        {showOverride && (
          <Button
            onClick={onAnalyzeAnyway}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white"
            data-testid="button-analyze-anyway"
          >
            Analyze anyway — it IS a {humanType(payload.expected)}
          </Button>
        )}
        {onTryAnother && (
          <Button variant="outline" onClick={onTryAnother} className="w-full">
            Upload a different document
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: safely detect a wrongDocumentType response from an arbitrary
// object. Endpoints put this in the JSON body of a 422.
// ─────────────────────────────────────────────────────────────────────────────

export function isWrongDocumentResponse(x: unknown): x is WrongDocumentPayload {
  return !!(
    x &&
    typeof x === "object" &&
    (x as any).wrongDocumentType === true &&
    typeof (x as any).detected === "string" &&
    typeof (x as any).suggestedTool === "object"
  );
}

function humanType(t: DocumentType): string {
  switch (t) {
    case "cv":           return "CV / résumé";
    case "job_advert":   return "job advert";
    case "offer_letter": return "job offer letter";
    case "visa":         return "visa or work permit";
    default:             return "document";
  }
}
