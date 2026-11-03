-- 0054 — indexes for /api/verify/search and agency pages (2026-11-03). Applied.
CREATE INDEX IF NOT EXISTS idx_fraud_flags_entity ON fraud_flags(entity_id, status);
CREATE INDEX IF NOT EXISTS idx_blacklisted_entities_entity ON blacklisted_entities(entity_id, status);
CREATE INDEX IF NOT EXISTS idx_agency_scores_agency ON agency_legitimacy_scores(agency_id);
