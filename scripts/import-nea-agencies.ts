import fs from 'fs';
import { db } from '../server/db';
import { neaAgencies } from '../shared/schema';
import { sql } from 'drizzle-orm';

interface NEAAgencyData {
  agencyName: string;
  licenseNumber: string;
  email: string | null;
  website: string | null;
  serviceType: string | null;
  issueDate: Date;
  expiryDate: Date;
  statusOverride: string | null;
}

function parseDate(dateStr: string): Date {
  const trimmed = dateStr.trim();
  const [day, month, year] = trimmed.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function cleanWebsite(website: string | null): string | null {
  if (!website) return null;
  const cleaned = website.trim().toLowerCase();
  if (['n/a', 'na', 'nil', 'none', '-', 'under construction'].includes(cleaned)) return null;
  return website.trim();
}

function cleanEmail(email: string | null): string | null {
  if (!email) return null;
  const cleaned = email.trim().toLowerCase();
  if (['n/a', 'na', 'nil', 'none', '-'].includes(cleaned)) return null;
  if (!cleaned.includes('@')) return null;
  return cleaned;
}

function mapStatus(status: string): string | null {
  const s = status.toLowerCase().trim();
  if (s === 'expired' || s === 'revoked' || s === 'licence expired') return 'expired';
  if (s === 'suspended') return 'suspended';
  if (s.includes('warning')) return 'warning';
  return null; // "Valid" → null (computed from expiry_date)
}

async function importAgencies() {
  const filePath = 'attached_assets/Pasted-No-NEA-Reg-No-Agency-Name-E-mail-Address-Website-Servic_1774698095996.txt';
  console.log(`Reading: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  console.log(`Total lines (including header): ${lines.length}`);

  const agencies: NEAAgencyData[] = [];
  let skipped = 0;
  let parseErrors = 0;

  // Start from line 1 (skip header)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split('\t');
    if (parts.length < 9) {
      skipped++;
      continue;
    }

    try {
      const [, licenseNumber, agencyName, email, website, serviceType, validFrom, expiry, status] = parts;

      if (!licenseNumber?.trim() || !agencyName?.trim() || !validFrom?.trim() || !expiry?.trim()) {
        skipped++;
        continue;
      }

      const issueDate = parseDate(validFrom);
      const expiryDate = parseDate(expiry);

      if (isNaN(issueDate.getTime()) || isNaN(expiryDate.getTime())) {
        parseErrors++;
        console.log(`  [DATE ERROR] line ${i + 1}: validFrom="${validFrom}" expiry="${expiry}"`);
        continue;
      }

      agencies.push({
        agencyName: agencyName.trim(),
        licenseNumber: licenseNumber.trim(),
        email: cleanEmail(email),
        website: cleanWebsite(website),
        serviceType: serviceType?.trim() || 'Foreign & Local Recruitment',
        issueDate,
        expiryDate,
        statusOverride: mapStatus(status || ''),
      });
    } catch (err) {
      parseErrors++;
      console.log(`  [PARSE ERROR] line ${i + 1}: ${err}`);
    }
  }

  console.log(`Parsed     : ${agencies.length} agencies`);
  console.log(`Skipped    : ${skipped} lines`);
  console.log(`Parse errors: ${parseErrors}`);

  // Deduplicate by license number — keep latest expiry
  const uniqueMap = new Map<string, NEAAgencyData>();
  for (const a of agencies) {
    const existing = uniqueMap.get(a.licenseNumber);
    if (!existing || a.expiryDate > existing.expiryDate) {
      uniqueMap.set(a.licenseNumber, a);
    }
  }
  const deduped = Array.from(uniqueMap.values());
  console.log(`Unique     : ${deduped.length} agencies after deduplication`);

  // Upsert in batches of 50
  // IMPORTANT: do NOT overwrite claimed_by_user_id / is_verified_owner — preserve agency claims
  const batchSize = 50;
  let upserted = 0;
  let errors = 0;

  console.log('\nUpserting (no delete — preserves existing claims & marketplace data)...');

  for (let i = 0; i < deduped.length; i += batchSize) {
    const batch = deduped.slice(i, i + batchSize);

    try {
      await db.insert(neaAgencies).values(
        batch.map((a) => ({
          agencyName: a.agencyName,
          licenseNumber: a.licenseNumber,
          email: a.email,
          website: a.website,
          serviceType: a.serviceType,
          issueDate: a.issueDate,
          expiryDate: a.expiryDate,
          statusOverride: a.statusOverride,
          isPublished: true,
          lastUpdated: new Date(),
        }))
      ).onConflictDoUpdate({
        target: neaAgencies.licenseNumber,
        set: {
          agencyName: sql`excluded.agency_name`,
          // Preserve existing email/website if new value is null (don't regress)
          email: sql`COALESCE(excluded.email, nea_agencies.email)`,
          website: sql`COALESCE(excluded.website, nea_agencies.website)`,
          serviceType: sql`excluded.service_type`,
          issueDate: sql`excluded.issue_date`,
          expiryDate: sql`excluded.expiry_date`,
          // Only set status_override if file has a non-null value; keep existing otherwise
          statusOverride: sql`CASE WHEN excluded.status_override IS NOT NULL THEN excluded.status_override ELSE nea_agencies.status_override END`,
          lastUpdated: new Date(),
          // Fields NOT touched: claimed_by_user_id, claimed_at, is_verified_owner, verified_owner_at,
          //                     last_notified_*, latitude, longitude, country, city, notes, updated_by
        },
      });

      upserted += batch.length;
      if ((i / batchSize) % 5 === 0 || i + batchSize >= deduped.length) {
        console.log(`  ${upserted}/${deduped.length} processed...`);
      }
    } catch (err: any) {
      errors += batch.length;
      console.error(`  [BATCH ERROR] starting at ${i}: ${err.message}`);
    }
  }

  // Final count
  const result = await db.execute(sql`SELECT COUNT(*) as total FROM nea_agencies`);
  const total = (result.rows[0] as any)?.total ?? (result[0] as any)?.total ?? '?';

  console.log('\n=== Import Complete ===');
  console.log(`  Upserted  : ${upserted}`);
  console.log(`  Errors    : ${errors}`);
  console.log(`  DB total  : ${total}`);

  const validCount = deduped.filter((a) => !a.statusOverride).length;
  const expiredCount = deduped.filter((a) => a.statusOverride === 'expired').length;
  const suspendedCount = deduped.filter((a) => a.statusOverride === 'suspended').length;
  console.log(`\nFile breakdown:`);
  console.log(`  Valid (no override)   : ${validCount}`);
  console.log(`  Expired/Revoked       : ${expiredCount}`);
  console.log(`  Suspended             : ${suspendedCount}`);

  process.exit(0);
}

importAgencies().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
