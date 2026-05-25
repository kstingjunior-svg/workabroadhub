-- ─────────────────────────────────────────────────────────────────────────────
-- Replace WAF-blocked / geo-blocked job portals with Kenya-accessible alternatives.
--
-- BACKGROUND:
--   Some popular Western job portals (Monster, TotalJobs, CareerBuilder,
--   Glassdoor) use aggressive WAFs like Akamai that block non-local visitors
--   — including users browsing from Kenya. These cards lead to "Access
--   Denied" pages, which is a terrible user experience.
--
-- POLICY:
--   - Remove portals confirmed to block Kenyan traffic.
--   - Replace them with regional equivalents that are reliably reachable
--     from any IP (Indeed, LinkedIn, government job boards, Adzuna, etc.).
--   - Keep the same display order so the dashboard layout stays consistent.
--
-- Safe to re-run — uses ON CONFLICT and explicit DELETE BY URL.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── REMOVE: known WAF-blocked portals (across all countries) ────────────────
-- Match by URL prefix so any future trailing-slash variation also catches.
DELETE FROM job_links
 WHERE url ILIKE 'https://www.monster.co.uk%'
    OR url ILIKE 'https://www.monster.ca%'
    OR url ILIKE 'https://www.monster.com%'
    OR url ILIKE 'https://www.monster.com.au%'
    OR url ILIKE 'https://www.monsterindia.com%'
    OR url ILIKE 'https://www.monstergulf.com%'
    OR url ILIKE 'https://www.totaljobs.com%'
    OR url ILIKE 'https://www.careerbuilder.ca%'
    OR url ILIKE 'https://www.careerbuilder.com%'
    OR url ILIKE 'https://www.workopolis.com%';

-- ── ADD: UK replacements (Kenya-accessible) ─────────────────────────────────
INSERT INTO job_links (country_id, name, url, description, is_active, "order")
SELECT c.id, v.name, v.url, v.description, true, v."order"
  FROM countries c
  JOIN (VALUES
    ('CV-Library',     'https://www.cv-library.co.uk', 'Large UK CV-sharing job board, sponsors visas across multiple sectors',         3),
    ('Adzuna UK',      'https://www.adzuna.co.uk',     'Aggregator pulling listings from across the UK web — visa-friendly filters',  4),
    ('Glassdoor UK',   'https://www.glassdoor.co.uk',  'Salaries + reviews + jobs. May ask you to register, no aggressive geo-block', 6)
  ) AS v(name, url, description, "order")
    ON true
 WHERE c.code = 'UK'
   AND NOT EXISTS (
     SELECT 1 FROM job_links jl WHERE jl.country_id = c.id AND jl.url = v.url
   );

-- ── ADD: Canada replacements ────────────────────────────────────────────────
INSERT INTO job_links (country_id, name, url, description, is_active, "order")
SELECT c.id, v.name, v.url, v.description, true, v."order"
  FROM countries c
  JOIN (VALUES
    ('LinkedIn Jobs Canada', 'https://www.linkedin.com/jobs/?location=Canada', 'Largest professional job network, no geo-block', 4),
    ('Adzuna Canada',        'https://www.adzuna.ca',                          'Job aggregator covering Canadian listings',      5),
    ('Eluta',                'https://www.eluta.ca',                           'Top-100 employer search backed by Mediacorp',    6)
  ) AS v(name, url, description, "order")
    ON true
 WHERE c.code = 'CA'
   AND NOT EXISTS (
     SELECT 1 FROM job_links jl WHERE jl.country_id = c.id AND jl.url = v.url
   );

-- ── ADD: USA replacements (Monster.com removed if it was added) ─────────────
INSERT INTO job_links (country_id, name, url, description, is_active, "order")
SELECT c.id, v.name, v.url, v.description, true, v."order"
  FROM countries c
  JOIN (VALUES
    ('Glassdoor USA',  'https://www.glassdoor.com',   'Salaries + reviews + jobs',                                     4),
    ('Dice (Tech)',    'https://www.dice.com',        'Tech-focused job board — strong H-1B sponsorship listings',     5),
    ('SimplyHired',    'https://www.simplyhired.com', 'Aggregator with friendly access',                               6)
  ) AS v(name, url, description, "order")
    ON true
 WHERE c.code = 'US'
   AND NOT EXISTS (
     SELECT 1 FROM job_links jl WHERE jl.country_id = c.id AND jl.url = v.url
   );

-- ── ADD: Australia (if Monster AU was removed) ──────────────────────────────
INSERT INTO job_links (country_id, name, url, description, is_active, "order")
SELECT c.id, v.name, v.url, v.description, true, v."order"
  FROM countries c
  JOIN (VALUES
    ('SEEK',            'https://www.seek.com.au',           'Largest Australian job board — visa-sponsor filter available', 1),
    ('Indeed Australia','https://au.indeed.com',             'Indeed AU has strong visa-sponsorship listings',               2),
    ('LinkedIn AU',     'https://www.linkedin.com/jobs/?location=Australia', 'Professional jobs in Australia',     3),
    ('Workforce Australia (Gov)', 'https://www.workforceaustralia.gov.au',   'Official Australian gov job platform', 4),
    ('Adzuna Australia','https://www.adzuna.com.au',         'Job aggregator covering AU',                                   5)
  ) AS v(name, url, description, "order")
    ON true
 WHERE c.code = 'AU'
   AND NOT EXISTS (
     SELECT 1 FROM job_links jl WHERE jl.country_id = c.id AND jl.url = v.url
   );

-- ── ADD: UAE / Gulf (Monster Gulf removed if present) ───────────────────────
INSERT INTO job_links (country_id, name, url, description, is_active, "order")
SELECT c.id, v.name, v.url, v.description, true, v."order"
  FROM countries c
  JOIN (VALUES
    ('Naukri Gulf',  'https://www.naukrigulf.com', 'Major Gulf job board, India + Africa friendly',             6),
    ('GulfTalent',   'https://www.gulftalent.com', 'Mid-to-senior roles across UAE, Saudi, Qatar, Kuwait',      7)
  ) AS v(name, url, description, "order")
    ON true
 WHERE c.code = 'AE'
   AND NOT EXISTS (
     SELECT 1 FROM job_links jl WHERE jl.country_id = c.id AND jl.url = v.url
   );

-- ── ADD: Germany (Stepstone is fine, Make-it-in-Germany already there) ─────
INSERT INTO job_links (country_id, name, url, description, is_active, "order")
SELECT c.id, v.name, v.url, v.description, true, v."order"
  FROM countries c
  JOIN (VALUES
    ('Stepstone',         'https://www.stepstone.de',                        'Largest German job board, English filter available',  3),
    ('LinkedIn Germany',  'https://www.linkedin.com/jobs/?location=Germany', 'Strong tech + skilled jobs in Germany',               4),
    ('Indeed Germany',    'https://de.indeed.com',                           'Indeed DE — broad coverage',                           5)
  ) AS v(name, url, description, "order")
    ON true
 WHERE c.code = 'DE'
   AND NOT EXISTS (
     SELECT 1 FROM job_links jl WHERE jl.country_id = c.id AND jl.url = v.url
   );

-- ── ADD: Saudi Arabia ──────────────────────────────────────────────────────
INSERT INTO job_links (country_id, name, url, description, is_active, "order")
SELECT c.id, v.name, v.url, v.description, true, v."order"
  FROM countries c
  JOIN (VALUES
    ('Bayt Saudi',      'https://www.bayt.com/en/saudi-arabia/',  'Middle East largest job board — Saudi listings',   1),
    ('LinkedIn Saudi',  'https://www.linkedin.com/jobs/?location=Saudi+Arabia', 'Vision 2030 roles, skilled migration', 2),
    ('Naukri Gulf SA',  'https://www.naukrigulf.com/jobs-in-saudi-arabia', 'Saudi-focused Naukri Gulf',                  3),
    ('GulfTalent SA',   'https://www.gulftalent.com/saudi-arabia/jobs', 'Mid-senior Saudi roles',                       4),
    ('Indeed Saudi',    'https://sa.indeed.com',                  'Indeed SA',                                         5)
  ) AS v(name, url, description, "order")
    ON true
 WHERE c.code = 'SA'
   AND NOT EXISTS (
     SELECT 1 FROM job_links jl WHERE jl.country_id = c.id AND jl.url = v.url
   );

-- ── ADD: Qatar ─────────────────────────────────────────────────────────────
INSERT INTO job_links (country_id, name, url, description, is_active, "order")
SELECT c.id, v.name, v.url, v.description, true, v."order"
  FROM countries c
  JOIN (VALUES
    ('Bayt Qatar',      'https://www.bayt.com/en/qatar/',                 'Bayt Qatar listings',              1),
    ('LinkedIn Qatar',  'https://www.linkedin.com/jobs/?location=Qatar',  'Qatar-located roles',              2),
    ('Naukri Gulf Qatar','https://www.naukrigulf.com/jobs-in-qatar',      'Qatar-focused Naukri Gulf',        3),
    ('GulfTalent Qatar','https://www.gulftalent.com/qatar/jobs',          'Mid-senior Qatar roles',           4),
    ('Indeed Qatar',    'https://qa.indeed.com',                          'Indeed QA',                        5)
  ) AS v(name, url, description, "order")
    ON true
 WHERE c.code = 'QA'
   AND NOT EXISTS (
     SELECT 1 FROM job_links jl WHERE jl.country_id = c.id AND jl.url = v.url
   );

COMMIT;

-- Final inspection — should show no banned URLs and new ones present
-- Run separately if you want to verify:
--   SELECT c.code, jl.name, jl.url FROM job_links jl
--     JOIN countries c ON c.id = jl.country_id
--    ORDER BY c.code, jl."order";
