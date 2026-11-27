/**
 * Neutral download names for customer documents (2026-11-27, Tony — permanent):
 * a CV or letter the customer submits to an employer must not reveal it came
 * from WorkAbroad Hub — not in the page, not in the file properties, and not in
 * the FILE NAME. "workabroadhub-cv_fix_lite.pdf" → "CV.pdf".
 */
export function neutralDocName(kind: string | null | undefined, ext: string): string {
  const k = String(kind ?? "").toLowerCase();
  const base =
    /cover/.test(k) ? "Cover_Letter" :
    /sop|statement|personal/.test(k) ? "Statement_of_Purpose" :
    /motivation/.test(k) ? "Motivation_Letter" :
    /reference|recommendation/.test(k) ? "Reference_Letter" :
    /linkedin/.test(k) ? "LinkedIn_Profile" :
    /contract/.test(k) ? "Contract_Review" :
    /interview/.test(k) ? "Interview_Prep" :
    /permit|visa/.test(k) ? "Application_Pack" :
    /cv|resume|ats/.test(k) ? "CV" :
    "Document";
  return `${base}.${String(ext).replace(/^\./, "")}`;
}
