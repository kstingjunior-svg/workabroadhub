import { jsPDF } from "jspdf";

export interface PdfDocumentOptions {
  serviceName: string;
  content: string;
  sharedBy?: string;     // "G from Kenya" — shown on public shared page
  forUser?: string;      // actual viewer name/email — shown on My Documents download
  generatedOn?: string;
}

// ── Brand colours ────────────────────────────────────────────────────────────
const C_DARK  = [26,  37,  48]  as const; // #1A2530
const C_MID   = [90,  106, 122] as const; // #5A6A7A
const C_LIGHT = [226, 221, 213] as const; // #E2DDD5

// ── Wrap raw text into jsPDF lines, preserving blank lines as paragraph breaks
function buildLines(pdf: jsPDF, text: string, maxWidth: number): string[] {
  const result: string[] = [];
  for (const para of text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
    if (para.trim() === "") {
      result.push(""); // blank line = paragraph gap
    } else {
      result.push(...pdf.splitTextToSize(para, maxWidth));
    }
  }
  return result;
}

// ── Continuation header (page 2+) ────────────────────────────────────────────
function drawContinuationHeader(pdf: jsPDF, pageW: number, mX: number, title: string) {
  pdf.setFillColor(...C_DARK);
  pdf.rect(0, 0, pageW, 16, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(255, 255, 255);
  pdf.text(`WorkAbroad Hub  —  ${title}`, mX, 10);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(180, 195, 210);
  pdf.text("workabroadhub.tech", pageW - mX, 10, { align: "right" });
  pdf.setDrawColor(...C_LIGHT);
  pdf.setLineWidth(0.2);
  pdf.line(mX, 20, pageW - mX, 20);
}

// ── Main export ───────────────────────────────────────────────────────────────
export function downloadAsPDF(opts: PdfDocumentOptions): void {
  const { serviceName, content, sharedBy, forUser, generatedOn } = opts;

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageW  = pdf.internal.pageSize.getWidth();   // 210
  const pageH  = pdf.internal.pageSize.getHeight();  // 297
  const mX     = 20;
  const cW     = pageW - mX * 2;   // 170 mm — matches reference splitTextToSize width
  const footerY = 285;             // matches reference footer y position

  // ── Page 1 header band ─────────────────────────────────────────────────────
  pdf.setFillColor(...C_DARK);
  pdf.rect(0, 0, pageW, 22, "F");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.setTextColor(255, 255, 255);
  pdf.text("WorkAbroad Hub", mX, 15);   // matches reference: fontSize 20, y≈20

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(180, 195, 210);
  pdf.text("workabroadhub.tech", pageW - mX, 15, { align: "right" });

  // ── Service name (reference: fontSize 14, textColor #5A6A7A, y=30) ────────
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.setTextColor(...C_MID);
  pdf.text(serviceName, mX, 30);

  // ── Divider (reference: drawColor #E2DDD5, line 20–190, y=35) ────────────
  pdf.setDrawColor(...C_LIGHT);
  pdf.setLineWidth(0.5);
  pdf.line(mX, 35, pageW - mX, 35);

  // ── Metadata block (reference: fontSize 10, textColor #7A8A9A, y=45 / 52)
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(122, 138, 153);

  let metaY = 45;
  if (generatedOn) {
    pdf.text(`Generated: ${generatedOn}`, mX, metaY);
    metaY += 7;
  }
  if (forUser) {
    // Reference: "For: Grace Wanjiku" or email fallback
    pdf.text(`For: ${forUser}`, mX, metaY);
    metaY += 7;
  }
  if (sharedBy) {
    pdf.text(`Shared by: ${sharedBy}`, mX, metaY);
    metaY += 7;
  }

  // ── Content (reference: fontSize 11, textColor ~#1E2A36, starts y=65) ────
  pdf.setFont("courier", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(30, 42, 54);

  const lineH    = 5.5;
  const bodyStart = Math.max(metaY + 8, 65); // honour reference y=65 minimum
  const lines    = buildLines(pdf, content, cW);

  let curY = bodyStart;

  for (const line of lines) {
    // Leave 12 mm for footer before page break
    if (curY + lineH > footerY - 4) {
      pdf.addPage();
      drawContinuationHeader(pdf, pageW, mX, serviceName);
      curY = 28;
      // Reset content font after continuation header
      pdf.setFont("courier", "normal");
      pdf.setFontSize(11);
      pdf.setTextColor(30, 42, 54);
    }
    if (line !== "") {
      pdf.text(line, mX, curY);
    }
    curY += lineH;
  }

  // ── Footer loop — exactly matches reference pattern ───────────────────────
  // Uses getNumberOfPages() so every footer shows "Page X of Y"
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(180, 180, 180);
    pdf.text(
      `Page ${i} of ${pageCount}  —  WorkAbroad Hub  —  Verified Overseas Job Guidance`,
      pageW / 2,
      footerY,
      { align: "center" },
    );
  }

  // ── Filename — matches reference: WorkAbroad_{name}_{timestamp}.pdf ───────
  const safe = serviceName.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
  pdf.save(`WorkAbroad_${safe}_${Date.now()}.pdf`);
}
