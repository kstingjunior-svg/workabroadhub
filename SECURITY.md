# WorkAbroad Hub - Security Documentation

## Security Measures Implemented

### 1. Authentication & Authorization

**Replit Auth (OAuth 2.0)**
- Secure third-party authentication via Replit's OIDC provider
- No passwords stored in our database
- Token-based session management with automatic refresh

**Session Security**
- Sessions stored in PostgreSQL (not in memory)
- HttpOnly cookies (prevents XSS access to session)
- Secure flag enabled (HTTPS only)
- SameSite=Lax (CSRF protection)
- 7-day session expiry with automatic renewal

**Role-Based Access Control**
- User roles: USER, ADMIN, SUPER_ADMIN
- Admin middleware protects all admin endpoints
- Payment verification middleware for premium content

### 2. HTTP Security Headers (Helmet.js)

- **Content-Security-Policy**: Restricts resource loading sources
- **X-Content-Type-Options**: Prevents MIME type sniffing
- **X-Frame-Options**: Clickjacking protection
- **X-XSS-Protection**: XSS filter enabled
- **Strict-Transport-Security**: HTTPS enforcement
- **Referrer-Policy**: Controls referrer information

### 3. Rate Limiting

**API Endpoints**
- 100 requests per 15 minutes per IP
- Prevents brute force and DoS attacks

**Authentication Endpoints**
- 20 requests per 15 minutes per IP
- Stricter limit for login/logout operations

**Payment Endpoints**
- 10 requests per hour per IP
- Prevents payment fraud attempts

**Referral Endpoints**
- 5 requests per hour per IP
- Prevents referral fraud attempts

**M-Pesa Callbacks**
- 30 requests per minute per IP
- Prevents replay attacks

### 3.1 Account Lockout

**Failed Payment Attempts**
- 5 failed attempts triggers 30-minute lockout
- Tracked by IP address and phone number
- Auto-reset on successful payment

### 3.2 Request Body Size Limits

- Standard API requests: 100KB
- M-Pesa webhook callbacks: 1MB
- Prevents large payload attacks

### 4. Database Security

**SQL Injection Protection**
- Drizzle ORM with parameterized queries
- No raw SQL with user input

**Data Validation**
- Zod schema validation on all inputs
- Type-safe database operations
- Input sanitization before storage

**Sensitive Data**
- No plaintext passwords (OAuth-based auth)
- Payment details not stored (simulated payments)
- Transaction references only stored

**SSL/TLS Connection**
- Production: SSL with certificate verification enabled
- Development: SSL without strict verification for cloud DBs
- Local: No SSL for localhost connections

**Connection Pool Security**
- Maximum 20 connections
- Idle timeout: 30 seconds
- Connection timeout: 10 seconds
- Pool error handling to prevent crashes

### 5. Environment Security

**Secrets Management**
- SESSION_SECRET stored as Replit secret
- DATABASE_URL managed by Replit
- No secrets in code or version control

**Admin Access**
- ADMIN_EMAILS environment variable for production
- First-user admin promotion for development only

### 6. Frontend Security

**XSS Prevention**
- React's built-in XSS protection
- No dangerouslySetInnerHTML usage
- URL encoding for WhatsApp messages

**CSRF Protection**
- SameSite cookie attribute
- Origin validation on requests

### 6.1 CORS Configuration

**Origin Restrictions**
- Only allows requests from Replit domains
- Credentials enabled for authenticated requests
- Methods restricted: GET, POST, PUT, PATCH, DELETE
- Preflight cache: 24 hours

### 6.2 Sensitive Data Redaction in Logs

**Redacted Fields**
- Phone numbers (including Kenyan 2547XXXXXXXX)
- Email addresses
- Passwords and tokens
- M-Pesa receipt numbers
- Transaction references
- CheckoutRequestID / MerchantRequestID

### 7. Webhook Security

**M-Pesa Callback Security**

*IP Verification*
- Safaricom IP allowlist (196.201.214.x, 196.201.212.x, etc.)
- Suspicious IPs logged but not processed in production

*Payload Validation*
- Early structure validation
- Amount verification (must match KES 4,500)
- CheckoutRequestID correlation with pending payments

*Idempotency*
- Webhook processing locks prevent duplicate processing
- Lock acquired before processing, released on completion
- Stale locks auto-cleanup (5-minute TTL)
- Duplicate callbacks return success without reprocessing

### 8. What We DON'T Store

- User passwords (OAuth authentication)
- Credit card numbers (simulated payments)
- M-Pesa PINs (external processing)
- Personal documents

---

## Security Checklist for Production

### Before Going Live

- [ ] Set `ADMIN_EMAILS` environment variable
- [ ] Verify `SESSION_SECRET` is a strong random string
- [ ] Enable HTTPS (automatic on Replit)
- [ ] Review rate limiting settings
- [ ] Test authentication flow

### Regular Maintenance

- [ ] Monitor rate limit hits in logs
- [ ] Review admin activity logs
- [ ] Check for failed login attempts
- [ ] Update dependencies for security patches

---

## Reporting Security Issues

If you discover a security vulnerability, please:
1. Do NOT create a public issue
2. Contact the development team privately
3. Provide details about the vulnerability
4. Allow time for a fix before disclosure

---

## Compliance Notes

### Data Protection
- Minimal data collection policy
- User data not sold to third parties
- Users can request account deletion

### Payment Security
- Payments are currently simulated
- For real payments, integrate with certified PSPs
- M-Pesa integration should use official API

### NEA Disclaimer
- Platform not affiliated with NEA
- Agency data for reference only
- Users advised to verify independently
