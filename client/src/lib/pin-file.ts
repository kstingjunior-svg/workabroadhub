/**
 * pin-file.ts — copy a user-picked File into memory right away.
 *
 * 2026-11 (paid-but-no-scan fix): on Android Chrome, a file picked from
 * WhatsApp / Google Drive / a downloads provider is only a *handle*. If the
 * user then switches apps (exactly what the M-Pesa PIN prompt makes them do),
 * the phone can revoke that handle, and the later upload fails inside the
 * browser (net::ERR_UPLOAD_FILE_CHANGED) before it ever reaches our server.
 * Customers paid KES 100 and the offer-letter / visa scan never ran.
 *
 * Reading the bytes into a fresh in-memory File at pick time means the upload
 * no longer depends on the original handle. Files are capped at 10 MB by the
 * tool pages, so holding one in memory is cheap.
 */
export async function pinFileInMemory(file: File): Promise<File> {
  try {
    const bytes = await file.arrayBuffer();
    return new File([bytes], file.name, {
      type: file.type,
      lastModified: file.lastModified,
    });
  } catch {
    // Couldn't read it now — fall back to the original handle (old behaviour).
    return file;
  }
}
