/**
 * Shared background pipeline for VerifyX visa + offer checks.
 * Called after the endpoint has validated the upload and responded 202.
 */
import { createHash } from "crypto";
import { markToolScanJobDone, markToolScanJobError } from "../tools/tool-scan-jobs";
import { releaseToolCredit } from "../tools/tool-pay";
import { scanPdf, type FileKind } from "./guards";
import { createRequest, saveResult, failRequest, audit } from "./store";
import { publicReport } from "./report";
import type { ExtractionInput } from "./model";

export interface PipelineArgs {
  tool: "visa_check" | "offer_check";
  buffer: Buffer;
  mime: string;
  fileName: string;
  fileKind: FileKind | null;
  userId: string | null;
  paymentId: string | null;
  jobId: string;
  accessKey: string;
}

export async function runVerification(a: PipelineArgs): Promise<void> {
  const t0 = Date.now();
  let requestId: string | null = null;
  let referenceNo: string | null = null;
  const fail = async (message: string, refund: boolean) => {
    if (refund && a.paymentId) await releaseToolCredit(a.paymentId, a.tool).catch(() => {});
    if (requestId) await failRequest(requestId, message, Date.now() - t0);
    await markToolScanJobError(a.jobId, message);
  };
  try {
    const sha = createHash("sha256").update(a.buffer).digest("hex");
    const created = await createRequest({
      tool: a.tool, userId: a.userId, accessKey: a.accessKey, paymentId: a.paymentId,
      jobId: a.jobId, fileSha256: sha, mime: a.mime, fileKind: a.fileKind,
    });
    requestId = created.id; referenceNo = created.referenceNo;

    const isImage = a.mime.startsWith("image/");
    const pdf = a.fileKind === "pdf" ? scanPdf(a.buffer) : null;
    let input: ExtractionInput;
    if (isImage) {
      input = { kind: "image", imageBase64DataUrl: `data:${a.mime};base64,${a.buffer.toString("base64")}` };
    } else {
      const { extractTextFromBuffer } = await import("../utils/extract-text");
      const extracted = await extractTextFromBuffer(a.buffer, a.mime, a.fileName);
      if (!extracted?.text || extracted.text.trim().length < 50) {
        await fail("We couldn't read enough text from this file — no charge has been kept. Try a clearer scan, or upload a photo (JPG/PNG) of each page.", true);
        return;
      }
      input = { kind: "text", text: extracted.text, sourceFilename: a.fileName };
    }

    let out: any;
    if (a.tool === "visa_check") {
      const { analyzeVisa } = await import("../visa-verify/analyzer");
      out = await analyzeVisa(input, { pdf });
    } else {
      const { analyzeOffer } = await import("../offer-verify/analyzer");
      out = await analyzeOffer(input);
    }
    if (!out.ok) {
      await fail(out.message, true);
      return;
    }

    const report = { ...out.report, requestId, referenceNo };
    const fieldMap: Record<string, { value: string | null; confidence: number | null; userCorrected?: boolean }> = {};
    for (const fv of report.extractedFields) fieldMap[fv.field] = { value: fv.value, confidence: fv.confidence, userCorrected: fv.userCorrected };
    await saveResult({
      requestId, report, extractedFields: fieldMap, extractionJson: a.tool === "visa_check" ? { ...out.extraction, __pdf: pdf } : out.extraction,
      usage: out.usage, latencyMs: Date.now() - t0, revision: 1,
    });
    await markToolScanJobDone(a.jobId, publicReport(report));
    console.log(`[VerifyX] ${a.tool} ${referenceNo} outcome=${report.outcome} findings=${report.findings.length} rejected=${report._rejected?.length ?? 0} in ${Date.now() - t0}ms`);
  } catch (err: any) {
    console.error(`[VerifyX] ${a.tool} job=${a.jobId} failed:`, err?.message);
    await audit("request.error", { requestId, detail: { message: String(err?.message ?? err).slice(0, 300) } });
    await fail("We couldn't check this document right now — no charge has been kept. Please try again shortly.", true);
  }
}
