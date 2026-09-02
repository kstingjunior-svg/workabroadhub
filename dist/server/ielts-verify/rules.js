"use strict";
/**
 * rules.ts — IELTS format + score validation rules.
 *
 * Every check returns a pass/warn/fail/info verdict with human explanation.
 * The analyzer aggregates these into the "IELTS Format Compliance" and
 * "Score Consistency" sub-scores.
 *
 * Rule sources:
 *   - IELTS Handbook (2026 edition)
 *   - IELTS Test Report Form design guidelines (British Council + IDP)
 *   - IELTS scoring rules (Overall Band calculation)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeExpectedOverallBand = computeExpectedOverallBand;
exports.expectedCefr = expectedCefr;
exports.runIeltsRules = runIeltsRules;
exports.scoreIeltsRules = scoreIeltsRules;
/**
 * Valid IELTS band scores. Overall & sub-scores use 0.5 increments from 0 to 9.
 */
const VALID_BANDS = new Set(Array.from({ length: 19 }, (_, i) => i * 0.5));
/**
 * IELTS Overall Band calculation:
 *   avg = (L + R + W + S) / 4
 *   Round to nearest 0.5. Halves ending in .25 round UP to next 0.5.
 *   Halves ending in .75 round UP to next whole number.
 * (Source: IELTS Handbook)
 */
function computeExpectedOverallBand(l, r, w, s) {
    if (l == null || r == null || w == null || s == null)
        return null;
    const avg = (l + r + w + s) / 4;
    const rounded = Math.round(avg * 4) / 4; // to nearest 0.25
    if (Number.isInteger(rounded))
        return rounded;
    const dec = rounded - Math.floor(rounded);
    // .25 → .5, .5 → .5, .75 → 1.0
    if (dec === 0.25)
        return Math.floor(rounded) + 0.5;
    if (dec === 0.5)
        return rounded;
    if (dec === 0.75)
        return Math.floor(rounded) + 1;
    return rounded;
}
/**
 * CEFR ↔ IELTS band expected mapping (informational only — many CEFR maps
 * exist, this uses the common IELTS-official conversion). Used to flag
 * INCONSISTENT CEFR labelling (band 5 marked as C1, etc.).
 */
function expectedCefr(overall) {
    if (overall == null)
        return null;
    if (overall >= 8.5)
        return "C2";
    if (overall >= 7.0)
        return "C1";
    if (overall >= 5.5)
        return "B2";
    if (overall >= 4.0)
        return "B1";
    if (overall >= 3.0)
        return "A2";
    if (overall >= 1.0)
        return "A1";
    return null;
}
function runIeltsRules(fields) {
    const checks = [];
    // ── 1. Candidate name ────────────────────────────────────────────
    if (!fields.candidateName) {
        checks.push({
            id: "candidate_name_missing",
            label: "Candidate name",
            status: "fail",
            detail: "No candidate name is visible. Every IELTS TRF states the candidate's full name.",
        });
    }
    // ── 2. Candidate number ─────────────────────────────────────────
    if (!fields.candidateNumber) {
        checks.push({
            id: "candidate_number_missing",
            label: "Candidate number",
            status: "warn",
            detail: "No IELTS candidate number was extracted. Standard TRFs include this.",
        });
    }
    // ── 3. TRF number format ────────────────────────────────────────
    if (!fields.trfNumber) {
        checks.push({
            id: "trf_number_missing",
            label: "TRF number",
            status: "fail",
            detail: "No Test Report Form number visible. TRF numbers are the primary identifier institutions use to verify results.",
        });
    }
    else {
        const trf = fields.trfNumber.replace(/\s+/g, "");
        // Typical IELTS TRF numbers: 18 characters, digits + letters (e.g. 25KE001234ABCD5678).
        // We accept 14-20 chars alphanumeric as "looks valid".
        if (!/^[A-Za-z0-9]{12,22}$/.test(trf)) {
            checks.push({
                id: "trf_number_format",
                label: "TRF number format",
                status: "warn",
                detail: `TRF number "${fields.trfNumber}" doesn't match the typical IELTS format (12-22 alphanumeric characters). This alone isn't a fail — check with the test centre.`,
            });
        }
        else {
            checks.push({
                id: "trf_number_format_ok",
                label: "TRF number format",
                status: "pass",
                detail: `TRF number format is consistent with a standard IELTS TRF.`,
            });
        }
    }
    // ── 4. Test centre ──────────────────────────────────────────────
    if (!fields.testCentreName && !fields.testCentreNumber) {
        checks.push({
            id: "test_centre_missing",
            label: "Test centre",
            status: "fail",
            detail: "No test centre name or number visible. Every IELTS TRF shows the issuing centre.",
        });
    }
    // ── 5. Dates ─────────────────────────────────────────────────────
    const testDate = parseDate(fields.testDate);
    const issueDate = parseDate(fields.issueDate);
    if (testDate && issueDate) {
        if (issueDate.getTime() < testDate.getTime()) {
            checks.push({
                id: "date_order_invalid",
                label: "Date logic",
                status: "fail",
                detail: `Issue date (${fields.issueDate}) is BEFORE test date (${fields.testDate}) — impossible on a genuine TRF.`,
            });
        }
        else {
            const daysBetween = (issueDate.getTime() - testDate.getTime()) / (1000 * 60 * 60 * 24);
            if (daysBetween > 60) {
                checks.push({
                    id: "date_gap_large",
                    label: "Date gap",
                    status: "warn",
                    detail: `Unusually long gap (${Math.round(daysBetween)} days) between test date and issue date. IELTS TRFs are normally issued within 3-13 days of the test.`,
                });
            }
            else {
                checks.push({
                    id: "date_logic_ok",
                    label: "Date logic",
                    status: "pass",
                    detail: `Issue date is ${Math.round(daysBetween)} days after test date — consistent with normal IELTS results processing.`,
                });
            }
        }
    }
    else if (!fields.testDate && !fields.issueDate) {
        checks.push({
            id: "date_missing",
            label: "Dates",
            status: "fail",
            detail: "No test date or issue date visible. Every TRF carries both.",
        });
    }
    // ── 6. Test type ─────────────────────────────────────────────────
    const validTypes = ["academic", "general training", "ukvi", "life skills"];
    const type = (fields.testType ?? "").toLowerCase();
    if (!fields.testType) {
        checks.push({
            id: "test_type_missing",
            label: "Test type",
            status: "warn",
            detail: "Test type (Academic / General Training / UKVI / Life Skills) not clearly shown.",
        });
    }
    else if (!validTypes.some((v) => type.includes(v))) {
        checks.push({
            id: "test_type_unknown",
            label: "Test type",
            status: "warn",
            detail: `"${fields.testType}" is not one of the standard IELTS test types (Academic, General Training, UKVI, Life Skills).`,
        });
    }
    // ── 7. Band score validity ──────────────────────────────────────
    const bandFields = [
        ["Listening", fields.listeningBand],
        ["Reading", fields.readingBand],
        ["Writing", fields.writingBand],
        ["Speaking", fields.speakingBand],
        ["Overall", fields.overallBand],
    ];
    for (const [label, band] of bandFields) {
        if (band == null) {
            checks.push({
                id: `band_${label.toLowerCase()}_missing`,
                label: `${label} band`,
                status: label === "Overall" ? "fail" : "warn",
                detail: `${label} band score not extracted.`,
            });
            continue;
        }
        if (!VALID_BANDS.has(band)) {
            checks.push({
                id: `band_${label.toLowerCase()}_invalid`,
                label: `${label} band`,
                status: "fail",
                detail: `${label} band ${band} is not a valid IELTS score. IELTS uses 0.5 increments from 0 to 9.`,
            });
        }
    }
    // ── 8. Overall band consistency ─────────────────────────────────
    const expected = computeExpectedOverallBand(fields.listeningBand, fields.readingBand, fields.writingBand, fields.speakingBand);
    if (expected != null && fields.overallBand != null) {
        if (Math.abs(expected - fields.overallBand) < 0.01) {
            checks.push({
                id: "overall_band_consistent",
                label: "Overall band consistency",
                status: "pass",
                detail: `Overall band ${fields.overallBand} correctly matches the average of L(${fields.listeningBand}) + R(${fields.readingBand}) + W(${fields.writingBand}) + S(${fields.speakingBand}) = ${((fields.listeningBand + fields.readingBand + fields.writingBand + fields.speakingBand) / 4).toFixed(2)} rounded per IELTS rules.`,
            });
        }
        else {
            checks.push({
                id: "overall_band_inconsistent",
                label: "Overall band consistency",
                status: "fail",
                detail: `Overall band ${fields.overallBand} does NOT match the IELTS-standard rounding of the section scores (expected ${expected}). This is one of the most common tell-tale signs of a doctored TRF.`,
            });
        }
    }
    // ── 9. CEFR consistency (informational) ─────────────────────────
    if (fields.cefrLevel && fields.overallBand != null) {
        const expectedC = expectedCefr(fields.overallBand);
        if (expectedC && expectedC !== fields.cefrLevel.toUpperCase().trim()) {
            checks.push({
                id: "cefr_mismatch",
                label: "CEFR level",
                status: "warn",
                detail: `CEFR shown as "${fields.cefrLevel}" but IELTS Overall Band ${fields.overallBand} typically maps to ${expectedC}. Not always fatal (CEFR mapping isn't strict), but worth checking.`,
            });
        }
    }
    // ── 10. Security features ───────────────────────────────────────
    const secCount = [
        fields.hasQrCode, fields.hasBarcode, fields.hasCandidatePhoto,
        fields.hasSignature, fields.hasSecurityBackground, fields.hasWatermark,
        fields.hasBritishCouncilLogo || fields.hasIdpLogo,
        fields.hasIeltsLogo,
    ].filter(Boolean).length;
    if (secCount === 0) {
        checks.push({
            id: "no_security_features",
            label: "Security features",
            status: "fail",
            detail: "No IELTS security features detected (logo, watermark, QR, barcode, candidate photo). Real TRFs always carry multiple.",
        });
    }
    else if (secCount <= 3) {
        checks.push({
            id: "few_security_features",
            label: "Security features",
            status: "warn",
            detail: `Only ${secCount} security feature(s) detected. Genuine TRFs typically carry 5+ (provider logo, IELTS logo, candidate photo, QR/barcode, security background pattern, signature).`,
        });
    }
    else {
        checks.push({
            id: "security_features_ok",
            label: "Security features",
            status: "pass",
            detail: `${secCount} security features detected — consistent with a genuine TRF.`,
        });
    }
    // ── 11. Candidate photo ─────────────────────────────────────────
    if (fields.hasCandidatePhoto === false) {
        checks.push({
            id: "candidate_photo_missing",
            label: "Candidate photograph",
            status: "warn",
            detail: "No candidate photograph visible on the TRF. IELTS TRFs (both paper and eTRF) show the candidate's photo taken at the test centre.",
        });
    }
    // ── 12. Provider logo ───────────────────────────────────────────
    if (!fields.hasBritishCouncilLogo && !fields.hasIdpLogo && !fields.hasIeltsLogo) {
        checks.push({
            id: "no_provider_logo",
            label: "Provider branding",
            status: "fail",
            detail: "No IELTS provider logo (British Council, IDP, or IELTS USA) OR IELTS logo detected. Legitimate TRFs always carry both the provider logo AND the IELTS logo.",
        });
    }
    return checks;
}
function scoreIeltsRules(checks) {
    let s = 100;
    for (const c of checks) {
        if (c.status === "fail")
            s -= 25;
        else if (c.status === "warn")
            s -= 8;
    }
    return Math.max(0, s);
}
// ── Helpers ─────────────────────────────────────────────────────────────
function parseDate(s) {
    if (!s)
        return null;
    const t = String(s).trim();
    if (!t)
        return null;
    const iso = t.replace(/\//g, "-");
    const d = new Date(iso);
    if (!isNaN(d.getTime()))
        return d;
    const m = /^(\d{1,2})[\s\-\/]+([A-Za-z]{3,})[\s\-\/]+(\d{4})$/.exec(t);
    if (m) {
        const map = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
        const mi = map[m[2].slice(0, 3).toLowerCase()];
        if (mi !== undefined)
            return new Date(Number(m[3]), mi, Number(m[1]));
    }
    return null;
}
