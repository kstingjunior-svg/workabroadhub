"use strict";
/**
 * Sync Engine — diff (Milestone 2).
 *
 * Pure function. Given:
 *   • Current agencies for a provider (Map keyed by license_number)
 *   • Run's validated records (with new fingerprints)
 *
 * Emits a ChangeSet with created / updated / unchanged / deleted bins.
 *
 * Design notes:
 *
 *   1. **Diff is comparison only — no I/O.** Inputs are already loaded;
 *      we don't touch DB. Determinism + unit-testability come for free.
 *
 *   2. **Per-field before/after on updates.** The Apply stage writes
 *      these as agency_change_log.field_changes, so admins see exactly
 *      what moved. Fields with identical before/after are omitted from
 *      the entry — only the changed columns appear.
 *
 *   3. **"Unchanged" exists as a bin for accounting.** Apply still
 *      touches last_seen_at so we can distinguish "no diff, still
 *      present" from "absent from source". Counts on sync_runs add up
 *      to (created + updated + unchanged + deleted = currentSize +
 *      createdCount).
 *
 *   4. **Deleted means "present in DB, absent from this run".** Apply
 *      flips status_source to 'expired'; never hard-deletes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeDiff = computeDiff;
exports.countChanges = countChanges;
// ─────────────────────────────────────────────────────────────────────────────
// computeDiff()
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Compute the change set. Deterministic; no I/O. Caller supplies both inputs.
 *
 * Time complexity: O(N + M) where N = current rows, M = run records.
 * Memory: one entry per change. At 1k records this is comfortably under a
 * few MB of allocations and well within the NFR-7 ≤200MB worker budget.
 */
function computeDiff(current, validated) {
    const created = [];
    const updated = [];
    const unchanged = [];
    const deleted = [];
    // Set of license numbers seen in this run; used to compute "deleted" set.
    const seenLicenses = new Set();
    for (const v of validated) {
        const lic = v.agency.licenseNumber;
        seenLicenses.add(lic);
        const existing = current.get(lic);
        if (!existing) {
            created.push({
                licenseNumber: lic,
                agency: v.agency,
                fingerprint: v.fingerprint,
            });
            continue;
        }
        // Fingerprint match → unchanged. The provider_record_fp on the DB row
        // is the canonical comparison; we never re-hash on the diff path.
        if (existing.providerRecordFp === v.fingerprint) {
            unchanged.push({ licenseNumber: lic, agencyId: existing.id });
            continue;
        }
        // Otherwise it's an update. Compute per-field delta so the change log
        // shows only what actually moved.
        const fieldChanges = computeFieldChanges(existing, v.agency);
        updated.push({
            licenseNumber: lic,
            agencyId: existing.id,
            agency: v.agency,
            fingerprint: v.fingerprint,
            fieldChanges,
        });
    }
    // Any DB row whose license_number didn't appear in this run is "deleted
    // from source". We collect those last so the loop above only does one
    // pass over the validated list.
    for (const [lic, row] of current.entries()) {
        if (seenLicenses.has(lic))
            continue;
        deleted.push({
            licenseNumber: lic,
            agencyId: row.id,
            before: row,
        });
    }
    return { created, updated, unchanged, deleted };
}
// ─────────────────────────────────────────────────────────────────────────────
// Internal — per-field delta
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Compare a CurrentAgencyRow to a NormalizedAgency and return only the
 * fields whose values differ. The shape is what agency_change_log expects:
 *   { fieldName: { from: oldValue, to: newValue } }
 *
 * We deliberately compare the fields the engine controls (the ones in
 * NormalizedAgency); admin-controlled columns (status_override, etc.) are
 * never read here, so they can never be reported as a "change".
 */
function computeFieldChanges(before, after) {
    const out = {};
    // Pairs are explicit — adding a field requires editing here AND
    // fingerprint.ts AND types.ts in lock-step. That's intentional.
    const pairs = [
        ["agencyName", before.agencyName, after.agencyName],
        ["country", before.country, after.country],
        ["serviceType", before.serviceType, after.serviceType],
        ["email", before.email, after.email],
        ["website", before.website, after.website],
        ["phone", before.phone, after.phone],
        ["issueDate", before.issueDate, after.issueDate],
        ["expiryDate", before.expiryDate, after.expiryDate],
        ["statusSource", before.statusSource, after.statusSource],
    ];
    for (const [name, oldVal, newVal] of pairs) {
        if (!shallowEqual(oldVal, newVal)) {
            out[name] = { from: oldVal, to: newVal };
        }
    }
    return out;
}
function shallowEqual(a, b) {
    if (a === b)
        return true;
    // Treat null and "" as different so a provider switching null → "" is
    // captured by the diff. (The FINGERPRINT folds them together for the
    // hash, but the audit log should show the move.)
    if (a == null && b == null)
        return true;
    return false;
}
function countChanges(cs) {
    return {
        created: cs.created.length,
        updated: cs.updated.length,
        unchanged: cs.unchanged.length,
        deleted: cs.deleted.length,
        total: cs.created.length + cs.updated.length + cs.unchanged.length + cs.deleted.length,
    };
}
