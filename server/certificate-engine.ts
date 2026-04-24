import crypto from "crypto";
import { db } from "./db";
import { storage } from "./storage";
import { agencyCertificates } from "@shared/schema";
import { eq, and, lt } from "drizzle-orm";

if (!process.env.SESSION_SECRET) {
  console.warn("[Certificates] WARNING: SESSION_SECRET not set. Certificate signing will use weak fallback.");
}
const CERT_SECRET = process.env.SESSION_SECRET!;
const PUBLIC_URL = process.env.PUBLIC_APP_URL || "https://workabroadhub.tech";
const MIN_COMPLIANCE_SCORE = 40;

function generateCertificateId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  let id = "CERT-";
  for (let i = 0; i < 8; i++) {
    id += chars[bytes[i] % chars.length];
  }
  return id;
}

async function generateUniqueCertificateId(maxRetries = 5): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const certId = generateCertificateId();
    const [existing] = await db.select().from(agencyCertificates)
      .where(eq(agencyCertificates.certificateId, certId)).limit(1);
    if (!existing) return certId;
  }
  throw new Error("Failed to generate unique certificate ID after retries");
}

function computeHash(agencyId: string, licenseNumber: string, certificateId: string, issuedAt: string): string {
  const payload = `${agencyId}:${licenseNumber}:${certificateId}:${issuedAt}:${CERT_SECRET}`;
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export async function generateCertificate(agencyId: string): Promise<{ success: boolean; certificate?: any; error?: string }> {
  const agency = await storage.getNeaAgencyById(agencyId);
  if (!agency) return { success: false, error: "Agency not found" };

  const isBlacklisted = await storage.isEntityBlacklisted(agencyId);
  if (isBlacklisted) return { success: false, error: "Agency is blacklisted" };

  const now = new Date();
  if (!agency.expiryDate || new Date(agency.expiryDate) < now) {
    return { success: false, error: "Agency license is expired" };
  }

  if (agency.statusOverride === "suspended") {
    return { success: false, error: "Agency is suspended" };
  }

  let complianceScore = 50;
  try {
    const score = await storage.getAgencyScore(agencyId);
    if (score) complianceScore = score.overallScore;
  } catch {}

  if (complianceScore < MIN_COMPLIANCE_SCORE) {
    return { success: false, error: `Compliance score (${complianceScore}) below minimum threshold (${MIN_COMPLIANCE_SCORE})` };
  }

  const existing = await db.select().from(agencyCertificates)
    .where(and(eq(agencyCertificates.agencyId, agencyId), eq(agencyCertificates.status, "active")))
    .limit(1);
  if (existing.length > 0) {
    return { success: false, error: "Agency already has an active certificate. Revoke or regenerate instead." };
  }

  const certificateId = await generateUniqueCertificateId();
  const issuedAt = now.toISOString();
  const expiresAt = new Date(agency.expiryDate);
  const verificationHash = computeHash(agencyId, agency.licenseNumber, certificateId, issuedAt);

  const [certificate] = await db.insert(agencyCertificates).values({
    certificateId,
    agencyId,
    agencyName: agency.agencyName,
    licenseNumber: agency.licenseNumber,
    complianceScore,
    verificationStatus: "verified",
    issuedAt: now,
    expiresAt,
    verificationHash,
    status: "active",
    metadata: {
      serviceType: agency.serviceType,
      country: agency.country,
      city: agency.city,
    },
  }).returning();

  return { success: true, certificate };
}

export async function verifyCertificate(certificateId: string): Promise<{
  valid: boolean;
  certificate?: any;
  reason?: string;
}> {
  const [cert] = await db.select().from(agencyCertificates)
    .where(eq(agencyCertificates.certificateId, certificateId)).limit(1);

  if (!cert) return { valid: false, reason: "Certificate not found" };

  if (cert.status === "revoked") return { valid: false, certificate: cert, reason: "Certificate has been revoked" };
  if (cert.status === "expired") return { valid: false, certificate: cert, reason: "Certificate has expired" };
  if (cert.status === "suspended") return { valid: false, certificate: cert, reason: "Certificate is suspended" };

  const now = new Date();
  if (cert.expiresAt && new Date(cert.expiresAt) < now) {
    await db.update(agencyCertificates)
      .set({ status: "expired", updatedAt: now })
      .where(eq(agencyCertificates.id, cert.id));
    return { valid: false, certificate: { ...cert, status: "expired" }, reason: "Certificate has expired" };
  }

  const expectedHash = computeHash(
    cert.agencyId,
    cert.licenseNumber || "",
    cert.certificateId,
    cert.issuedAt?.toISOString() || ""
  );

  if (expectedHash !== cert.verificationHash) {
    return { valid: false, certificate: cert, reason: "Certificate integrity check failed — possible tampering" };
  }

  const isBlacklisted = await storage.isEntityBlacklisted(cert.agencyId);
  if (isBlacklisted) {
    await db.update(agencyCertificates)
      .set({ status: "suspended", revokedReason: "Agency blacklisted", updatedAt: now })
      .where(eq(agencyCertificates.id, cert.id));
    return { valid: false, certificate: { ...cert, status: "suspended" }, reason: "Agency has been blacklisted" };
  }

  return { valid: true, certificate: cert };
}

export async function revokeCertificate(certificateId: string, revokedBy: string, reason: string): Promise<{ success: boolean; error?: string }> {
  const [cert] = await db.select().from(agencyCertificates)
    .where(eq(agencyCertificates.certificateId, certificateId)).limit(1);

  if (!cert) return { success: false, error: "Certificate not found" };
  if (cert.status === "revoked") return { success: false, error: "Certificate already revoked" };

  await db.update(agencyCertificates)
    .set({ status: "revoked", revokedAt: new Date(), revokedBy, revokedReason: reason, updatedAt: new Date() })
    .where(eq(agencyCertificates.id, cert.id));

  return { success: true };
}

export async function regenerateCertificate(agencyId: string, revokedBy: string): Promise<{ success: boolean; certificate?: any; error?: string }> {
  const [existing] = await db.select().from(agencyCertificates)
    .where(and(eq(agencyCertificates.agencyId, agencyId), eq(agencyCertificates.status, "active")))
    .limit(1);

  if (existing) {
    await db.update(agencyCertificates)
      .set({ status: "revoked", revokedAt: new Date(), revokedBy, revokedReason: "Regenerated", updatedAt: new Date() })
      .where(eq(agencyCertificates.id, existing.id));
  }

  const result = await generateCertificate(agencyId);
  if (result.success && result.certificate && existing) {
    await db.update(agencyCertificates)
      .set({ regeneratedFrom: existing.certificateId })
      .where(eq(agencyCertificates.id, result.certificate.id));
  }
  return result;
}

export async function generateCertificatePDF(certificateId: string): Promise<{ success: boolean; stream?: any; error?: string }> {
  const verification = await verifyCertificate(certificateId);
  if (!verification.certificate) return { success: false, error: "Certificate not found" };
  if (!verification.valid) return { success: false, error: `Cannot download PDF: certificate is ${verification.certificate.status}` };

  const cert = verification.certificate;
  const PDFDocument = (await import("pdfkit")).default;
  const QRCode = (await import("qrcode")).default;

  const verifyUrl = `${PUBLIC_URL}/certificate/${cert.certificateId}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 150, margin: 1, color: { dark: "#0f172a" } });
  const qrBuffer = Buffer.from(qrDataUrl.split(",")[1], "base64");

  const doc = new PDFDocument({ size: "A4", margin: 60 });

  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#f8fafc");

  doc.rect(40, 40, doc.page.width - 80, doc.page.height - 80)
    .lineWidth(3).stroke("#0d9488");
  doc.rect(45, 45, doc.page.width - 90, doc.page.height - 90)
    .lineWidth(1).stroke("#94a3b8");

  doc.fillColor("#0d9488").fontSize(28).font("Helvetica-Bold")
    .text("CERTIFICATE OF VERIFICATION", 60, 80, { align: "center" });

  doc.fillColor("#334155").fontSize(12).font("Helvetica")
    .text("WorkAbroad Hub — Trusted Agency Certification", 60, 115, { align: "center" });

  doc.moveTo(100, 145).lineTo(doc.page.width - 100, 145).lineWidth(1).stroke("#e2e8f0");

  doc.fillColor("#64748b").fontSize(10).font("Helvetica")
    .text("This certifies that the following agency has been verified:", 60, 165, { align: "center" });

  doc.fillColor("#0f172a").fontSize(24).font("Helvetica-Bold")
    .text(cert.agencyName || "Agency", 60, 200, { align: "center" });

  const leftX = 100;
  const rightX = 330;
  let y = 260;

  const addField = (label: string, value: string, x: number) => {
    doc.fillColor("#64748b").fontSize(9).font("Helvetica").text(label, x, y);
    doc.fillColor("#0f172a").fontSize(12).font("Helvetica-Bold").text(value, x, y + 14);
  };

  addField("Certificate ID", cert.certificateId, leftX);
  addField("License Number", cert.licenseNumber || "N/A", rightX);
  y += 45;
  addField("Compliance Score", `${cert.complianceScore}/100`, leftX);
  addField("Verification Status", verification.valid ? "VALID" : cert.status.toUpperCase(), rightX);
  y += 45;
  addField("Issued Date", cert.issuedAt ? new Date(cert.issuedAt).toLocaleDateString() : "N/A", leftX);
  addField("Expiry Date", cert.expiresAt ? new Date(cert.expiresAt).toLocaleDateString() : "N/A", rightX);

  y += 55;
  doc.moveTo(100, y).lineTo(doc.page.width - 100, y).lineWidth(0.5).stroke("#e2e8f0");

  y += 20;
  doc.image(qrBuffer, (doc.page.width - 120) / 2, y, { width: 120 });
  y += 130;
  doc.fillColor("#64748b").fontSize(8).font("Helvetica")
    .text("Scan QR code or visit the URL below to verify this certificate", 60, y, { align: "center" });
  y += 14;
  doc.fillColor("#0d9488").fontSize(9).font("Helvetica")
    .text(verifyUrl, 60, y, { align: "center", link: verifyUrl });

  y += 30;
  doc.moveTo(100, y).lineTo(doc.page.width - 100, y).lineWidth(0.5).stroke("#e2e8f0");

  y += 15;
  doc.fillColor("#94a3b8").fontSize(7).font("Helvetica")
    .text(`Hash: ${cert.verificationHash}`, 60, y, { align: "center" });
  y += 12;
  doc.fillColor("#94a3b8").fontSize(7).font("Helvetica")
    .text("This certificate is digitally signed and tamper-proof. Any modification will invalidate the verification hash.", 60, y, { align: "center" });
  y += 12;
  doc.fillColor("#94a3b8").fontSize(7).font("Helvetica")
    .text("WorkAbroad Hub does not guarantee employment. This certificate verifies compliance status only.", 60, y, { align: "center" });

  doc.end();
  return { success: true, stream: doc };
}

export function generateEmbedBadgeCode(certificateId: string, agencyName: string): string {
  const verifyUrl = `${PUBLIC_URL}/certificate/${certificateId}`;
  return `<!-- WorkAbroad Hub Verified Agency Badge -->
<a href="${verifyUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;text-decoration:none;">
  <div style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;background:linear-gradient(135deg,#0d9488,#0284c7);color:white;border-radius:8px;font-family:system-ui,-apple-system,sans-serif;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.15);">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
    <span><strong>${agencyName.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</strong> — Verified Agency</span>
  </div>
</a>
<!-- Powered by WorkAbroad Hub - workabroadhub.tech -->`;
}

export async function invalidateExpiredCertificates(): Promise<{ invalidated: number }> {
  const now = new Date();
  const expired = await db.select().from(agencyCertificates)
    .where(and(eq(agencyCertificates.status, "active"), lt(agencyCertificates.expiresAt, now)));

  for (const cert of expired) {
    await db.update(agencyCertificates)
      .set({ status: "expired", updatedAt: now })
      .where(eq(agencyCertificates.id, cert.id));
  }

  const active = await db.select().from(agencyCertificates)
    .where(eq(agencyCertificates.status, "active"));
  let invalidated = expired.length;

  for (const cert of active) {
    const isBlacklisted = await storage.isEntityBlacklisted(cert.agencyId);
    if (isBlacklisted) {
      await db.update(agencyCertificates)
        .set({ status: "suspended", revokedReason: "Agency blacklisted", updatedAt: now })
        .where(eq(agencyCertificates.id, cert.id));
      invalidated++;
      continue;
    }

    try {
      const score = await storage.getAgencyScore(cert.agencyId);
      if (score && score.overallScore < MIN_COMPLIANCE_SCORE) {
        await db.update(agencyCertificates)
          .set({ status: "suspended", revokedReason: `Compliance score dropped below ${MIN_COMPLIANCE_SCORE}`, updatedAt: now })
          .where(eq(agencyCertificates.id, cert.id));
        invalidated++;
      }
    } catch {}
  }

  return { invalidated };
}
