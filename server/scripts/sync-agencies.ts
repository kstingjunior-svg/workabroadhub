import fs from "fs";
import path from "path";
import { db } from "../db";
import { neaAgencies } from "../../shared/schema";
import { sql } from "drizzle-orm";

const FILE_PATH = path.join(
  process.cwd(),
  "attached_assets",
  "Pasted--No-NEA-Reg-No-Agency-Name-E-mail-Address-Website-Servi_1775732478476.txt"
);

function cleanValue(v: string): string | null {
  const cleaned = v.trim();
  if (!cleaned || ["n/a", "none", "nil", "-", "na", "null"].includes(cleaned.toLowerCase())) return null;
  return cleaned;
}

function parseDate(s: string): Date | null {
  const t = s.trim();
  const match = t.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const d = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

async function main() {
  const raw = fs.readFileSync(FILE_PATH, "utf8");
  const lines = raw.split("\n").slice(2); // skip blank + header

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  const BATCH = 100;
  const rows: any[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    if (cols.length < 9) { skipped++; continue; }

    const [, licenseRaw, nameRaw, emailRaw, websiteRaw, serviceRaw, fromRaw, toRaw, statusRaw] = cols;

    const licenseNumber = licenseRaw?.trim();
    const agencyName = nameRaw?.trim();
    if (!licenseNumber || !agencyName) { skipped++; continue; }

    const issueDate = parseDate(fromRaw?.trim());
    const expiryDate = parseDate(toRaw?.trim());
    if (!issueDate || !expiryDate) { skipped++; continue; }

    const status = statusRaw?.trim().toLowerCase();
    const statusOverride = status === "expired" ? "expired" : null;

    rows.push({
      licenseNumber,
      agencyName,
      email: cleanValue(emailRaw),
      website: cleanValue(websiteRaw),
      serviceType: cleanValue(serviceRaw) ?? "Foreign & Local Recruitment",
      issueDate,
      expiryDate,
      statusOverride,
      isPublished: true,
    });
  }

  // Deduplicate by license number — keep last occurrence (most recent data)
  const deduped = new Map<string, any>();
  for (const row of rows) deduped.set(row.licenseNumber, row);
  const unique = Array.from(deduped.values());
  console.log(`Parsed ${rows.length} agencies, ${unique.length} unique license numbers. Upserting in batches of ${BATCH}…`);
  rows.length = 0;
  rows.push(...unique);

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const result = await db
      .insert(neaAgencies)
      .values(batch)
      .onConflictDoUpdate({
        target: neaAgencies.licenseNumber,
        set: {
          agencyName: sql`excluded.agency_name`,
          email: sql`excluded.email`,
          website: sql`excluded.website`,
          serviceType: sql`excluded.service_type`,
          issueDate: sql`excluded.issue_date`,
          expiryDate: sql`excluded.expiry_date`,
          statusOverride: sql`excluded.status_override`,
          isPublished: sql`excluded.is_published`,
          lastUpdated: sql`now()`,
        },
      })
      .returning({ id: neaAgencies.id });

    inserted += result.length;
    process.stdout.write(`\r  Processed ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
  }

  console.log(`\nDone. Upserted ${inserted} agencies. Skipped ${skipped} malformed rows.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
