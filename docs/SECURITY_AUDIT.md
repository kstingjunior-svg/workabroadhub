# Security Audit Report - WorkAbroad Hub

**Date:** February 17, 2026  
**Scope:** Full-stack security review of authentication, payments, API endpoints, admin access, data handling, and infrastructure

---

## Executive Summary

WorkAbroad Hub has a strong security foundation with layered defenses including Helmet.js CSP, CORS restrictions, multiple rate limiters, input validation, sensitive data redaction, and atomic payment processing. This audit identified and remediated **4 critical/high vulnerabilities** and documents the existing security posture across all major attack surfaces.

---

## 1. Vulnerabilities Found & Remediated

### CRITICAL: Unauthenticated Payment Status Endpoint (IDOR)
- **Location:** `GET /api/payment-status` (server/routes.ts)
- **Risk:** Any unauthenticated user could query payment status and M-Pesa receipt numbers by phone number, enabling information disclosure and potential social engineering
- **Fix:** Added `isAuthenticated` middleware; removed phone parameter entirely and replaced with userId-based payment lookup; removed receipt number from response. The endpoint now only returns the authenticated user's own payment status, completely eliminating enumeration risk.
- **Status:** FIXED

### HIGH: Unauthenticated M-Pesa STK Push
- **Location:** `POST /api/mpesa/stkpush` (server/routes.ts)
- **Risk:** Anyone could trigger STK push payment prompts to arbitrary phone numbers without being logged in, enabling harassment and potential abuse
- **Fix:** Added `isAuthenticated` middleware; added phone number format validation (Kenyan format regex); added userId extraction for audit trail
- **Status:** FIXED

### HIGH: Exposed System Metrics Endpoint
- **Location:** `GET /api/metrics` (server/routes.ts)
- **Risk:** Unauthenticated access to heap memory stats, database pool configuration, cache stats, queue stats, and circuit breaker states - valuable reconnaissance data for attackers
- **Fix:** Added `isAuthenticated` and `isAdmin` middleware
- **Status:** FIXED

### MEDIUM: Unrate-limited Analytics Endpoints
- **Location:** `POST /api/analytics/event`, `POST /api/analytics/conversion` (server/routes.ts)
- **Risk:** Public analytics endpoints without dedicated rate limiting could be abused for database flooding or denial of service
- **Fix:** Added dedicated `analyticsLimiter` (30 requests/minute per IP); added field length validation to prevent oversized payloads
- **Status:** FIXED

---

## 2. Authentication & Session Management

### Strengths
- **Replit Auth (OIDC):** Industry-standard OpenID Connect with proper token refresh flow
- **Session Security:** PostgreSQL-backed sessions via `connect-pg-simple`; `httpOnly`, `secure`, `sameSite: lax` cookies; 7-day TTL
- **Token Refresh:** Automatic access token refresh with expiry checking before each authenticated request
- **Trust Proxy:** Properly configured for reverse proxy environment (`app.set("trust proxy", 1)`)

### Observations
- Session secret is stored in environment secrets (good)
- `saveUninitialized: false` prevents empty session creation (good)
- `resave: false` prevents race conditions on concurrent requests (good)

---

## 3. Authorization & Access Control

### Strengths
- **Layered Admin Middleware:** Four distinct middleware functions (`isAdmin`, `requireAdmin`, `requireAdminAuth`, `requireRole`) providing defense in depth
- **Role-Based Access:** Support for `ADMIN`, `SUPER_ADMIN`, and custom roles via `requireRole()`
- **User Activity Checks:** `requireAdminAuth` and `requireRole` verify `user.isActive` before granting access
- **IDOR Protection on Payments:** `GET /api/payments/:id/status` properly scopes queries to authenticated user's payments only

### All Admin Routes Verified Protected
All `/api/admin/*` endpoints use `isAuthenticated` + `isAdmin` middleware stack.

---

## 4. Payment Processing Security

### Strengths
- **Atomic Processing:** `withTransaction()` wrapper ensures payment updates, subscription creation, and referral processing happen atomically or not at all
- **Webhook Idempotency:** `acquireWebhookLock()` uses PostgreSQL `INSERT ON CONFLICT DO UPDATE WHERE expires_at < NOW() RETURNING` for database-level mutual exclusion
- **In-Memory Deduplication:** Fast `Map`-based cache prevents redundant database queries for already-processed callbacks
- **Amount Verification:** Fixed amount validation (`KES 4,500`) on M-Pesa callbacks prevents underpayment attacks
- **Safaricom IP Verification:** Callback source IP checked against known Safaricom ranges in production
- **Failed Attempt Tracking:** Both phone and IP-based lockout for failed payment attempts
- **Receipt Matching:** Payments matched by `CheckoutRequestID` rather than phone number, preventing cross-user attribution

### Observations
- Lock cleanup runs every 5 minutes (good)
- Processed callback cache entries expire after 1 hour (good)
- Orphan transactions are stored for audit purposes (good)
- Commission rate is hardcoded at 10% (KES 450) - consider making configurable via admin panel

---

## 5. API Security

### Rate Limiting (6 Layers)
| Endpoint | Window | Max Requests | Purpose |
|----------|--------|-------------|---------|
| `/api/*` (global) | 15 min | 100/IP | General API protection |
| `/api/auth/*` | 15 min | 20/IP | Brute force prevention |
| `/api/payments/*` | 1 hour | 10/IP | Payment abuse prevention |
| `/api/referrals/*` | 1 hour | 5/IP | Referral fraud prevention |
| `/api/mpesa/callback` | 1 min | 30/IP | Replay attack prevention |
| `/api/analytics/*` | 1 min | 30/IP | Database flood prevention (NEW) |

### Input Validation
- **Zod Schemas:** Request bodies validated via `drizzle-zod` generated schemas
- **XSS Detection:** Dangerous HTML patterns (`<script>`, `javascript:`, `onerror`, `<iframe>`, etc.) detected and blocked
- **Smart Filtering:** URL fields (`url`, `profileImageUrl`, etc.) exempted from XSS checks to avoid false positives
- **Admin Route Exemption:** Admin routes skip XSS filtering (admins are trusted users)
- **Body Size Limits:** 100KB standard, 1MB for M-Pesa webhooks

### HTTP Security Headers (Helmet.js)
- Content-Security-Policy with restrictive directives
- HSTS with 1-year max-age, includeSubDomains, preload
- X-Content-Type-Options: nosniff
- X-XSS-Protection enabled
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy restricts camera, microphone access
- Frame-Ancestors: self (clickjacking protection)

### CORS
- Strict origin checking against `REPLIT_DOMAINS` and `replit.com`
- URL parsing for origin validation (prevents bypass via malformed origins)
- Localhost allowed only in development mode
- Credentials enabled with specific allowed methods and headers

---

## 6. Data Protection

### Sensitive Data Redaction
- Phone numbers, emails, passwords, tokens, secrets, M-Pesa receipts, transaction refs, and checkout IDs are all redacted from logs
- Kenyan phone number pattern (`2547XXXXXXXX`) specifically matched and redacted
- Redaction preserves JSON structure (key visible, value replaced with `[REDACTED]`)

### Account Deletion (GDPR/Google Play Compliance)
- `DELETE /api/account` properly authenticated
- Requires explicit `confirmDelete: true` confirmation
- Session destroyed after deletion
- Storage layer handles cascading data removal

---

## 7. File Upload & Document Security

### Assessment
- **No direct file uploads exist** - the application uses URL references only
- Deliverable uploads use `fileUrl` (URL string) rather than binary file data
- This eliminates entire classes of vulnerabilities: path traversal, malicious file execution, storage exhaustion

---

## 8. Infrastructure Security

### Database
- PostgreSQL with Drizzle ORM (parameterized queries prevent SQL injection)
- Database pool monitoring with 50-connection limit
- Transaction retry logic with exponential backoff for deadlocks

### Error Handling
- Generic error messages returned to clients (prevents information leakage)
- Detailed errors logged server-side only
- M-Pesa callbacks always return `ResultCode: 0` to prevent retry loops from revealing processing state

### Circuit Breakers
- M-Pesa STK Push and B2C endpoints protected by circuit breakers
- Prevents cascading failures when Safaricom API is unavailable
- Circuit state visible only to admins (now properly protected)

---

## 9. Remaining Recommendations

### Low Priority Items
1. **Abuse Report Endpoint** (`POST /api/reports/abuse`): Currently unauthenticated by design (allows anonymous reporting). Consider adding CAPTCHA or honeypot fields to prevent automated spam.
2. **Agency Click Tracking** (`POST /api/agency-clicks`): Public endpoint - low risk since it only increments counters, but could be used for click inflation.
3. **VAPID Key Endpoint** (`GET /api/push/vapid-key`): Public by design (needed for push notification subscription). The key is meant to be public.
4. **Student Visa Endpoints**: Public read-only endpoints - appropriate for SEO and unauthenticated browsing.

### Future Enhancements
1. Consider implementing Content-Security-Policy nonces instead of `unsafe-inline` for scripts in production
2. Add request signing for M-Pesa STK Push responses (currently relies on IP verification)
3. Implement account lockout notification via SMS/WhatsApp when failed payment attempts exceed threshold
4. Add audit logging for admin actions (user status changes, payment modifications)

---

## 10. Public Endpoints (Intentionally Unauthenticated)

These endpoints are correctly left unauthenticated for legitimate business reasons:

| Endpoint | Justification |
|----------|--------------|
| `GET /api/health/*` | Infrastructure monitoring |
| `GET /api/countries` | Landing page content |
| `GET /api/services` | Public service listing |
| `GET /api/job-counts` | Public statistics |
| `GET /api/nea-agencies` | Public agency directory |
| `GET /api/featured-agencies` | Public showcase |
| `GET /api/agency-profiles/:id` | Public profiles |
| `GET /api/add-on-pricing` | Public pricing |
| `GET /api/student-visas/:code` | Public visa info |
| `GET /api/application-packs` | Public pack listing |
| `GET /api/advisors` | Public advisor profiles |
| `GET /api/success-stories` | Public testimonials |
| `POST /api/reports/abuse` | Anonymous abuse reporting |
| `POST /api/analytics/*` | Anonymous event tracking |

---

## Summary of Changes Made

| Change | File | Impact |
|--------|------|--------|
| Rewrote `/api/payment-status` with auth + userId-based lookup | server/routes.ts | Eliminates IDOR: users can only see own payment status |
| Added `isAuthenticated` to `/api/mpesa/stkpush` | server/routes.ts | Prevents unauthenticated payment triggering |
| Added phone validation to stkpush | server/routes.ts | Input validation for Kenyan numbers |
| Added `isAuthenticated` + `isAdmin` to `/api/metrics` | server/routes.ts | Protects system internals |
| Added analytics rate limiter (30/min/IP) | server/routes.ts | Prevents database flooding |
| Added analytics field length validation | server/routes.ts | Prevents oversized payloads |
