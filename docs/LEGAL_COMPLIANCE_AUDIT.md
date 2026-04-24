# WorkAbroad Hub - Kenya Legal & Compliance Audit

**Audit Date:** February 2026  
**Platform:** WorkAbroad Hub (workabroadhub.tech)  
**Jurisdiction:** Republic of Kenya  
**Auditor:** Pre-Launch Compliance Review  

---

## STEP 1: BUSINESS & REGULATORY CLASSIFICATION

### Classification: Digital Service Platform Using External Payments

| Item | Assessment | Status |
|------|-----------|--------|
| Payment Service Provider (PSP)? | NO - App does not hold, transmit, or manage user funds. Payments are processed entirely through Safaricom M-Pesa. | PASS |
| Marketplace / Aggregator? | NO - App does not facilitate transactions between buyers and sellers. It provides career consultation services. | PASS |
| Digital Service Platform? | YES - Platform charges a consultation fee (KES 4,500) for professional career advisory services delivered via WhatsApp. | PASS |
| CBK Licensing Required? | NO - App does not hold customer deposits, issue e-money, or operate as a payment service provider. M-Pesa handles all payment processing. | PASS |
| Recruitment Agency? | NO - Explicitly disclaimed in Terms of Service. App provides consultation and links to third-party job portals only. | PASS |

### Regulatory Gray Areas
- **NEA Compliance:** The platform lists NEA-licensed agencies for verification purposes. This is informational, not operational, and does not require an NEA license.
- **Career Consultation vs. Recruitment:** The framing as "career consultation" rather than recruitment is legally sound. The platform does not match candidates with employers or submit applications on their behalf (except in Assisted Apply, where users still submit themselves).

### Verdict: No CBK licensing required. Platform operates as a digital service provider.

---

## STEP 2: M-PESA & SAFARICOM COMPLIANCE

| Item | Assessment | Status |
|------|-----------|--------|
| Daraja API Terms compliance | YES - Using standard STK Push (Lipa Na M-Pesa Online) via official Daraja API | PASS |
| Paybill/Till usage | Requires production Paybill/Till number from Safaricom (currently using sandbox shortcode 174379) | ACTION REQUIRED |
| Does NOT hold user funds | PASS - Funds go directly to Safaricom M-Pesa Paybill. No wallet or escrow functionality. | PASS |
| Does NOT misrepresent as bank/wallet | PASS - No language suggesting banking, wallet, or fund storage services. | PASS |
| M-Pesa branding usage | PASS - "M-Pesa" is used descriptively to identify the payment method. No unauthorized use of Safaricom logos. | PASS |
| Payment amount transparency | PASS - KES 4,500 is clearly displayed before payment initiation. | PASS |
| Callback URL security | PASS - Uses HTTPS callback with transaction verification and idempotency checks. | PASS |
| Payment confirmation | PASS - Webhook verification of M-Pesa callback results before crediting user account. | PASS |

### Action Required
- Obtain production M-Pesa API credentials (Consumer Key, Consumer Secret, Paybill Shortcode, Passkey) from developer.safaricom.co.ke
- Register production callback URL: https://workabroadhub.tech/api/mpesa/callback

---

## STEP 3: DATA PROTECTION & PRIVACY (Kenya Data Protection Act, 2019)

### 3.1 Lawful Basis for Data Collection

| Data Type | Lawful Basis | Disclosed in Privacy Policy | Status |
|-----------|-------------|---------------------------|--------|
| Phone numbers | Contractual necessity (M-Pesa payment + WhatsApp consultation) | YES - Section 1 | PASS |
| Payment data | Contractual necessity + Legal obligation (7-year tax retention) | YES - Sections 1, 5 | PASS |
| User profiles (name, email) | Contractual necessity (service delivery) | YES - Section 1 | PASS |
| Usage analytics | Legitimate interest (service improvement) | YES - Section 2 | PASS |
| Career profile data | Contractual necessity (AI career matching) | YES - Section 1 | PASS |
| Communication logs | Legitimate interest (quality assurance) | YES - Section 5 | PASS |

### 3.2 Legal Documents

| Document | Exists | Accessible | Status |
|----------|--------|-----------|--------|
| Privacy Policy | YES - /privacy-policy | YES - Linked from landing page, payment page | PASS |
| Terms of Service | YES - /terms-of-service | YES - Linked from landing page, payment page | PASS |
| Refund Policy | YES - /refund-policy | YES - Linked from payment page | PASS |
| Referral Terms | YES - /referral-terms | YES - Linked from referrals page | PASS |

### 3.3 User Consent Mechanisms

| Mechanism | Implementation | Status |
|-----------|---------------|--------|
| Age verification gate | YES - Mandatory 18+ confirmation before site access | PASS |
| Payment consent checkbox | YES - Must agree to Terms, Privacy Policy, and Refund Policy before payment | PASS |
| Terms acknowledgment | YES - Checkbox with links to all policies before payment | PASS |
| Data minimization | YES - Only collects data necessary for service delivery | PASS |

### 3.4 Data Security

| Measure | Implementation | Status |
|---------|---------------|--------|
| HTTPS/TLS encryption | YES - Enforced via Replit deployment | PASS |
| Helmet.js security headers | YES - CSP, X-Frame-Options, HSTS, XSS filter | PASS |
| Session security | YES - PostgreSQL-backed sessions, httpOnly cookies | PASS |
| Rate limiting | YES - General + endpoint-specific rate limits | PASS |
| Input validation | YES - Zod schemas for all API inputs | PASS |
| SQL injection protection | YES - Drizzle ORM parameterized queries | PASS |
| Access controls | YES - Authentication middleware, admin role verification | PASS |
| XSS prevention | YES - Helmet XSS filter, React auto-escaping | PASS |

### 3.5 Compliance Gaps (Fixed)

| Gap | Fix Applied | Status |
|-----|------------|--------|
| Privacy Policy lacks explicit DPA 2019 reference | Added explicit Kenya Data Protection Act, 2019 reference | FIXED |
| No Data Controller disclosure | Added Data Controller identity and contact | FIXED |
| No ODPC registration mention | Added ODPC registration obligation notice | FIXED |
| No data breach notification plan | Added breach notification commitment (72 hours) | FIXED |
| No cookie consent banner | Added data collection consent mechanism | FIXED |

---

## STEP 4: ODPC & DATA CONTROLLER OBLIGATIONS

| Item | Assessment | Status |
|------|-----------|--------|
| Data Controller classification | YES - WorkAbroad Hub determines purposes and means of data processing | PASS |
| Data Processor relationships | YES - Disclosed: Safaricom (payments), Twilio (communications), OpenAI (AI processing) | PASS |
| ODPC Registration | REQUIRED before launch - Must register as Data Controller with ODPC Kenya | ACTION REQUIRED |
| Data breach response plan | YES - 72-hour notification commitment added to Privacy Policy | PASS |
| Data Processing Agreements | REQUIRED - Should have DPAs with Twilio, OpenAI | POST-LAUNCH |
| Cross-border data transfer | DISCLOSED - OpenAI and Twilio process data outside Kenya. Privacy Policy discloses this. | PASS |

### Mandatory Pre-Launch Action
- Register with the Office of the Data Protection Commissioner (ODPC) as a Data Controller: https://www.odpc.go.ke/

---

## STEP 5: CONSUMER PROTECTION & FAIR PRACTICE

| Item | Assessment | Status |
|------|-----------|--------|
| Transparent pricing | YES - KES 4,500 clearly stated before payment | PASS |
| Price disclosed before payment | YES - Amount shown on payment page with breakdown | PASS |
| Refund policy exists | YES - 7-day refund window if no consultation initiated | PASS |
| Dispute resolution mechanism | YES - Email support + WhatsApp contact | PASS |
| No misleading claims | YES - Explicit disclaimers: "does not sell jobs," "does not guarantee employment" | PASS |
| Customer support accessible | YES - Email: support@workabroadhub.tech, WhatsApp available | PASS |
| No guarantee of employment | YES - Prominently disclaimed in Terms, Landing Page, Payment Page | PASS |
| Service description accurate | YES - Clearly describes consultation service, resource access, and limitations | PASS |
| Abuse reporting | YES - In-app report abuse form + email/WhatsApp channels | PASS |

---

## STEP 6: AML, FRAUD & MISREPRESENTATION RISK

| Item | Assessment | Status |
|------|-----------|--------|
| Does NOT facilitate money laundering | PASS - Single fixed fee, no fund transfers between users | PASS |
| Does NOT hold funds as intermediary | PASS - All payments go directly to M-Pesa Paybill | PASS |
| No anonymous high-risk transactions | PASS - Users must authenticate before payment, phone number captured | PASS |
| Fraud prevention measures | YES - Rate limiting, IDOR protection, payment amount validation, circuit breakers | PASS |
| Transaction records auditable | YES - All payments logged with timestamps, amounts, M-Pesa transaction IDs, user IDs | PASS |
| Referral fraud prevention | YES - Self-referral blocked, duplicate prevention, admin verification for commissions | PASS |
| Payment amount validation | YES - Server-side enforcement of KES 4,500 fixed amount | PASS |
| Double-credit prevention | YES - Atomic payment processing with DB-level locks | PASS |

---

## STEP 7: CYBERSECURITY & LEGAL LIABILITY (Computer Misuse & Cybercrimes Act)

| Item | Assessment | Status |
|------|-----------|--------|
| Reasonable cybersecurity safeguards | YES - See Security Audit (docs/SECURITY_AUDIT.md) | PASS |
| HTTPS enforcement | YES - TLS encryption on all connections | PASS |
| Authentication security | YES - Replit Auth (OAuth-based), session management | PASS |
| Rate limiting | YES - General + per-endpoint rate limiting | PASS |
| Admin access controls | YES - Role-based admin middleware | PASS |
| Input validation/sanitization | YES - Zod schemas, parameterized queries | PASS |
| Security headers | YES - Helmet.js with comprehensive CSP | PASS |
| User liability clauses | YES - Terms of Service Section 10 (Limitation of Liability) | PASS |
| Account termination rights | YES - Terms of Service Section 14 | PASS |
| User conduct policy | YES - Terms of Service Section 11 | PASS |
| Content moderation policy | YES - Terms of Service Section 12 | PASS |

---

## STEP 8: TERMS, DISCLAIMERS & LEGAL TEXT

| Item | Assessment | Status |
|------|-----------|--------|
| Limitation of liability | YES - Section 10 of Terms | PASS |
| Jurisdiction: Kenya | YES - Section 16: "governed by the laws of the Republic of Kenya" | PASS |
| Dispute resolution clause | YES - "disputes shall be resolved in the courts of Kenya" | PASS |
| No illegal/unenforceable clauses | PASS - All clauses are standard and enforceable under Kenyan law | PASS |
| Age restriction (18+) | YES - Section 2 of Terms + Age Verification Gate | PASS |
| Payment method disclosure | YES - Section 5 explicitly states M-Pesa, not Google Play | PASS |
| Third-party disclaimer | YES - Section 6 disclaims responsibility for external sites | PASS |
| Service vs. employment disclaimer | YES - Prominent "Important Legal Notice" banner | PASS |
| Account termination provisions | YES - Section 14 | PASS |
| Modification clause | YES - Section 15 | PASS |
| Contact information | YES - Section 17 | PASS |
| User conduct policy | YES - Section 11 | PASS |
| Content moderation | YES - Section 12 | PASS |
| Abuse reporting | YES - Section 13 | PASS |

---

## STEP 9: LAUNCH RISK ASSESSMENT

### CRITICAL BLOCKERS (Must fix before launch)

| # | Issue | Risk Level | Action Required |
|---|-------|-----------|----------------|
| 1 | M-Pesa production credentials not configured | CRITICAL | Obtain production API credentials from developer.safaricom.co.ke |
| 2 | ODPC Registration not completed | HIGH | Register as Data Controller with ODPC Kenya before processing personal data |

### MEDIUM-RISK GAPS (Should address within 30 days of launch)

| # | Issue | Risk Level | Action Required |
|---|-------|-----------|----------------|
| 3 | Data Processing Agreements with third parties | MEDIUM | Execute DPAs with Twilio and OpenAI for cross-border data processing |
| 4 | Support email domain mismatch | LOW-MEDIUM | Update support@workabroadhub.tech to match actual operational domain |

### LOW-RISK IMPROVEMENTS (Post-launch)

| # | Issue | Risk Level | Action Required |
|---|-------|-----------|----------------|
| 5 | Physical business address not disclosed | LOW | Add registered business address to Terms/Privacy Policy |
| 6 | KRA tax compliance documentation | LOW | Ensure proper invoicing/receipting for KES 4,500 fee |
| 7 | Insurance/professional indemnity | LOW | Consider professional indemnity insurance for advisory services |

---

## COMPLIANCE PASS/FAIL TABLE

| Category | Result |
|----------|--------|
| Business Classification & CBK | PASS |
| M-Pesa & Safaricom Compliance | CONDITIONAL (production credentials needed) |
| Data Protection Act, 2019 | PASS (with fixes applied) |
| ODPC Registration | ACTION REQUIRED |
| Consumer Protection | PASS |
| AML & Fraud Prevention | PASS |
| Cybersecurity | PASS |
| Legal Documents | PASS |

---

## MANDATORY ACTIONS BEFORE LAUNCH

1. **Obtain M-Pesa production credentials** from developer.safaricom.co.ke (Consumer Key, Secret, Paybill/Till, Passkey)
2. **Register with ODPC Kenya** as a Data Controller at https://www.odpc.go.ke/
3. **Verify callback URL** (https://workabroadhub.tech/api/mpesa/callback) is accessible and SSL-secured

## POST-LAUNCH COMPLIANCE TASKS

1. Execute Data Processing Agreements (DPAs) with Twilio and OpenAI
2. Set up operational support email (support@workabroadhub.tech or support@workabroadhub.tech)
3. Add physical/registered business address to legal pages
4. Ensure KRA tax compliance (receipting, returns)
5. Conduct periodic security audits (quarterly recommended)
6. Review and update legal documents annually
7. Consider professional indemnity insurance
8. Monitor Safaricom Daraja API terms for changes

---

## FINAL COMPLIANCE VERDICT

## LAUNCH WITH CONDITIONS

The platform is technically sound and legally well-structured for a Kenyan digital service platform. All major legal documents exist and are comprehensive. Security measures are robust. Consumer protection clauses are adequate.

**Conditions for launch:**
1. Production M-Pesa credentials must be configured and tested
2. ODPC registration should be initiated (can operate while application is pending, but must be filed)

**Risk Level:** LOW - The platform does not hold user funds, does not operate as a recruitment agency, and has comprehensive disclaimers and security measures in place.

---

*This audit is based on publicly available regulations and does not constitute formal legal advice. For final verification, consult a licensed Kenyan advocate specializing in fintech/data protection law.*
