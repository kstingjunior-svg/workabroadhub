"use strict";
/**
 * Document renderer — converts AI-generated text content into downloadable
 * Word (.docx) and PDF files for service deliverables (CVs, cover letters,
 * SOPs, motivation letters, etc.).
 *
 * Input format: plain text where blank lines separate paragraphs and lines
 * beginning with "# " / "## " are treated as headings. This matches the
 * shape gpt-4o-mini returns when asked for "a clean, ATS-friendly CV".
 *
 * Output: Node Buffer ready to be sent via res.send() with the appropriate
 * Content-Type and Content-Disposition headers.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderDocx = renderDocx;
exports.renderPdf = renderPdf;
const docx_1 = require("docx");
const pdfkit_1 = __importDefault(require("pdfkit"));
// ─── DOCX ──────────────────────────────────────────────────────────────────────
function bodyToDocxParagraphs(body) {
    const lines = body.replace(/\r\n/g, "\n").split("\n");
    const paragraphs = [];
    for (const raw of lines) {
        const line = raw.trim();
        if (!line) {
            paragraphs.push(new docx_1.Paragraph({ children: [new docx_1.TextRun("")] }));
            continue;
        }
        // Markdown-ish heading detection
        if (line.startsWith("### ")) {
            paragraphs.push(new docx_1.Paragraph({
                heading: docx_1.HeadingLevel.HEADING_3,
                children: [new docx_1.TextRun({ text: line.slice(4), bold: true })],
            }));
        }
        else if (line.startsWith("## ")) {
            paragraphs.push(new docx_1.Paragraph({
                heading: docx_1.HeadingLevel.HEADING_2,
                children: [new docx_1.TextRun({ text: line.slice(3), bold: true })],
            }));
        }
        else if (line.startsWith("# ")) {
            paragraphs.push(new docx_1.Paragraph({
                heading: docx_1.HeadingLevel.HEADING_1,
                children: [new docx_1.TextRun({ text: line.slice(2), bold: true })],
            }));
        }
        else if (/^[*-]\s/.test(line)) {
            paragraphs.push(new docx_1.Paragraph({
                bullet: { level: 0 },
                children: [new docx_1.TextRun(line.replace(/^[*-]\s/, ""))],
            }));
        }
        else {
            // Bold spans wrapped in **...**
            const parts = line.split(/(\*\*[^*]+\*\*)/);
            const runs = parts.map((p) => p.startsWith("**") && p.endsWith("**")
                ? new docx_1.TextRun({ text: p.slice(2, -2), bold: true })
                : new docx_1.TextRun(p));
            paragraphs.push(new docx_1.Paragraph({ children: runs }));
        }
    }
    return paragraphs;
}
async function renderDocx(input) {
    const paragraphs = [];
    if (input.title) {
        paragraphs.push(new docx_1.Paragraph({
            heading: docx_1.HeadingLevel.TITLE,
            alignment: docx_1.AlignmentType.CENTER,
            children: [new docx_1.TextRun({ text: input.title, bold: true })],
        }));
        paragraphs.push(new docx_1.Paragraph({ children: [new docx_1.TextRun("")] })); // spacer
    }
    paragraphs.push(...bodyToDocxParagraphs(input.body));
    if (input.footer) {
        paragraphs.push(new docx_1.Paragraph({ children: [new docx_1.TextRun("")] }));
        paragraphs.push(new docx_1.Paragraph({
            alignment: docx_1.AlignmentType.CENTER,
            children: [
                new docx_1.TextRun({
                    text: input.footer,
                    italics: true,
                    color: "888888",
                    size: 18, // half-points; 18 = 9pt
                }),
            ],
        }));
    }
    const doc = new docx_1.Document({
        creator: "WorkAbroad Hub",
        title: input.title ?? "WorkAbroad Hub Document",
        description: "AI-generated career document",
        sections: [{ children: paragraphs }],
    });
    return docx_1.Packer.toBuffer(doc);
}
// ─── PDF ──────────────────────────────────────────────────────────────────────
function renderPdf(input) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new pdfkit_1.default({ size: "A4", margin: 50 });
            const chunks = [];
            doc.on("data", (c) => chunks.push(c));
            doc.on("end", () => resolve(Buffer.concat(chunks)));
            doc.on("error", reject);
            if (input.title) {
                doc
                    .font("Helvetica-Bold")
                    .fontSize(20)
                    .text(input.title, { align: "center" });
                doc.moveDown(1);
            }
            const lines = input.body.replace(/\r\n/g, "\n").split("\n");
            for (const raw of lines) {
                const line = raw.trim();
                if (!line) {
                    doc.moveDown(0.5);
                    continue;
                }
                if (line.startsWith("### ")) {
                    doc.font("Helvetica-Bold").fontSize(12).text(line.slice(4));
                    doc.moveDown(0.3);
                }
                else if (line.startsWith("## ")) {
                    doc.font("Helvetica-Bold").fontSize(14).text(line.slice(3));
                    doc.moveDown(0.3);
                }
                else if (line.startsWith("# ")) {
                    doc.font("Helvetica-Bold").fontSize(16).text(line.slice(2));
                    doc.moveDown(0.5);
                }
                else if (/^[*-]\s/.test(line)) {
                    doc.font("Helvetica").fontSize(11).text("•  " + line.replace(/^[*-]\s/, ""));
                }
                else {
                    // Render with bold spans
                    const parts = line.split(/(\*\*[^*]+\*\*)/);
                    let first = true;
                    for (const part of parts) {
                        if (!part)
                            continue;
                        const isBold = part.startsWith("**") && part.endsWith("**");
                        const text = isBold ? part.slice(2, -2) : part;
                        doc
                            .font(isBold ? "Helvetica-Bold" : "Helvetica")
                            .fontSize(11)
                            .text(text, { continued: !isLast(parts, part) });
                        first = false;
                    }
                    // Force newline after the paragraph
                    doc.text("");
                }
            }
            if (input.footer) {
                doc.moveDown(2);
                doc
                    .font("Helvetica-Oblique")
                    .fontSize(9)
                    .fillColor("#888")
                    .text(input.footer, { align: "center" });
            }
            doc.end();
        }
        catch (err) {
            reject(err);
        }
    });
}
function isLast(arr, item) {
    return arr.indexOf(item) === arr.length - 1;
}
