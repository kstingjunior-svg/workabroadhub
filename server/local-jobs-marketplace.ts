/**
 * Kenyan Local Jobs marketplace (2026-11).
 *
 * Adds, on top of the existing local_jobs / companies tables:
 *   • Super-admin publishing — the main administrator (role SUPER_ADMIN,
 *     enforced here on the server) publishes jobs for any employer, with or
 *     without an employer account, never charged, never blocked by employer
 *     rules. Drafts, preview checks, edit, deactivate, renew, archive, delete.
 *   • Direct contact — Call / WhatsApp the employer. Numbers only go to
 *     signed-in visitors and only when the employer authorised publishing
 *     them. Clicks are counted without storing who clicked.
 *   • Near me — every job gets coordinates from estate → town → county;
 *     visitors search by GPS or by typing a place.
 *   • Live counters, scam checks, publication audit, CSV export.
 *
 * Ordinary employer posting (/api/employer/companies/:id/jobs) is untouched.
 * Overseas jobs, subscriptions, M-Pesa and PayPal are not referenced here.
 */
import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { pool } from "./db";
import { findPlace, locateJob, distanceKm, KENYA_PLACES } from "../shared/kenya-places";
import { validatePublisherLocation, originFromBody } from "./geo";
import { canSeeJobContacts, paywallBody, maskPhones } from "./lib/job-contact-access";

// ── Helpers ─────────────────────────────────────────────────────────────────
function sessionUserId(req: any): string | null {
  const id = req.user?.claims?.sub ?? req.user?.id ?? req.session?.customUserId ?? null;
  return id ? String(id) : null;
}

/** Only the main administrator (SUPER_ADMIN) gets unrestricted publishing. */
async function requireSuperAdmin(req: any, res: Response): Promise<string | null> {
  const uid = sessionUserId(req);
  if (!uid) { res.status(401).json({ message: "Please sign in." }); return null; }
  const { rows } = await pool.query(`SELECT role FROM users WHERE id = $1`, [uid]).catch(() => ({ rows: [] as any[] }));
  if (String(rows[0]?.role ?? "").toUpperCase() !== "SUPER_ADMIN") {
    res.status(403).json({ message: "Only the main administrator can do this." });
    return null;
  }
  return uid;
}

/** 07XXXXXXXX / 7XXXXXXXX / +2547… / 2541… → 2547XXXXXXXX (null if invalid). */
export function normalizeKePhone(raw: unknown): string | null {
  let p = String(raw ?? "").replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!p) return null;
  if (/^0[17]\d{8}$/.test(p)) p = "254" + p.slice(1);
  else if (/^[17]\d{8}$/.test(p)) p = "254" + p;
  return /^254[17]\d{8}$/.test(p) ? p : null;
}
export const displayKePhone = (p: string | null) => (p && /^254\d{9}$/.test(p) ? `0${p.slice(3, 6)} ${p.slice(6, 9)} ${p.slice(9)}` : p);

const VISIBLE = `j.status = 'open' AND c.status = 'approved' AND COALESCE(j.is_seed, false) = false
  AND (j.deadline IS NULL OR j.deadline >= (NOW() AT TIME ZONE 'Africa/Nairobi')::date)
  AND (j.expires_at IS NULL OR j.expires_at > NOW())`;

// ── Scam / quality checks (pure) ───────────────────────────────────────────
const FEE_RX = /\b(registration|processing|application|interview|training|medical|uniform|placement|booking|commitment|clearance|service)\s+(fee|fees|charge|charges)\b|\bpay\s+(ksh|kes|sh\.?)?\s*\d+[\s,]*(to|for|before)\s+(apply|register|interview|training|start|the job)\b|\b(send|deposit|pay)\s+(money|cash|ksh|kes)\b|\bmpesa\s+(to|first)\b/i;
const SCAM_RX = /\b(western union|moneygram|bitcoin|crypto|earn\s+(ksh|kes)?\s*\d[\d,]*\s*(per|a)\s*day\s+(from|at)\s+home|guaranteed\s+(job|placement|visa)|no\s+interview\s+needed|forex)\b/i;
export function assessJobRisk(j: { title?: string; description?: string; instructions?: string; requirements?: string; contactPhone?: string | null }): string[] {
  const flags: string[] = [];
  const text = [j.title, j.description, j.instructions, j.requirements].filter(Boolean).join("\n");
  if (FEE_RX.test(text)) flags.push("asks_for_fee");
  if (SCAM_RX.test(text)) flags.push("scam_wording");
  const p = j.contactPhone ? normalizeKePhone(j.contactPhone) : null;
  if (j.contactPhone && !p) flags.push("invalid_phone");
  if (p && (/(\d)\1{6,}/.test(p.slice(3)) || /^2547(00000000|12345678)$/.test(p))) flags.push("suspicious_phone");
  if (text.replace(/\s+/g, " ").trim().length < 40) flags.push("too_little_detail");
  return flags;
}
export const RISK_LABEL: Record<string, string> = {
  asks_for_fee: "Asks job seekers to pay a fee",
  scam_wording: "Contains common scam wording",
  invalid_phone: "Contact phone is not a valid Kenyan number",
  suspicious_phone: "Contact phone looks fake",
  too_little_detail: "Very little detail about the job",
  duplicate: "Looks like a duplicate of a live job",
  phone_many_employers: "Same phone is listed for several different employers",
};

async function dbRiskFlags(jobId: string | null, title: string, companyId: string | null, phone: string | null): Promise<string[]> {
  const flags: string[] = [];
  const { rows: dup } = await pool.query(
    `SELECT 1 FROM local_jobs j WHERE j.status = 'open' AND ($1::uuid IS NULL OR j.id <> $1::uuid)
        AND lower(j.title) = lower($2) AND (j.company_id = $3::uuid OR ($4::text IS NOT NULL AND j.contact_phone = $4))
        AND j.created_at > NOW() - INTERVAL '30 days' LIMIT 1`, [jobId, title, companyId, phone]).catch(() => ({ rows: [] as any[] }));
  if (dup.length) flags.push("duplicate");
  if (phone) {
    const { rows: [m] } = await pool.query(
      `SELECT count(DISTINCT company_id)::int n FROM local_jobs WHERE contact_phone = $1 AND created_at > NOW() - INTERVAL '60 days'
          AND ($2::uuid IS NULL OR company_id <> $2::uuid)`, [phone, companyId]).catch(() => ({ rows: [{ n: 0 }] as any[] }));
    if ((m?.n ?? 0) >= 3) flags.push("phone_many_employers");
  }
  return flags;
}

async function audit(jobId: string | null, companyId: string | null, actorId: string | null, role: string, action: string, detail: any = {}) {
  await pool.query(
    `INSERT INTO job_publication_audit (job_id, company_id, actor_id, actor_role, action, detail) VALUES ($1,$2,$3,$4,$5,$6)`,
    [jobId, companyId, actorId, role, action, JSON.stringify(detail ?? {})],
  ).catch((e) => console.warn("[lj-audit]", e?.message));
}

const EMPLOYMENT = new Set(["full_time", "part_time", "contract", "temporary", "internship", "casual"]);
const PERIODS = new Set(["hour", "day", "week", "month", "year", "job"]);
const VERIFY = new Set(["verified", "contact_confirmed", "admin_posted", "pending"]);

function slugify(s: string) {
  return s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "employer";
}

/** Reads + validates the admin job form. */
async function readJobForm(b: any, opts: { requireLocation?: boolean } = {}): Promise<{ ok: true; v: any } | { ok: false; message: string; field?: string }> {
  const s = (x: any, n: number) => String(x ?? "").trim().slice(0, n);
  const v: any = {
    title: s(b.title, 200), employerName: s(b.employerName, 160), companyId: s(b.companyId, 40) || null,
    description: s(b.description, 6000), vacancies: Math.max(1, Math.min(999, Number(b.vacancies) || 1)),
    category: s(b.category, 40) || "other", employmentType: s(b.employmentType, 20) || "full_time",
    salaryMin: b.salaryMin === "" || b.salaryMin == null ? null : Math.round(Number(b.salaryMin)),
    salaryMax: b.salaryMax === "" || b.salaryMax == null ? null : Math.round(Number(b.salaryMax)),
    salaryPeriod: s(b.salaryPeriod, 10) || null,
    county: s(b.county, 60), town: s(b.town, 80) || null, estate: s(b.estate, 120) || null,
    workplaceLocation: s(b.workplaceLocation, 240) || null, minQualification: s(b.minQualification, 160) || null,
    experienceText: s(b.experienceText, 160) || null, genderRequirement: s(b.genderRequirement, 80) || null,
    workingHours: s(b.workingHours, 160) || null, deadline: s(b.deadline, 10) || null, expiresAt: s(b.expiresAt, 30) || null,
    contactPerson: s(b.contactPerson, 120) || null, contactPhoneRaw: s(b.contactPhone, 30), whatsappRaw: s(b.whatsappPhone, 30),
    altContact: s(b.altContact, 240) || null, instructions: s(b.instructions, 2000) || null,
    contactAuthorized: b.contactAuthorized === true, source: s(b.source, 20) || "admin_on_behalf",
    verificationStatus: s(b.verificationStatus, 30) || "admin_posted", verificationNote: s(b.verificationNote, 1000) || null,
    requirements: s(b.requirements, 4000) || null,
  };
  if (v.title.length < 3) return { ok: false, message: "Job title is required.", field: "title" };
  if (!v.companyId && v.employerName.length < 2) return { ok: false, message: "Employer / business name is required.", field: "employerName" };
  if (v.description.length < 20) return { ok: false, message: "Add a description of at least 20 characters.", field: "description" };
  // 2026-11: map location (Google place + pin). Mandatory to publish.
  if (b.location) {
    const L = await validatePublisherLocation(b.location);
    if (!L.ok) return { ok: false, message: L.message ?? "Invalid location.", field: "location" };
    Object.assign(v, {
      lat: L.v.lat, lng: L.v.lng, placeId: L.v.placeId, formattedAddress: L.v.formattedAddress, street: L.v.street,
      locationMode: L.v.mode, serviceRadiusKm: L.v.serviceRadiusKm, locationPrecision: L.v.precision,
      county: L.v.county, town: v.town ?? L.v.town, estate: v.estate ?? L.v.estate,
    });
  } else if (opts.requireLocation) {
    return { ok: false, message: "Set the workplace location on the map (or choose 'Several places / service area').", field: "location" };
  }
  if (!v.county) return { ok: false, message: "County is required.", field: "county" };
  if (!EMPLOYMENT.has(v.employmentType)) return { ok: false, message: "Pick an employment type.", field: "employmentType" };
  if (v.salaryPeriod && !PERIODS.has(v.salaryPeriod)) return { ok: false, message: "Invalid pay frequency.", field: "salaryPeriod" };
  for (const k of ["salaryMin", "salaryMax"]) if (v[k] != null && (!Number.isFinite(v[k]) || v[k] < 0)) return { ok: false, message: "Salary must be a positive number.", field: k };
  if (v.salaryMin != null && v.salaryMax != null && v.salaryMin > v.salaryMax) return { ok: false, message: "Minimum salary can't be above maximum.", field: "salaryMin" };
  if (!["employer", "admin", "admin_on_behalf"].includes(v.source)) return { ok: false, message: "Invalid job source.", field: "source" };
  if (!VERIFY.has(v.verificationStatus)) return { ok: false, message: "Invalid verification status.", field: "verificationStatus" };
  if (["verified", "contact_confirmed"].includes(v.verificationStatus) && !v.verificationNote) {
    return { ok: false, message: "Say how you confirmed the employer (e.g. 'Called the manager on 23 Nov').", field: "verificationNote" };
  }
  v.contactPhone = v.contactPhoneRaw ? normalizeKePhone(v.contactPhoneRaw) : null;
  if (v.contactPhoneRaw && !v.contactPhone) return { ok: false, message: "Phone number isn't a valid Kenyan number (07XX… or 01XX…).", field: "contactPhone" };
  v.whatsappPhone = v.whatsappRaw ? normalizeKePhone(v.whatsappRaw) : null;
  if (v.whatsappRaw && !v.whatsappPhone) return { ok: false, message: "WhatsApp number isn't a valid Kenyan number.", field: "whatsappPhone" };
  if (v.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(v.deadline)) return { ok: false, message: "Deadline must be a date.", field: "deadline" };
  if (v.expiresAt && Number.isNaN(Date.parse(v.expiresAt))) return { ok: false, message: "Expiry must be a date.", field: "expiresAt" };
  const { rows: cats } = await pool.query(`SELECT 1 FROM local_job_categories WHERE slug = $1 AND active`, [v.category]);
  if (!cats.length) return { ok: false, message: "Pick a category.", field: "category" };
  if (v.lat == null) {
    // Drafts without a map pin: approximate from estate → town → county.
    const loc = locateJob(v.estate, v.town, v.county);
    v.lat = loc?.lat ?? null; v.lng = loc?.lng ?? null;
    v.locationPrecision = loc ? "approximate" : null;
    v.locationMode = v.locationMode ?? "workplace";
  }
  v.riskFlags = assessJobRisk({ title: v.title, description: v.description, instructions: v.instructions, requirements: v.requirements, contactPhone: v.contactPhoneRaw || null });
  return { ok: true, v };
}

/** Finds the employer by id, or by name (case-insensitive), or creates a no-account employer. */
async function resolveEmployer(v: any): Promise<{ id: string; created: boolean }> {
  if (v.companyId) {
    const { rows } = await pool.query(`SELECT id FROM companies WHERE id = $1`, [v.companyId]);
    if (rows.length) return { id: rows[0].id, created: false };
  }
  const { rows: found } = await pool.query(`SELECT id FROM companies WHERE lower(name) = lower($1) ORDER BY (status='approved') DESC LIMIT 1`, [v.employerName]);
  if (found.length) return { id: found[0].id, created: false };
  const slug = `${slugify(v.employerName)}-${crypto.randomBytes(3).toString("hex")}`;
  const { rows } = await pool.query(
    `INSERT INTO companies (name, slug, county, town, contact_name, phone, whatsapp_phone, status, created_by_admin, industry)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'approved',true,$8) RETURNING id`,
    [v.employerName, slug, v.county, v.town, v.contactPerson, v.contactPhone, v.whatsappPhone, null],
  );
  return { id: rows[0].id, created: true };
}

const JOB_COLS = `j.id, j.title, j.description, j.responsibilities, j.requirements, j.vacancies, j.employment_type, j.category,
  j.salary_min, j.salary_max, j.salary_period, j.county, j.town, j.estate, j.workplace_location,
  j.min_qualification, j.experience_text, j.experience_level, j.gender_requirement, j.working_hours,
  j.deadline, j.expires_at, j.status, j.source, j.verification_status, j.created_at, j.published_at, j.lat, j.lng,
  j.formatted_address, j.street, j.location_mode, j.service_radius_km, j.location_precision,
  (j.contact_authorized AND (j.contact_phone IS NOT NULL OR c.phone IS NOT NULL)) AS can_call,
  (j.contact_authorized AND (j.whatsapp_phone IS NOT NULL OR j.contact_phone IS NOT NULL)) AS can_whatsapp,
  j.instructions, c.id AS company_id, c.name AS company_name, c.slug AS company_slug, c.logo_url AS company_logo,
  (c.verified_at IS NOT NULL) AS employer_verified`;

function shapeJob(r: any, origin?: { lat: number; lng: number } | null) {
  const distance = origin && r.lat != null && r.lng != null ? Math.round(distanceKm(origin, { lat: r.lat, lng: r.lng }) * 10) / 10 : null;
  const badge = r.employer_verified ? "verified" : r.verification_status === "contact_confirmed" ? "contact_confirmed"
    : r.source !== "employer" ? "admin_posted" : "pending";
  return {
    id: r.id, title: maskPhones(r.title), description: maskPhones(r.description ?? r.responsibilities ?? null), requirements: maskPhones(r.requirements ?? null),
    vacancies: r.vacancies, employmentType: r.employment_type, category: r.category,
    salaryMin: r.salary_min, salaryMax: r.salary_max, salaryPeriod: r.salary_period,
    county: r.county, town: r.town, estate: r.estate, workplaceLocation: r.workplace_location,
    minQualification: r.min_qualification, experience: r.experience_text ?? null, genderRequirement: r.gender_requirement,
    workingHours: r.working_hours, deadline: r.deadline, expiresAt: r.expires_at,
    postedAt: r.published_at ?? r.created_at, source: r.source, badge,
    canCall: !!r.can_call, canWhatsApp: !!r.can_whatsapp, instructions: maskPhones(r.instructions),
    employer: { id: r.company_id, name: r.company_name, slug: r.company_slug, logoUrl: r.company_logo, verified: !!r.employer_verified },
    distanceKm: r.dist_km != null ? Math.round(Number(r.dist_km) * 10) / 10 : distance,
    lat: r.lat, lng: r.lng, formattedAddress: r.formatted_address ?? null, street: r.street ?? null,
    locationMode: r.location_mode ?? "workplace", serviceRadiusKm: r.service_radius_km != null ? Number(r.service_radius_km) : null,
    locationPrecision: r.location_precision ?? null,
  };
}

function originFrom(q: any): { lat: number; lng: number; label: string } | null {
  const lat = Number(q.lat), lng = Number(q.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 6 && lng > 33 && lng < 43) return { lat, lng, label: "your location" };
  const p = findPlace(q.place);
  return p ? { lat: p.lat, lng: p.lng, label: p.name } : null;
}

const viewerHash = (req: any) => crypto.createHash("sha256")
  .update(`${process.env.SESSION_SECRET ?? "wah"}|${new Date().toISOString().slice(0, 10)}|${sessionUserId(req) ?? req.ip ?? ""}`).digest("hex").slice(0, 32);

function csvCell(v: any) {
  const s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function saveLocationExtras(id: string, v: any) {
  await pool.query(
    `UPDATE local_jobs SET place_id=$2, formatted_address=$3, street=$4, location_mode=COALESCE($5,'workplace'), service_radius_km=$6, location_precision=$7 WHERE id=$1`,
    [id, v.placeId ?? null, v.formattedAddress ?? null, v.street ?? null, v.locationMode ?? null, v.serviceRadiusKm ?? null, v.locationPrecision ?? null],
  );
}

// ── Routes ─────────────────────────────────────────────────────────────────
export function registerLocalJobsMarketplace(app: Express): void {
  // ── Public ──
  app.get("/api/lj/categories", async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT k.slug, k.label, k.icon,
                (SELECT count(*)::int FROM local_jobs j JOIN companies c ON c.id = j.company_id WHERE j.category = k.slug AND ${VISIBLE}) AS jobs
           FROM local_job_categories k WHERE k.active ORDER BY k.sort, k.label`);
      res.setHeader("Cache-Control", "no-store");
      res.json({ categories: rows });
    } catch (e: any) { res.status(500).json({ message: "Could not load categories." }); }
  });

  app.get("/api/lj/places", (req, res) => {
    const q = String(req.query.q ?? "").toLowerCase().trim();
    const list = KENYA_PLACES.filter((p) => !q || p.name.toLowerCase().includes(q) || (p.aliases ?? []).some((a) => a.includes(q)))
      .slice(0, 12).map((p) => ({ name: p.name, county: p.county }));
    res.json({ places: list });
  });

  /** Live counters — never cached, recomputed from the database every call. */
  app.get("/api/lj/stats", async (req, res) => {
    try {
      const origin = originFrom(req.query);
      const { rows: [s] } = await pool.query(
        `SELECT count(*)::int total,
                count(*) FILTER (WHERE (COALESCE(j.published_at, j.created_at) AT TIME ZONE 'Africa/Nairobi')::date = (NOW() AT TIME ZONE 'Africa/Nairobi')::date)::int today,
                count(*) FILTER (WHERE COALESCE(j.published_at, j.created_at) > NOW() - INTERVAL '7 days')::int week,
                COALESCE(sum(j.vacancies), 0)::int vacancies,
                count(DISTINCT j.company_id)::int employers,
                count(DISTINCT j.county)::int counties
           FROM local_jobs j JOIN companies c ON c.id = j.company_id WHERE ${VISIBLE}`);
      let near: number | null = null;
      if (origin) {
        const { rows } = await pool.query(`SELECT j.lat, j.lng FROM local_jobs j JOIN companies c ON c.id = j.company_id WHERE ${VISIBLE} AND j.lat IS NOT NULL`);
        const radius = Math.min(100, Math.max(2, Number(req.query.radius) || 25));
        near = rows.filter((r: any) => distanceKm(origin, { lat: r.lat, lng: r.lng }) <= radius).length;
      }
      res.setHeader("Cache-Control", "no-store");
      res.json({ ...s, near, nearLabel: origin?.label ?? null, updatedAt: new Date().toISOString() });
    } catch (e: any) { res.status(500).json({ message: "Could not load stats." }); }
  });

  app.get("/api/lj/jobs", async (req: any, res) => {
    try {
      const q = req.query;
      const where = [VISIBLE];
      const params: any[] = [];
      const add = (sql: string, val: any) => { params.push(val); where.push(sql.replace("$$", `$${params.length}`)); };
      if (q.category && q.category !== "all") add("j.category = $$", String(q.category));
      if (q.county && q.county !== "all") add("j.county = $$", String(q.county));
      if (q.town) add("lower(j.town) = lower($$)", String(q.town));
      if (q.estate) add("lower(j.estate) = lower($$)", String(q.estate));
      if (q.employmentType && q.employmentType !== "all") add("j.employment_type = $$", String(q.employmentType));
      if (q.today === "1") where.push(`(COALESCE(j.published_at, j.created_at) AT TIME ZONE 'Africa/Nairobi')::date = (NOW() AT TIME ZONE 'Africa/Nairobi')::date`);
      if (q.q && String(q.q).trim()) {
        params.push(`%${String(q.q).trim().slice(0, 80)}%`);
        const i = params.length;
        where.push(`(j.title ILIKE $${i} OR c.name ILIKE $${i} OR j.description ILIKE $${i} OR j.town ILIKE $${i} OR j.estate ILIKE $${i} OR j.category ILIKE $${i})`);
      }
      const limit = Math.min(100, Math.max(1, Number(q.limit) || 30));
      const offset = Math.max(0, Number(q.offset) || 0);
      const origin = originFrom(q);
      const radius = Math.min(150, Math.max(2, Number(q.radius) || 30));
      const { rows } = await pool.query(
        `SELECT ${JOB_COLS} FROM local_jobs j JOIN companies c ON c.id = j.company_id
          WHERE ${where.join(" AND ")} ORDER BY COALESCE(j.published_at, j.created_at) DESC LIMIT 500`, params);
      let jobs = rows.map((r: any) => shapeJob(r, origin));
      if (origin && q.near === "1") {
        jobs = jobs.filter((j) => j.distanceKm != null && j.distanceKm <= radius).sort((a, b) => (a.distanceKm! - b.distanceKm!));
      }
      res.setHeader("Cache-Control", "no-store");
      res.json({ total: jobs.length, origin: origin ? { label: origin.label, radiusKm: radius } : null, jobs: jobs.slice(offset, offset + limit) });
    } catch (e: any) {
      console.error("[GET /api/lj/jobs]", e?.message);
      res.status(500).json({ message: "Could not load jobs." });
    }
  });

  app.get("/api/lj/jobs/:id", async (req, res) => {
    try {
      if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ message: "Job not found." });
      const { rows } = await pool.query(`SELECT ${JOB_COLS} FROM local_jobs j JOIN companies c ON c.id = j.company_id WHERE j.id = $1 AND ${VISIBLE}`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ message: "This job is no longer available." });
      pool.query(`UPDATE local_jobs SET view_count = view_count + 1 WHERE id = $1`, [req.params.id]).catch(() => {});
      res.setHeader("Cache-Control", "no-store");
      res.json({ job: shapeJob(rows[0], originFrom(req.query)) });
    } catch { res.status(500).json({ message: "Could not load job." }); }
  });

  /** Employer phone/WhatsApp — signed-in visitors only, only when authorised. */
  app.get("/api/lj/jobs/:id/contact", async (req: any, res) => {
    const uid = sessionUserId(req);
    if (!uid) return res.status(401).json({ message: "Create a free account or sign in to call or WhatsApp the employer.", code: "SIGNIN" });
    try {
      if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ message: "Job not found." });
      const { rows: [r] } = await pool.query(
        `SELECT j.contact_authorized, j.contact_person, COALESCE(j.contact_phone, c.phone) AS phone,
                COALESCE(j.whatsapp_phone, j.contact_phone, c.whatsapp_phone) AS whatsapp, j.alt_contact, j.instructions,
                c.name AS company_name, j.title
           FROM local_jobs j JOIN companies c ON c.id = j.company_id WHERE j.id = $1 AND ${VISIBLE}`, [req.params.id]);
      if (!r) return res.status(404).json({ message: "This job is no longer available." });
      if (!r.contact_authorized) return res.status(403).json({ message: "The employer asked us not to publish their number. Follow the 'How to apply' steps instead.", code: "CONTACT_HIDDEN", instructions: maskPhones(r.instructions) });
      // 2026-11 paywall: job seekers need an active plan (KES 1,000 / 30 days).
      const access = await canSeeJobContacts(uid);
      if (!access.ok) {
        console.log(`[lj/contact] PAYWALL userId=${uid} plan=${access.plan} jobId=${req.params.id}`);
        return res.status(402).json(paywallBody(`/kenya-careers/job/${req.params.id}`));
      }
      const { rows: [rate] } = await pool.query(
        `SELECT count(*)::int n FROM local_job_contact_events WHERE viewer_hash = $1 AND kind = 'reveal' AND created_at > NOW() - INTERVAL '1 hour'`, [viewerHash(req)]);
      if ((rate?.n ?? 0) >= 40) return res.status(429).json({ message: "You've opened many contacts in the last hour. Please try again later." });
      pool.query(`INSERT INTO local_job_contact_events (job_id, kind, viewer_hash) VALUES ($1,'reveal',$2)`, [req.params.id, viewerHash(req)]).catch(() => {});
      const msg = `Hello, I saw your job vacancy on WorkAbroadHub and I am interested. Kindly share more information about the opportunity.`;
      const wa = r.whatsapp ? normalizeKePhone(r.whatsapp) : null;
      const tel = r.phone ? normalizeKePhone(r.phone) : null;
      res.setHeader("Cache-Control", "no-store");
      res.json({
        contactPerson: r.contact_person, employer: r.company_name,
        phone: tel ? displayKePhone(tel) : null, telUrl: tel ? `tel:+${tel}` : null,
        whatsapp: wa ? displayKePhone(wa) : null,
        whatsappUrl: wa ? `https://wa.me/${wa}?text=${encodeURIComponent(msg)}` : null,
        altContact: r.alt_contact, instructions: r.instructions,
      });
    } catch (e: any) { res.status(500).json({ message: "Could not load contact." }); }
  });

  /** Counts Call / WhatsApp taps (no personal data stored). */
  app.post("/api/lj/jobs/:id/click", async (req: any, res) => {
    const kind = String(req.body?.kind ?? "");
    if (!["call", "whatsapp", "view"].includes(kind) || !/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ ok: false });
    await pool.query(`INSERT INTO local_job_contact_events (job_id, kind, viewer_hash) VALUES ($1,$2,$3)`, [req.params.id, kind, viewerHash(req)]).catch(() => {});
    res.json({ ok: true });
  });

  // ── Geographic search (2026-11, PostGIS) ──────────────────────────────────
  // POST so the visitor's coordinates travel in the body, never in URLs/logs.
  const ORIGIN_SQL = (i: number) => `extensions.st_setsrid(extensions.st_makepoint($${i + 1}, $${i}), 4326)::extensions.geography`;
  const REACH = (o: string, r: string) =>
    `extensions.st_dwithin(j.geo, ${o}, (${r} + CASE WHEN j.location_mode = 'service_area' THEN COALESCE(j.service_radius_km, 0) ELSE 0 END) * 1000)`;

  app.post("/api/lj/search", async (req: any, res) => {
    try {
      const b = req.body ?? {};
      const origin = await originFromBody(b);
      const where = [VISIBLE];
      const params: any[] = [];
      const add = (sql: string, val: any) => { params.push(val); where.push(sql.split("$$").join(`$${params.length}`)); };
      if (b.category && b.category !== "all") add("j.category = $$", String(b.category));
      if (b.county && b.county !== "all") add("j.county = $$", String(b.county));
      if (b.employmentType && b.employmentType !== "all") add("j.employment_type = $$", String(b.employmentType));
      if (b.today) where.push(`(COALESCE(j.published_at, j.created_at) AT TIME ZONE 'Africa/Nairobi')::date = (NOW() AT TIME ZONE 'Africa/Nairobi')::date`);
      if (b.q && String(b.q).trim()) {
        params.push(`%${String(b.q).trim().slice(0, 80)}%`); const i = params.length;
        where.push(`(j.title ILIKE $${i} OR c.name ILIKE $${i} OR j.description ILIKE $${i} OR j.town ILIKE $${i} OR j.estate ILIKE $${i} OR j.formatted_address ILIKE $${i})`);
      }
      let distSel = "NULL::float AS dist_km";
      const radius = b.radiusKm == null || b.radiusKm === "any" ? null : Math.min(500, Math.max(0.5, Number(b.radiusKm) || 25));
      if (origin) {
        params.push(origin.lat, origin.lng);
        const o = ORIGIN_SQL(params.length - 1);
        distSel = `extensions.st_distance(j.geo, ${o}) / 1000.0 AS dist_km`;
        if (radius != null) { params.push(radius); where.push(REACH(o, `$${params.length}`)); }
        else where.push(`${o} IS NOT NULL`); // keeps $lat/$lng referenced in the count query
      }
      const sort = String(b.sort ?? (origin ? "nearest" : "newest"));
      const order = sort === "nearest" && origin ? "dist_km ASC NULLS LAST"
        : sort === "vacancies" ? "j.vacancies DESC, COALESCE(j.published_at, j.created_at) DESC"
        : sort === "salary" ? "COALESCE(j.salary_max, j.salary_min) DESC NULLS LAST"
        : "COALESCE(j.published_at, j.created_at) DESC";
      const limit = Math.min(100, Math.max(1, Number(b.limit) || 30));
      const offset = Math.max(0, Number(b.offset) || 0);
      const w = where.join(" AND ");
      const [list, count] = await Promise.all([
        pool.query(`SELECT ${JOB_COLS}, ${distSel} FROM local_jobs j JOIN companies c ON c.id = j.company_id WHERE ${w} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, params),
        pool.query(`SELECT count(*)::int n, COALESCE(sum(j.vacancies),0)::int v FROM local_jobs j JOIN companies c ON c.id = j.company_id WHERE ${w}`, params),
      ]);
      res.setHeader("Cache-Control", "no-store");
      res.json({
        total: count.rows[0].n, vacancies: count.rows[0].v, limit, offset,
        origin: origin ? { label: origin.label, radiusKm: radius } : null,
        jobs: list.rows.map((r: any) => shapeJob(r, null)),
      });
    } catch (e: any) {
      console.error("[POST /api/lj/search]", e?.message);
      res.status(500).json({ message: "Could not search jobs." });
    }
  });

  /** Live location counters: selected area + 5/10/25 km + all of Kenya. */
  app.post("/api/lj/stats-near", async (req: any, res) => {
    try {
      const origin = await originFromBody(req.body ?? {});
      const radius = req.body?.radiusKm == null || req.body?.radiusKm === "any" ? null : Math.min(500, Math.max(0.5, Number(req.body.radiusKm) || 25));
      const params: any[] = [];
      let near = "NULL::int AS sel, NULL::int AS km5, NULL::int AS km10, NULL::int AS km25";
      if (origin) {
        params.push(origin.lat, origin.lng); const o = ORIGIN_SQL(1);
        params.push(radius ?? 100000);
        near = `count(*) FILTER (WHERE ${REACH(o, "$3")})::int AS sel,
                count(*) FILTER (WHERE ${REACH(o, "5")})::int AS km5,
                count(*) FILTER (WHERE ${REACH(o, "10")})::int AS km10,
                count(*) FILTER (WHERE ${REACH(o, "25")})::int AS km25`;
      }
      const { rows: [s] } = await pool.query(
        `SELECT count(*)::int total, COALESCE(sum(j.vacancies),0)::int vacancies,
                count(*) FILTER (WHERE (COALESCE(j.published_at, j.created_at) AT TIME ZONE 'Africa/Nairobi')::date = (NOW() AT TIME ZONE 'Africa/Nairobi')::date)::int today,
                count(*) FILTER (WHERE COALESCE(j.published_at, j.created_at) > NOW() - INTERVAL '7 days')::int week, ${near}
           FROM local_jobs j JOIN companies c ON c.id = j.company_id WHERE ${VISIBLE}`, params);
      res.setHeader("Cache-Control", "no-store");
      res.json({ ...s, label: origin?.label ?? null, radiusKm: radius, updatedAt: new Date().toISOString() });
    } catch (e: any) { console.error("[stats-near]", e?.message); res.status(500).json({ message: "Could not load counts." }); }
  });

  /** Admin map: every job with its pin, missing pins, per-county counts. */
  app.get("/api/admin/lj/map", async (req, res) => {
    const uid = await requireSuperAdmin(req, res); if (!uid) return;
    try {
      const { rows } = await pool.query(
        `SELECT j.id, j.title, j.status, j.county, j.town, j.estate, j.formatted_address, j.lat, j.lng, j.location_precision, j.location_mode,
                j.vacancies, c.name AS company_name,
                (j.status = 'open' AND (j.expires_at IS NULL OR j.expires_at > NOW()) AND (j.deadline IS NULL OR j.deadline >= (NOW() AT TIME ZONE 'Africa/Nairobi')::date)) AS is_live
           FROM local_jobs j JOIN companies c ON c.id = j.company_id
          WHERE NOT COALESCE(j.is_seed,false) AND j.status <> 'archived' ORDER BY j.updated_at DESC LIMIT 2000`);
      const counties: Record<string, number> = {};
      for (const r of rows) if (r.is_live && r.county) counties[r.county] = (counties[r.county] ?? 0) + 1;
      res.setHeader("Cache-Control", "no-store");
      res.json({
        jobs: rows.filter((r: any) => r.lat != null),
        missing: rows.filter((r: any) => r.lat == null || r.location_precision !== "exact"),
        counties: Object.entries(counties).sort((a, b) => b[1] - a[1]).map(([county, n]) => ({ county, n })),
      });
    } catch (e: any) { res.status(500).json({ message: "Could not load map." }); }
  });

  /** Fix a job's pin (validated like a new location). */
  app.post("/api/admin/lj/jobs/:id/location", async (req, res) => {
    const uid = await requireSuperAdmin(req, res); if (!uid) return;
    const L = await validatePublisherLocation(req.body?.location);
    if (!L.ok) return res.status(400).json({ message: L.message });
    const v = L.v;
    const { rowCount } = await pool.query(
      `UPDATE local_jobs SET lat=$2, lng=$3, place_id=$4, formatted_address=$5, street=$6, location_mode=$7, service_radius_km=$8,
              location_precision=$9, county=$10, town=COALESCE($11, town), estate=COALESCE($12, estate), updated_at=NOW() WHERE id=$1`,
      [req.params.id, v.lat, v.lng, v.placeId, v.formattedAddress, v.street, v.mode, v.serviceRadiusKm, v.precision, v.county, v.town, v.estate]);
    if (!rowCount) return res.status(404).json({ message: "Not found." });
    await audit(req.params.id, null, uid, "SUPER_ADMIN", "location_corrected", { lat: v.lat, lng: v.lng, placeId: v.placeId });
    res.json({ ok: true, location: v });
  });

  // ── Super admin ──
  app.get("/api/admin/lj/me", async (req, res) => {
    const uid = await requireSuperAdmin(req, res); if (!uid) return;
    res.json({ ok: true, canPublish: true });
  });

  app.get("/api/admin/lj/overview", async (req, res) => {
    const uid = await requireSuperAdmin(req, res); if (!uid) return;
    try {
      const { rows: [o] } = await pool.query(`
        SELECT count(*) FILTER (WHERE NOT COALESCE(j.is_seed,false))::int published_total,
               count(*) FILTER (WHERE ${VISIBLE})::int active,
               COALESCE(sum(j.vacancies) FILTER (WHERE ${VISIBLE}),0)::int positions,
               count(*) FILTER (WHERE j.status = 'draft' AND NOT COALESCE(j.is_seed,false))::int drafts,
               count(*) FILTER (WHERE j.status = 'paused')::int deactivated,
               count(*) FILTER (WHERE NOT COALESCE(j.is_seed,false) AND j.status = 'open' AND ((j.expires_at IS NOT NULL AND j.expires_at <= NOW()) OR (j.deadline IS NOT NULL AND j.deadline < (NOW() AT TIME ZONE 'Africa/Nairobi')::date)))::int expired,
               count(*) FILTER (WHERE j.source <> 'employer' AND NOT COALESCE(j.is_seed,false))::int by_admin,
               count(*) FILTER (WHERE j.source = 'employer' AND NOT COALESCE(j.is_seed,false))::int by_employers,
               count(*) FILTER (WHERE cardinality(j.risk_flags) > 0 AND j.status IN ('open','draft'))::int flagged
          FROM local_jobs j JOIN companies c ON c.id = j.company_id`);
      const { rows: [e] } = await pool.query(`
        SELECT count(*) FILTER (WHERE kind='call')::int calls, count(*) FILTER (WHERE kind='whatsapp')::int whatsapp,
               count(*) FILTER (WHERE kind='reveal')::int reveals,
               count(*) FILTER (WHERE kind IN ('call','whatsapp') AND created_at > NOW() - INTERVAL '7 days')::int contacts_7d
          FROM local_job_contact_events`);
      const { rows: [rep] } = await pool.query(`SELECT count(*)::int n FROM vacancy_reports WHERE status IS NULL OR status IN ('new','open','pending')`).catch(() => ({ rows: [{ n: 0 }] as any[] }));
      const { rows: [pend] } = await pool.query(`SELECT count(*)::int n FROM company_claims WHERE status = 'pending'`).catch(() => ({ rows: [{ n: 0 }] as any[] }));
      res.setHeader("Cache-Control", "no-store");
      res.json({ ...o, ...e, openReports: rep?.n ?? 0, pendingEmployerClaims: pend?.n ?? 0 });
    } catch (err: any) { console.error("[lj overview]", err?.message); res.status(500).json({ message: "Could not load overview." }); }
  });

  function adminListQuery(q: any) {
    const where: string[] = ["NOT COALESCE(j.is_seed,false)"];
    const params: any[] = [];
    const add = (sql: string, val: any) => { params.push(val); where.push(sql.split("$$").join(`$${params.length}`)); };
    const st = String(q.status ?? "all");
    if (st === "active") where.push(VISIBLE);
    else if (st === "expired") where.push(`j.status = 'open' AND ((j.expires_at IS NOT NULL AND j.expires_at <= NOW()) OR (j.deadline IS NOT NULL AND j.deadline < (NOW() AT TIME ZONE 'Africa/Nairobi')::date))`);
    else if (st === "flagged") where.push(`cardinality(j.risk_flags) > 0 AND j.status IN ('open','draft')`);
    else if (["draft", "paused", "closed", "archived", "open"].includes(st)) add("j.status = $$", st);
    if (q.source === "admin") where.push("j.source <> 'employer'");
    else if (q.source === "employer") where.push("j.source = 'employer'");
    if (q.county && q.county !== "all") add("j.county = $$", String(q.county));
    if (q.category && q.category !== "all") add("j.category = $$", String(q.category));
    if (q.employer) add("c.name ILIKE $$", `%${String(q.employer)}%`);
    if (q.q) add("(j.title ILIKE $$ OR c.name ILIKE $$ OR j.town ILIKE $$ OR j.contact_phone ILIKE $$)", `%${String(q.q)}%`);
    if (q.from) add("j.created_at >= $$::date", String(q.from));
    if (q.to) add("j.created_at < ($$::date + 1)", String(q.to));
    return { where: where.join(" AND "), params };
  }
  const ADMIN_COLS = `j.*, c.name AS company_name, c.created_by_admin AS company_no_account, (c.verified_at IS NOT NULL) AS employer_verified,
     (j.status = 'open' AND (j.expires_at IS NULL OR j.expires_at > NOW()) AND (j.deadline IS NULL OR j.deadline >= (NOW() AT TIME ZONE 'Africa/Nairobi')::date)) AS is_live,
     (SELECT count(*)::int FROM local_job_contact_events e WHERE e.job_id = j.id AND e.kind = 'call') AS calls,
     (SELECT count(*)::int FROM local_job_contact_events e WHERE e.job_id = j.id AND e.kind = 'whatsapp') AS whatsapps,
     (SELECT count(*)::int FROM local_job_contact_events e WHERE e.job_id = j.id AND e.kind = 'reveal') AS reveals,
     (SELECT count(*)::int FROM local_job_applications a WHERE a.job_id = j.id) AS applications`;

  app.get("/api/admin/lj/jobs", async (req, res) => {
    const uid = await requireSuperAdmin(req, res); if (!uid) return;
    try {
      const { where, params } = adminListQuery(req.query);
      const { rows } = await pool.query(`SELECT ${ADMIN_COLS} FROM local_jobs j JOIN companies c ON c.id = j.company_id WHERE ${where} ORDER BY j.updated_at DESC LIMIT 500`, params);
      res.setHeader("Cache-Control", "no-store");
      res.json({ jobs: rows.map((r: any) => ({ ...r, risk_labels: (r.risk_flags ?? []).map((f: string) => RISK_LABEL[f] ?? f) })) });
    } catch (err: any) { console.error("[lj admin list]", err?.message); res.status(500).json({ message: "Could not load jobs." }); }
  });

  app.get("/api/admin/lj/export.csv", async (req, res) => {
    const uid = await requireSuperAdmin(req, res); if (!uid) return;
    try {
      const { where, params } = adminListQuery(req.query);
      const { rows } = await pool.query(`SELECT ${ADMIN_COLS} FROM local_jobs j JOIN companies c ON c.id = j.company_id WHERE ${where} ORDER BY j.created_at DESC LIMIT 5000`, params);
      const cols = ["id", "title", "company_name", "category", "employment_type", "vacancies", "county", "town", "estate", "salary_min", "salary_max", "salary_period", "status", "is_live", "source", "verification_status", "deadline", "expires_at", "created_at", "published_at", "view_count", "reveals", "calls", "whatsapps", "applications"];
      const csv = [cols.join(","), ...rows.map((r: any) => cols.map((c) => csvCell(r[c])).join(","))].join("\n");
      await audit(null, null, uid, "SUPER_ADMIN", "export_csv", { rows: rows.length });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="local-jobs-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(csv);
    } catch (err: any) { res.status(500).json({ message: "Could not export." }); }
  });

  /** Preview check — runs validation + scam checks without saving. */
  app.post("/api/admin/lj/check", async (req, res) => {
    const uid = await requireSuperAdmin(req, res); if (!uid) return;
    const f = await readJobForm(req.body ?? {});
    if (!f.ok) return res.status(400).json(f);
    const v = f.v;
    const flags = [...v.riskFlags, ...(await dbRiskFlags(String(req.body?.id ?? "") || null, v.title, v.companyId, v.contactPhone))];
    res.json({ ok: true, flags, labels: flags.map((x) => RISK_LABEL[x] ?? x), located: v.lat != null, contactPhone: displayKePhone(v.contactPhone), whatsappPhone: displayKePhone(v.whatsappPhone) });
  });

  app.post("/api/admin/lj/jobs", async (req, res) => {
    const uid = await requireSuperAdmin(req, res); if (!uid) return;
    try {
      const publish = req.body?.publish === true;
      const f = await readJobForm(req.body ?? {}, { requireLocation: publish });
      if (!f.ok) return res.status(400).json(f);
      const v = f.v;
      const emp = await resolveEmployer(v);
      const flags = [...v.riskFlags, ...(await dbRiskFlags(null, v.title, emp.id, v.contactPhone))];
      if (publish && flags.includes("asks_for_fee") && req.body?.overrideRisk !== true) {
        return res.status(422).json({ message: "This job asks job seekers to pay a fee — that's the most common scam. Remove it, or confirm you've checked it.", flags, code: "RISK" });
      }
      const expiresAt = v.expiresAt ? new Date(v.expiresAt) : null;
      const { rows: [job] } = await pool.query(
        `INSERT INTO local_jobs (company_id, title, description, responsibilities, requirements, vacancies, employment_type, category,
            salary_min, salary_max, salary_period, county, town, estate, workplace_location, min_qualification, experience_text,
            experience_level, gender_requirement, working_hours, deadline, expires_at, contact_person, contact_phone, whatsapp_phone,
            alt_contact, instructions, contact_authorized, source, posted_by_user_id, verification_status, verification_note,
            lat, lng, risk_flags, status, published_at, is_seed, application_method)
         VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'any',$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,
                 $34::varchar, CASE WHEN $34::varchar = 'open' THEN NOW() ELSE NULL END, false, 'platform')
         RETURNING id, status`,
        [emp.id, v.title, v.description, v.requirements, v.vacancies, v.employmentType, v.category, v.salaryMin, v.salaryMax, v.salaryPeriod,
         v.county, v.town, v.estate, v.workplaceLocation, v.minQualification, v.experienceText, v.genderRequirement, v.workingHours,
         v.deadline, expiresAt, v.contactPerson, v.contactPhone, v.whatsappPhone, v.altContact, v.instructions, v.contactAuthorized,
         v.source, uid, v.verificationStatus, v.verificationNote, v.lat, v.lng, flags, publish ? "open" : "draft"],
      );
      await saveLocationExtras(job.id, v);
      if (emp.created) await audit(null, emp.id, uid, "SUPER_ADMIN", "employer_created_without_account", { name: v.employerName });
      await audit(job.id, emp.id, uid, "SUPER_ADMIN", publish ? "published" : "draft_saved", { source: v.source, flags, charged: false });
      console.log(`[lj] SUPER_ADMIN ${uid} ${publish ? "PUBLISHED" : "DRAFTED"} job=${job.id} "${v.title}" employer=${emp.id}${emp.created ? " (new, no account)" : ""}`);
      if (publish) {
        import("./lib/follower-notifications").then((m) => m.notifyFollowersOfLiveJobs(job.id)).catch(() => {});
      }
      res.status(201).json({ ok: true, job, employerCreated: emp.created, flags, labels: flags.map((x) => RISK_LABEL[x] ?? x) });
    } catch (err: any) {
      console.error("[POST /api/admin/lj/jobs]", err?.message);
      res.status(500).json({ message: "Could not save the job." });
    }
  });

  app.get("/api/admin/lj/jobs/:id", async (req, res) => {
    const uid = await requireSuperAdmin(req, res); if (!uid) return;
    const { rows } = await pool.query(`SELECT ${ADMIN_COLS} FROM local_jobs j JOIN companies c ON c.id = j.company_id WHERE j.id = $1`, [req.params.id]).catch(() => ({ rows: [] as any[] }));
    if (!rows.length) return res.status(404).json({ message: "Not found." });
    const { rows: trail } = await pool.query(`SELECT action, actor_role, detail, created_at FROM job_publication_audit WHERE job_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.params.id]);
    res.json({ job: rows[0], audit: trail });
  });

  app.put("/api/admin/lj/jobs/:id", async (req, res) => {
    const uid = await requireSuperAdmin(req, res); if (!uid) return;
    try {
      const f = await readJobForm(req.body ?? {});
      if (!f.ok) return res.status(400).json(f);
      const v = f.v;
      const { rows: [cur] } = await pool.query(`SELECT company_id FROM local_jobs WHERE id = $1`, [req.params.id]);
      if (!cur) return res.status(404).json({ message: "Not found." });
      const flags = [...v.riskFlags, ...(await dbRiskFlags(req.params.id, v.title, cur.company_id, v.contactPhone))];
      await pool.query(
        `UPDATE local_jobs SET title=$2, description=$3, responsibilities=$3, requirements=$4, vacancies=$5, employment_type=$6, category=$7,
            salary_min=$8, salary_max=$9, salary_period=$10, county=$11, town=$12, estate=$13, workplace_location=$14, min_qualification=$15,
            experience_text=$16, gender_requirement=$17, working_hours=$18, deadline=$19, expires_at=$20, contact_person=$21, contact_phone=$22,
            whatsapp_phone=$23, alt_contact=$24, instructions=$25, contact_authorized=$26, source=$27, verification_status=$28,
            verification_note=$29, lat=$30, lng=$31, risk_flags=$32, updated_at=NOW()
          WHERE id=$1`,
        [req.params.id, v.title, v.description, v.requirements, v.vacancies, v.employmentType, v.category, v.salaryMin, v.salaryMax, v.salaryPeriod,
         v.county, v.town, v.estate, v.workplaceLocation, v.minQualification, v.experienceText, v.genderRequirement, v.workingHours,
         v.deadline, v.expiresAt ? new Date(v.expiresAt) : null, v.contactPerson, v.contactPhone, v.whatsappPhone, v.altContact, v.instructions,
         v.contactAuthorized, v.source, v.verificationStatus, v.verificationNote, v.lat, v.lng, flags]);
      await saveLocationExtras(req.params.id, v);
      await audit(req.params.id, cur.company_id, uid, "SUPER_ADMIN", "edited", { flags });
      res.json({ ok: true, flags });
    } catch (err: any) { console.error("[PUT lj job]", err?.message); res.status(500).json({ message: "Could not update the job." }); }
  });

  app.post("/api/admin/lj/jobs/:id/action", async (req, res) => {
    const uid = await requireSuperAdmin(req, res); if (!uid) return;
    const action = String(req.body?.action ?? "");
    const id = req.params.id;
    try {
      const { rows: [cur] } = await pool.query(`SELECT company_id, status, risk_flags FROM local_jobs WHERE id = $1`, [id]);
      if (!cur) return res.status(404).json({ message: "Not found." });
      let sql = "";
      const p: any[] = [id];
      switch (action) {
        case "publish": {
          const { rows: [g] } = await pool.query(`SELECT lat FROM local_jobs WHERE id = $1`, [id]);
          if (g?.lat == null) return res.status(422).json({ message: "Set the workplace location on the map before publishing.", code: "LOCATION" });
        }
          if ((cur.risk_flags ?? []).includes("asks_for_fee") && req.body?.overrideRisk !== true) {
            return res.status(422).json({ message: "This job asks job seekers to pay a fee. Edit it, or confirm you've checked it.", code: "RISK" });
          }
          sql = `UPDATE local_jobs SET status='open', archived_at=NULL, published_at=COALESCE(published_at, NOW()), updated_at=NOW() WHERE id=$1`; break;
        case "deactivate": sql = `UPDATE local_jobs SET status='paused', updated_at=NOW() WHERE id=$1`; break;
        case "draft": sql = `UPDATE local_jobs SET status='draft', updated_at=NOW() WHERE id=$1`; break;
        case "archive": sql = `UPDATE local_jobs SET status='archived', archived_at=NOW(), updated_at=NOW() WHERE id=$1`; break;
        case "renew": {
          const days = Math.min(365, Math.max(1, Number(req.body?.days) || 30));
          p.push(days);
          sql = `UPDATE local_jobs SET status='open', archived_at=NULL, published_at=NOW(),
                   expires_at = NOW() + make_interval(days => $2),
                   deadline = CASE WHEN deadline IS NOT NULL AND deadline < (NOW() + make_interval(days => $2))::date THEN (NOW() + make_interval(days => $2))::date ELSE deadline END,
                   updated_at=NOW() WHERE id=$1`;
          break;
        }
        case "set_expiry": {
          const d = String(req.body?.expiresAt ?? "");
          if (d && Number.isNaN(Date.parse(d))) return res.status(400).json({ message: "Invalid date." });
          p.push(d ? new Date(d) : null);
          sql = `UPDATE local_jobs SET expires_at=$2, updated_at=NOW() WHERE id=$1`; break;
        }
        case "delete": {
          const { rows: [a] } = await pool.query(`SELECT count(*)::int n FROM local_job_applications WHERE job_id = $1`, [id]);
          if ((a?.n ?? 0) > 0) return res.status(409).json({ message: "This job has applications — archive it instead so they're kept." });
          await audit(id, cur.company_id, uid, "SUPER_ADMIN", "deleted", {});
          await pool.query(`DELETE FROM local_jobs WHERE id = $1`, [id]);
          return res.json({ ok: true, deleted: true });
        }
        default: return res.status(400).json({ message: "Unknown action." });
      }
      await pool.query(sql, p);
      await audit(id, cur.company_id, uid, "SUPER_ADMIN", action, { from: cur.status, days: req.body?.days, expiresAt: req.body?.expiresAt });
      const { rows: [after] } = await pool.query(`SELECT id, status, expires_at, deadline, published_at FROM local_jobs WHERE id = $1`, [id]);
      res.json({ ok: true, job: after });
    } catch (err: any) { console.error("[lj action]", err?.message); res.status(500).json({ message: "Could not update the job." }); }
  });

  // Employers
  app.get("/api/admin/lj/employers", async (req, res) => {
    const uid = await requireSuperAdmin(req, res); if (!uid) return;
    const q = String(req.query.q ?? "").trim();
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.county, c.town, c.phone, c.whatsapp_phone, c.contact_name, c.email, c.status, c.created_by_admin,
              c.verified_at, c.verification_note,
              EXISTS (SELECT 1 FROM company_admins ca WHERE ca.company_id = c.id) AS has_account,
              (SELECT count(*)::int FROM local_jobs j WHERE j.company_id = c.id AND NOT COALESCE(j.is_seed,false)) AS jobs,
              (SELECT count(*)::int FROM local_jobs j WHERE j.company_id = c.id AND j.status = 'open' AND NOT COALESCE(j.is_seed,false)) AS open_jobs
         FROM companies c WHERE ($1 = '' OR c.name ILIKE '%' || $1 || '%')
        ORDER BY c.updated_at DESC LIMIT 300`, [q]).catch(() => ({ rows: [] as any[] }));
    res.json({ employers: rows });
  });

  app.patch("/api/admin/lj/employers/:id", async (req, res) => {
    const uid = await requireSuperAdmin(req, res); if (!uid) return;
    const b = req.body ?? {};
    const verify = b.verified === true, unverify = b.verified === false;
    const note = String(b.verificationNote ?? "").trim().slice(0, 1000) || null;
    if (verify && !note) return res.status(400).json({ message: "Say how you verified this employer (e.g. 'Visited shop', 'KRA PIN checked')." });
    const phone = b.phone !== undefined ? (b.phone ? normalizeKePhone(b.phone) : null) : undefined;
    if (b.phone && !phone) return res.status(400).json({ message: "Phone isn't a valid Kenyan number." });
    const wa = b.whatsappPhone !== undefined ? (b.whatsappPhone ? normalizeKePhone(b.whatsappPhone) : null) : undefined;
    await pool.query(
      `UPDATE companies SET
         verified_at = CASE WHEN $2 THEN NOW() WHEN $3 THEN NULL ELSE verified_at END,
         verification_note = COALESCE($4, verification_note),
         phone = CASE WHEN $5 THEN $6 ELSE phone END,
         whatsapp_phone = CASE WHEN $7 THEN $8 ELSE whatsapp_phone END,
         contact_name = COALESCE($9, contact_name),
         status = COALESCE($10, status), updated_at = NOW()
       WHERE id = $1`,
      [req.params.id, verify, unverify, note, phone !== undefined, phone ?? null, wa !== undefined, wa ?? null,
       b.contactName ? String(b.contactName).slice(0, 120) : null, ["approved", "suspended"].includes(b.status) ? b.status : null]);
    await audit(null, req.params.id, uid, "SUPER_ADMIN", verify ? "employer_verified" : unverify ? "employer_unverified" : "employer_updated", { note });
    res.json({ ok: true });
  });

  // Categories
  app.get("/api/admin/lj/categories", async (req, res) => {
    const uid = await requireSuperAdmin(req, res); if (!uid) return;
    const { rows } = await pool.query(`SELECT * FROM local_job_categories ORDER BY sort, label`);
    res.json({ categories: rows });
  });
  app.post("/api/admin/lj/categories", async (req, res) => {
    const uid = await requireSuperAdmin(req, res); if (!uid) return;
    const label = String(req.body?.label ?? "").trim().slice(0, 80);
    if (label.length < 2) return res.status(400).json({ message: "Category name is required." });
    const slug = slugify(label).replace(/-/g, "_").slice(0, 40);
    await pool.query(`INSERT INTO local_job_categories (slug, label, icon, sort) VALUES ($1,$2,$3,500) ON CONFLICT (slug) DO UPDATE SET label = EXCLUDED.label, active = true`,
      [slug, label, String(req.body?.icon ?? "💼").slice(0, 8)]);
    await audit(null, null, uid, "SUPER_ADMIN", "category_added", { slug, label });
    res.status(201).json({ ok: true, slug });
  });

  // Reports + applications overview
  app.get("/api/admin/lj/reports", async (req, res) => {
    const uid = await requireSuperAdmin(req, res); if (!uid) return;
    const { rows } = await pool.query(
      `SELECT r.id, r.job_id, r.reason, r.details, r.status, r.created_at, j.title, c.name AS company_name
         FROM vacancy_reports r LEFT JOIN local_jobs j ON j.id = r.job_id LEFT JOIN companies c ON c.id = j.company_id
        ORDER BY r.created_at DESC LIMIT 200`).catch(() => ({ rows: [] as any[] }));
    res.json({ reports: rows });
  });
  app.get("/api/admin/lj/applications", async (req, res) => {
    const uid = await requireSuperAdmin(req, res); if (!uid) return;
    const { rows } = await pool.query(
      `SELECT a.id, a.status, a.applied_at AS created_at, j.title, c.name AS company_name, a.applicant_name, a.email, a.phone, a.applicant_county
         FROM local_job_applications a JOIN local_jobs j ON j.id = a.job_id JOIN companies c ON c.id = j.company_id
        WHERE NOT COALESCE(j.is_seed,false) ORDER BY a.applied_at DESC LIMIT 300`).catch(() => ({ rows: [] as any[] }));
    res.json({ applications: rows });
  });
}
