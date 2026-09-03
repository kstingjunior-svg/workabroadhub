# CV AI pipeline

Six-pass CV builder and revamp engine. Each pass is a separate module so
failures are debuggable and A/B-testable in isolation.

## Passes at a glance

| # | Pass | Model | File | Cost |
|---|------|-------|------|------|
| 1 | Extractor | `gpt-4o-mini` | `pass1-extractor.ts` | ~$0.001 |
| 2 | Enricher | `gpt-4o` | `pass2-enricher.ts` | ~$0.02-0.04 |
| 3 | Style + JD spec | code + `gpt-4o-mini` | *(not built yet)* | ~$0.005 |
| 4 | Composer | **Claude Sonnet** (fallback `gpt-4o`) | `pass4-composer.ts` | ~$0.06-0.10 |
| 5 | ATS-safety linter | pure code (no LLM) | *(not built yet)* | $0 |
| 6 | Score gate | code + retry into Pass 4 | `pass6-score-gate.ts` | 0-2× Composer |
| — | ATS Scorer adapter | `gpt-4o` (same engine as `/tools/ats-cv-checker`) | `ats-scorer.ts` | ~$0.03-0.06 per call |

**Happy path total:** ~$0.12–0.18 per CV.
**Hard-case retries:** up to ~$0.35.

## Trust contract

Enforced by Pass 6: the rewritten CV must beat the input's ATS score by
`MIN_LIFT = 15` points on the same engine (`/tools/ats-cv-checker`). If it
doesn't after `MAX_RETRIES = 3`, we return the best attempt with an honest
"already strong CV" banner and offer the expert-review upsell — never a
faked score.

## Env vars

- `OPENAI_API_KEY` — required. Used by Extractor and as Composer fallback.
- `ANTHROPIC_API_KEY` — optional. When set, Composer uses Claude Sonnet
  for measurably better prose quality. When absent, Composer falls back
  to `gpt-4o` transparently — no crash, just slightly worse voice.

## Framework-agnostic

These modules only take + return typed values. They call OpenAI /
Anthropic SDKs. They know nothing about Express, Next.js, or any HTTP
layer. Wire them into:

- Current WorkAbroadHub Express route: `app.post("/api/cv/generate", ...)`
  → import from `server/lib/cv-ai/*`
- Next.js migration: `app/api/cv/generate/route.ts` → same imports, path
  adjusted

The pipeline is deliberately not `default export` anything — the
orchestrator you write on top can decide which passes to skip (e.g.
regenerating with a saved fact JSON skips Pass 1).

## What's still needed to ship

1. ~~**Pass 2 Enricher**~~ — DONE (`pass2-enricher.ts`). Produces up to 3 confidence-graded rewrites per achievement + `clarifyingQuestions[]` for missing quant. Concurrency-bounded so senior CVs don't fire 40+ parallel OpenAI calls. Composer's rules already respect the confidence levels — no Composer change needed.
2. **Pass 3 Style + JD parser** — deterministic style-hash + JD analyzer. (Orchestrator currently picks voice/structure from a small heuristic — see `orchestrator.ts` `inferSeniority`.)
3. **Pass 5 ATS-safety linter** — enforces standard section names, no tables/columns, safe date formats. Non-LLM, straightforward but requires the CV markdown parser.
4. ~~**`AtsScorer` adapter**~~ — DONE.
5. ~~**Orchestrator + HTTP route**~~ — DONE. `POST /api/cv-ai/generate` is live and callable.
6. **Postgres additions** — `cv_generations` table + `cv_banned_phrases` per-industry table + `cv_style_variants` permutation table + `embedding vector(1536)` column and pgvector similarity gate.
7. **`@anthropic-ai/sdk`** — `npm install @anthropic-ai/sdk` needed before Composer's Anthropic path works (it currently no-ops back to OpenAI if the SDK is missing at runtime, so nothing breaks in the interim).
8. **`tools-routes.ts` refactor** — the free `/api/tools/ats-check` endpoint has its own inline OpenAI call that duplicates `ats-scorer.ts`. Both currently use the same `ATS_ANALYSIS_ENGINE` prompt so scores are identical. Refactor the endpoint to call `scoreCv()` too, so there's literally one code path — then version drift can't happen.
9. **Client UI** — the endpoint is server-only. A React page to drive it (upload / paste / paste JD / show result + score delta) is next.

## The endpoint

`POST /api/cv-ai/generate` — see `server/routes/cv-ai.ts`.

Request (multipart):
- `cv` (file, PDF or DOCX) OR `cvText` (string in JSON body)
- `jobDescription` (optional, ≥40 chars to trigger JD-tailoring)
- `region` (optional, one of KE / UK / CA / AU / UAE / US / EU; default KE)
- `industry` (optional, free-form; default "general")

Response:
```json
{
  "ok": true,
  "hitTarget": true,
  "improvement": 22,
  "inputScore": 61,
  "outputScore": 83,
  "retries": 0,
  "cvMarkdown": "# Jane Doe\n\n## Summary\n...",
  "elapsedMs": 18420,
  "message": "Your CV is stronger by 22 ATS points."
}
```

If the score gate can't hit +15 after retries, `hitTarget=false` and the
message becomes "Your original CV was already strong — try our expert
review" — never a fake number.

## Order of implementation

Do Extractor + Composer + Score-gate + AtsScorer adapter FIRST — that's
the minimum viable trust guarantee. Ship it with a stub StyleSpec and no
Enricher. Get 20 real CVs through it. Every optimization after that
(Enricher, similarity gate, style permutations, JD extractor) is a
percentage-point gain — the truth-in / measure-out loop is where the
trust actually comes from.
