/**
 * Salary Intelligence API
 *
 * Endpoints
 *   GET /api/salary/roles                 — list every supported role + category
 *   GET /api/salary/role/:roleKey         — full salary card for one role (every country)
 *   GET /api/salary/role/:roleKey/best    — top 3 countries by KES-midpoint for a role
 *
 * The data lives in shared/salary-intelligence.ts (no DB) so this whole
 * module is just a thin pass-through that adds cache headers.
 *
 * 2026-06: retention feature #2.
 */
import type { Express, Response } from "express";
import {
  SALARY_ROLES,
  SUPPORTED_SALARY_COUNTRIES,
  NAIROBI_BENCHMARK_KES,
  getRoleByKey,
  compareRoleAcrossCountries,
} from "@shared/salary-intelligence";

export function registerSalaryRoutes(app: Express): void {
  // Cache for 1 hour at the CDN edge — content is static between deploys.
  const CACHE_CONTROL = "public, max-age=300, s-maxage=3600";

  app.get("/api/salary/roles", (_req, res: Response) => {
    res.setHeader("Cache-Control", CACHE_CONTROL);
    res.json({
      countries: SUPPORTED_SALARY_COUNTRIES,
      roles: SALARY_ROLES.map((r) => ({
        key: r.key,
        label: r.label,
        category: r.category,
        description: r.description,
        countryCount: r.entries.length,
      })),
    });
  });

  app.get("/api/salary/role/:roleKey", (req, res: Response) => {
    const roleKey = String(req.params.roleKey || "").toLowerCase();
    const role = getRoleByKey(roleKey);
    if (!role) return res.status(404).json({ message: `Role "${roleKey}" not found` });
    const compared = compareRoleAcrossCountries(roleKey);
    res.setHeader("Cache-Control", CACHE_CONTROL);
    res.json({
      role: {
        key: role.key,
        label: role.label,
        category: role.category,
        description: role.description,
      },
      nairobiBenchmarkKes: NAIROBI_BENCHMARK_KES[roleKey] ?? null,
      countries: compared,
    });
  });

  app.get("/api/salary/role/:roleKey/best", (req, res: Response) => {
    const roleKey = String(req.params.roleKey || "").toLowerCase();
    const role = getRoleByKey(roleKey);
    if (!role) return res.status(404).json({ message: `Role "${roleKey}" not found` });
    const compared = compareRoleAcrossCountries(roleKey).slice(0, 3);
    res.setHeader("Cache-Control", CACHE_CONTROL);
    res.json({
      role: { key: role.key, label: role.label },
      nairobiBenchmarkKes: NAIROBI_BENCHMARK_KES[roleKey] ?? null,
      best: compared,
    });
  });

  console.log("[salary] Routes registered: GET /api/salary/roles + /api/salary/role/:roleKey + /best");
}
