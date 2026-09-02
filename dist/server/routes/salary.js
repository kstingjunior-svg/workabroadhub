"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSalaryRoutes = registerSalaryRoutes;
const salary_intelligence_1 = require("@shared/salary-intelligence");
function registerSalaryRoutes(app) {
    // Cache for 1 hour at the CDN edge — content is static between deploys.
    const CACHE_CONTROL = "public, max-age=300, s-maxage=3600";
    app.get("/api/salary/roles", (_req, res) => {
        res.setHeader("Cache-Control", CACHE_CONTROL);
        res.json({
            countries: salary_intelligence_1.SUPPORTED_SALARY_COUNTRIES,
            roles: salary_intelligence_1.SALARY_ROLES.map((r) => ({
                key: r.key,
                label: r.label,
                category: r.category,
                description: r.description,
                countryCount: r.entries.length,
            })),
        });
    });
    app.get("/api/salary/role/:roleKey", (req, res) => {
        const roleKey = String(req.params.roleKey || "").toLowerCase();
        const role = (0, salary_intelligence_1.getRoleByKey)(roleKey);
        if (!role)
            return res.status(404).json({ message: `Role "${roleKey}" not found` });
        const compared = (0, salary_intelligence_1.compareRoleAcrossCountries)(roleKey);
        res.setHeader("Cache-Control", CACHE_CONTROL);
        res.json({
            role: {
                key: role.key,
                label: role.label,
                category: role.category,
                description: role.description,
            },
            nairobiBenchmarkKes: salary_intelligence_1.NAIROBI_BENCHMARK_KES[roleKey] ?? null,
            countries: compared,
        });
    });
    app.get("/api/salary/role/:roleKey/best", (req, res) => {
        const roleKey = String(req.params.roleKey || "").toLowerCase();
        const role = (0, salary_intelligence_1.getRoleByKey)(roleKey);
        if (!role)
            return res.status(404).json({ message: `Role "${roleKey}" not found` });
        const compared = (0, salary_intelligence_1.compareRoleAcrossCountries)(roleKey).slice(0, 3);
        res.setHeader("Cache-Control", CACHE_CONTROL);
        res.json({
            role: { key: role.key, label: role.label },
            nairobiBenchmarkKes: salary_intelligence_1.NAIROBI_BENCHMARK_KES[roleKey] ?? null,
            best: compared,
        });
    });
    console.log("[salary] Routes registered: GET /api/salary/roles + /api/salary/role/:roleKey + /best");
}
