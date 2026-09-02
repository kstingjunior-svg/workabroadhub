"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db_1 = require("../db");
const schema_1 = require("../../shared/schema");
const drizzle_orm_1 = require("drizzle-orm");
const FILE_PATH = path_1.default.join(process.cwd(), "attached_assets", "Pasted--No-NEA-Reg-No-Agency-Name-E-mail-Address-Website-Servi_1775732478476.txt");
function cleanValue(v) {
    const cleaned = v.trim();
    if (!cleaned || ["n/a", "none", "nil", "-", "na", "null"].includes(cleaned.toLowerCase()))
        return null;
    return cleaned;
}
function parseDate(s) {
    const t = s.trim();
    const match = t.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (!match)
        return null;
    const [, day, month, year] = match;
    const d = new Date(`${year}-${month}-${day}T00:00:00Z`);
    return isNaN(d.getTime()) ? null : d;
}
async function main() {
    const raw = fs_1.default.readFileSync(FILE_PATH, "utf8");
    const lines = raw.split("\n").slice(2); // skip blank + header
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const BATCH = 100;
    const rows = [];
    for (const line of lines) {
        if (!line.trim())
            continue;
        const cols = line.split("\t");
        if (cols.length < 9) {
            skipped++;
            continue;
        }
        const [, licenseRaw, nameRaw, emailRaw, websiteRaw, serviceRaw, fromRaw, toRaw, statusRaw] = cols;
        const licenseNumber = licenseRaw?.trim();
        const agencyName = nameRaw?.trim();
        if (!licenseNumber || !agencyName) {
            skipped++;
            continue;
        }
        const issueDate = parseDate(fromRaw?.trim());
        const expiryDate = parseDate(toRaw?.trim());
        if (!issueDate || !expiryDate) {
            skipped++;
            continue;
        }
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
    const deduped = new Map();
    for (const row of rows)
        deduped.set(row.licenseNumber, row);
    const unique = Array.from(deduped.values());
    console.log(`Parsed ${rows.length} agencies, ${unique.length} unique license numbers. Upserting in batches of ${BATCH}…`);
    rows.length = 0;
    rows.push(...unique);
    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const result = await db_1.db
            .insert(schema_1.neaAgencies)
            .values(batch)
            .onConflictDoUpdate({
            target: schema_1.neaAgencies.licenseNumber,
            set: {
                agencyName: (0, drizzle_orm_1.sql) `excluded.agency_name`,
                email: (0, drizzle_orm_1.sql) `excluded.email`,
                website: (0, drizzle_orm_1.sql) `excluded.website`,
                serviceType: (0, drizzle_orm_1.sql) `excluded.service_type`,
                issueDate: (0, drizzle_orm_1.sql) `excluded.issue_date`,
                expiryDate: (0, drizzle_orm_1.sql) `excluded.expiry_date`,
                statusOverride: (0, drizzle_orm_1.sql) `excluded.status_override`,
                isPublished: (0, drizzle_orm_1.sql) `excluded.is_published`,
                lastUpdated: (0, drizzle_orm_1.sql) `now()`,
            },
        })
            .returning({ id: schema_1.neaAgencies.id });
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
