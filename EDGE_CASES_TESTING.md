# Edge Cases Testing Documentation

## WorkAbroad Hub - System Stress Test Scenarios

### 1. Authentication Edge Cases

| Scenario | Expected Behavior | Test Method |
|----------|------------------|-------------|
| Session expiry during payment | Redirect to login, preserve payment intent | Test with short session timeout |
| Multiple tabs logged in | All tabs reflect same state | Open 3+ tabs, perform actions |
| Logout during order processing | Order continues, notification sent | Trigger logout mid-AI-processing |
| Invalid JWT token | Graceful redirect to login | Manually corrupt session cookie |

### 2. Payment Processing Edge Cases

| Scenario | Expected Behavior | Risk Level |
|----------|------------------|------------|
| M-Pesa timeout (>30s) | Show "Payment pending, retry or contact support" | HIGH |
| Duplicate payment submission | Prevent double-charge, show existing payment | CRITICAL |
| Payment success but DB write fails | Log for manual reconciliation, notify admin | HIGH |
| Partial payment (if applicable) | Block access, show amount due | MEDIUM |
| Payment from blocked phone | Return clear error message | MEDIUM |
| Network disconnect during payment | Resume on reconnection | HIGH |

**Mitigation Implemented:**
- Idempotency keys on payment endpoints
- Payment polling with 30-second timeout
- Transaction status logging
- Admin payment dashboard for reconciliation

### 3. AI Order Processing Edge Cases

| Scenario | Detection | Action |
|----------|-----------|--------|
| Empty intake form submitted | Validation fails at API | 400 Bad Request |
| AI returns empty content | Caught in processOrderWithAI | Flag for human review |
| AI timeout (>60s) | Promise timeout | Queue for retry, notify admin |
| Hallucinated content | Pattern detection + AI check | FLAGGED_FOR_REVIEW status |
| Content exceeds 4 pages | estimatedPages check | FLAGGED_FOR_REVIEW |
| Language quality < 75% | languageQuality score | FLAGGED_FOR_REVIEW |
| API rate limit hit | OpenAI error handling | Queue for delayed retry |
| Invalid JSON from quality check | try/catch parsing | Default to human review |

**Quality Thresholds:**
- Auto-approval: Score >= 75, no fail conditions
- Hallucination patterns: 8 categories monitored
- Experience mismatch: Senior titles vs years check

### 4. Agency Portal Edge Cases

| Scenario | Expected Behavior | Priority |
|----------|------------------|----------|
| Claim already-claimed agency | 400 error, clear message | HIGH |
| User claims 2nd agency | 400 error, enforce one-per-user | HIGH |
| Purchase package without claim | 400 error, redirect to claim | MEDIUM |
| View analytics without add-on | 403 error, upsell message | MEDIUM |
| Agency license expires | Status update, notification | MEDIUM |
| Concurrent claim attempts | First succeeds, second fails | HIGH |

### 5. NEA Agencies Edge Cases

| Scenario | Expected Behavior | Verified |
|----------|------------------|----------|
| Duplicate license import | Skip/update existing | YES |
| Invalid date format | Parse with fallback | YES |
| Missing required fields | Reject row, log error | YES |
| 1000+ agencies bulk upload | Batch processing, progress | YES |
| Unicode in agency names | UTF-8 handling | YES |
| Empty CSV upload | Clear error message | NO - needs test |

### 6. Rate Limiting Verification

| Endpoint | Limit | Window | Status |
|----------|-------|--------|--------|
| API general | 100 req | 15 min | ACTIVE |
| Auth endpoints | 20 req | 15 min | ACTIVE |
| Payment endpoints | 10 req | 60 min | ACTIVE |
| AI processing | 5 req | 5 min | RECOMMENDED |

### 7. Database Edge Cases

| Scenario | Risk | Mitigation |
|----------|------|------------|
| Connection pool exhaustion | HIGH | Pool size config, timeout |
| Long-running query | MEDIUM | Query timeout, index optimization |
| Concurrent writes to same row | MEDIUM | Optimistic locking where needed |
| NULL in required fields | LOW | Schema constraints + Zod validation |
| Foreign key violations | LOW | Drizzle ORM handles |

### 8. Frontend Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| JavaScript disabled | Basic HTML form fallback |
| Slow 3G connection | Loading states, skeleton UI |
| Mobile viewport | Responsive design |
| Back button during payment | Prevent duplicate submissions |
| Form validation fails | Clear inline error messages |
| Session storage full | Graceful degradation |

## Stress Test Commands

```bash
# Load test payment endpoint (use with caution)
# for i in {1..10}; do curl -X POST /api/payments -d '{"test":true}' & done

# Verify rate limiting
# for i in {1..150}; do curl -s /api/countries & done | grep -c "429"

# Test concurrent agency claims
# Requires two authenticated sessions
```

## Monitoring Checklist

- [ ] Error logs accessible in admin dashboard
- [ ] Payment reconciliation reports
- [ ] AI processing success rate tracking
- [ ] Session duration analytics
- [ ] API response time monitoring
- [ ] Database connection pool stats

## Known Limitations

1. M-Pesa integration is simulated - production requires real Safaricom API
2. AI processing is synchronous - may need queue for high volume
3. No offline support - requires network connection
4. Session stored in PostgreSQL - may need Redis for scale

---
Last Updated: 2026-01-21
