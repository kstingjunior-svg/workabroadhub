# Crisis Response Playbook

## WorkAbroad Hub - Emergency Response Procedures

---

## SEVERITY LEVELS

| Level | Definition | Response Time | Escalation |
|-------|------------|---------------|------------|
| P0 - CRITICAL | System down, payments affected, data breach | < 15 min | Immediate all-hands |
| P1 - HIGH | Major feature broken, partial outage | < 1 hour | Dev team + stakeholders |
| P2 - MEDIUM | Degraded performance, minor feature issue | < 4 hours | Dev team |
| P3 - LOW | Cosmetic issues, non-urgent bugs | < 24 hours | Normal queue |

---

## CRISIS SCENARIOS & RESPONSE

### 1. PAYMENT SYSTEM FAILURE

**Symptoms:**
- Users unable to complete payments
- M-Pesa prompts not sending
- Payment status stuck at "pending"

**Immediate Actions:**
1. [ ] Check Replit workflow logs: `Start application`
2. [ ] Verify database connection: `SELECT 1 FROM payments LIMIT 1`
3. [ ] Check environment variables: `SESSION_SECRET`, database URL
4. [ ] Review error logs for payment endpoint

**Communication Template:**
```
Subject: Payment Processing Temporarily Unavailable

We are experiencing technical difficulties with our payment system.
Your payment has NOT been processed. Please do not attempt multiple payments.
We expect to resolve this within [X] hours.

If you were charged, please contact support@workabroad.hub with your:
- Phone number used for M-Pesa
- Date and time of transaction
- Transaction reference (if any)

We apologize for the inconvenience.
```

**Recovery Steps:**
1. Identify failed payments in database
2. Cross-reference with M-Pesa logs (production)
3. Manually activate subscriptions if payment confirmed
4. Send confirmation emails to affected users

---

### 2. DATABASE OUTAGE

**Symptoms:**
- 500 errors across all pages
- "Database connection failed" in logs
- Users logged out unexpectedly

**Immediate Actions:**
1. [ ] Check PostgreSQL status in Replit
2. [ ] Verify DATABASE_URL environment variable
3. [ ] Check connection pool status
4. [ ] Review recent schema changes

**Recovery Commands:**
```sql
-- Check active connections
SELECT count(*) FROM pg_stat_activity;

-- Kill stuck queries (if needed)
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE state = 'active' AND query_start < now() - interval '5 minutes';

-- Verify tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public';
```

**Rollback Option:**
- Use Replit checkpoint system to rollback to last known good state
- Click "View Checkpoints" in Replit interface

---

### 3. AI SERVICE FAILURE

**Symptoms:**
- Orders stuck in "processing" status
- OpenAI API errors in logs
- Quality check failures

**Immediate Actions:**
1. [ ] Check OpenAI API status: https://status.openai.com
2. [ ] Verify API key: `AI_INTEGRATIONS_OPENAI_API_KEY`
3. [ ] Check usage/billing on OpenAI dashboard
4. [ ] Review rate limit status

**Mitigation:**
1. Set all pending orders to "processing" status (manual queue)
2. Notify users of delay via email/notification
3. Process orders manually if > 24 hour delay

**Manual Processing Checklist:**
- [ ] Review intake data
- [ ] Create CV/cover letter using templates
- [ ] Upload as deliverable
- [ ] Mark order as "completed"
- [ ] Send notification to user

---

### 4. SECURITY INCIDENT

**Symptoms:**
- Unusual login patterns
- Data access from unknown IPs
- User reports of account compromise

**Immediate Actions (DO NOT DELAY):**
1. [ ] Document everything with timestamps
2. [ ] Preserve logs before rotation
3. [ ] Assess scope of breach

**If User Data Exposed:**
1. [ ] Identify affected users
2. [ ] Prepare notification within 72 hours (GDPR)
3. [ ] Reset all active sessions
4. [ ] Review and patch vulnerability

**Communication Template:**
```
Subject: Important Security Notice - Action Required

Dear [User],

We detected unauthorized access to our systems on [DATE].
As a precaution, we have reset all user sessions.

What was affected: [DETAILS]
What we're doing: [ACTIONS]
What you should do: [INSTRUCTIONS]

We take security seriously and apologize for any concern.

Contact security@workabroad.hub with questions.
```

---

### 5. DEPLOYMENT FAILURE

**Symptoms:**
- Site shows old version
- New features not appearing
- Build errors in logs

**Immediate Actions:**
1. [ ] Check Replit deployment status
2. [ ] Review build logs for errors
3. [ ] Verify all environment variables set

**Rollback Steps:**
1. Open Replit checkpoints
2. Select last working checkpoint
3. Restore and redeploy
4. Verify functionality

---

### 6. NEA DATA DISCREPANCY

**Symptoms:**
- Agency shown as valid but actually expired
- Missing agencies from search
- Incorrect license information

**Immediate Actions:**
1. [ ] Cross-reference with official NEA portal
2. [ ] Identify scope of discrepancy
3. [ ] Update affected records

**Communication (if public-facing impact):**
```
We have identified inaccuracies in our agency database.
We are updating records to reflect current NEA status.
Please verify agency status with the official NEA portal.
```

---

## COMMUNICATION CHANNELS

| Channel | Use For | Response Time |
|---------|---------|---------------|
| Email | Formal notifications, documentation | Within 2 hours |
| WhatsApp Admin Group | Real-time coordination | Immediate |
| Status Page | Public incident updates | Every 30 min during outage |
| In-app Banner | User notifications | When issue affects users |

---

## POST-INCIDENT PROCESS

### Within 24 Hours:
1. [ ] Document timeline of events
2. [ ] Identify root cause
3. [ ] List affected users/transactions
4. [ ] Implement immediate fixes

### Within 72 Hours:
1. [ ] Write incident report
2. [ ] Conduct team retrospective
3. [ ] Update monitoring/alerting
4. [ ] Implement preventive measures

### Incident Report Template:
```
## Incident Report: [TITLE]

**Date:** [DATE]
**Duration:** [START] - [END]
**Severity:** P[0-3]
**Lead Responder:** [NAME]

### Summary
[Brief description of what happened]

### Timeline
- [TIME]: [EVENT]
- [TIME]: [EVENT]

### Root Cause
[Technical explanation]

### Impact
- Users affected: [NUMBER]
- Revenue impact: [AMOUNT]
- Data impact: [DESCRIPTION]

### Resolution
[What fixed the issue]

### Prevention
[Steps to prevent recurrence]

### Action Items
- [ ] [TASK] - [OWNER] - [DUE DATE]
```

---

## EMERGENCY CONTACTS

| Role | Responsibility | Escalation Trigger |
|------|---------------|-------------------|
| Primary Admin | First response, triage | Any P0/P1 incident |
| Technical Lead | Code fixes, deployments | Technical issues |
| Business Owner | User communication, decisions | User-facing impact |
| Legal | Data breach, compliance | Security incidents |

---

## MONITORING CHECKLIST

### Daily:
- [ ] Review error logs
- [ ] Check payment success rate
- [ ] Monitor AI processing queue
- [ ] Verify database backups

### Weekly:
- [ ] Review security logs
- [ ] Check rate limit triggers
- [ ] Analyze response times
- [ ] Update NEA data if needed

### Monthly:
- [ ] Full system health review
- [ ] Update crisis playbook
- [ ] Test backup restoration
- [ ] Review and update contacts

---

Last Updated: 2026-01-21
Version: 1.0
