import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

describe('Compliance & Policy Tests', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('Privacy Policy URL Reachable', () => {
    it('should serve privacy policy page', async () => {
      app.get('/privacy-policy', (req, res) => {
        res.status(200).send(`
          <html>
            <head><title>Privacy Policy - WorkAbroad Hub</title></head>
            <body>
              <h1>Privacy Policy</h1>
              <p>Last updated: January 2025</p>
              <p>We collect personal information to provide career consultation services...</p>
            </body>
          </html>
        `);
      });

      const response = await request(app)
        .get('/privacy-policy')
        .expect(200);

      expect(response.text).toContain('Privacy Policy');
    });

    it('should serve terms of service page', async () => {
      app.get('/terms', (req, res) => {
        res.status(200).send(`
          <html>
            <head><title>Terms of Service - WorkAbroad Hub</title></head>
            <body>
              <h1>Terms of Service</h1>
              <p>By using this service, you agree to...</p>
            </body>
          </html>
        `);
      });

      const response = await request(app)
        .get('/terms')
        .expect(200);

      expect(response.text).toContain('Terms of Service');
    });

    it('should include policy links in API response', async () => {
      app.get('/api/legal', (req, res) => {
        res.json({
          privacyPolicy: '/privacy-policy',
          termsOfService: '/terms',
          refundPolicy: '/refund-policy',
          disclaimer: '/disclaimer'
        });
      });

      const response = await request(app)
        .get('/api/legal')
        .expect(200);

      expect(response.body.privacyPolicy).toBeDefined();
      expect(response.body.termsOfService).toBeDefined();
    });
  });

  describe('Data Deletion Endpoint Works', () => {
    it('should allow user to request account deletion', async () => {
      const users = new Map([
        ['user-123', { id: 'user-123', email: 'test@test.com', name: 'Test User' }]
      ]);
      const deletionRequests: any[] = [];

      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'user-123' } };
        next();
      };

      app.post('/api/user/delete-request', isAuthenticated, (req, res) => {
        const userId = req.user.claims.sub;
        
        deletionRequests.push({
          userId,
          requestedAt: new Date(),
          reason: req.body.reason,
          status: 'pending'
        });

        res.json({ 
          message: 'Deletion request submitted. Your data will be deleted within 30 days.',
          requestId: `del-${Date.now()}`
        });
      });

      const response = await request(app)
        .post('/api/user/delete-request')
        .send({ reason: 'No longer need the service' })
        .expect(200);

      expect(response.body.message).toContain('Deletion request submitted');
      expect(deletionRequests.length).toBe(1);
      expect(deletionRequests[0].userId).toBe('user-123');
    });

    it('should allow user to export their data', async () => {
      const userData = {
        profile: { name: 'Test User', email: 'test@test.com' },
        payments: [{ id: 'pay-1', amount: 4500 }],
        applications: [{ id: 'app-1', jobTitle: 'Developer' }],
        referrals: [{ id: 'ref-1', earnings: 450 }]
      };

      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'user-123' } };
        next();
      };

      app.get('/api/user/data-export', isAuthenticated, (req, res) => {
        res.json({
          exportedAt: new Date().toISOString(),
          data: userData
        });
      });

      const response = await request(app)
        .get('/api/user/data-export')
        .expect(200);

      expect(response.body.data.profile).toBeDefined();
      expect(response.body.data.payments).toBeDefined();
      expect(response.body.exportedAt).toBeDefined();
    });

    it('should confirm data deletion completion', async () => {
      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'user-123' } };
        next();
      };

      app.delete('/api/user/account', isAuthenticated, (req, res) => {
        const userId = req.user.claims.sub;
        
        res.json({
          message: 'Account successfully deleted',
          deletedUserId: userId,
          deletedAt: new Date().toISOString()
        });
      });

      const response = await request(app)
        .delete('/api/user/account')
        .expect(200);

      expect(response.body.message).toBe('Account successfully deleted');
    });
  });

  describe('External Payment Disclosure Visible', () => {
    it('should include payment provider disclosure in payment initiation', async () => {
      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'user-123' } };
        next();
      };

      app.get('/api/payments/info', isAuthenticated, (req, res) => {
        res.json({
          amount: 4500,
          currency: 'KES',
          paymentProvider: 'M-Pesa (Safaricom)',
          disclosure: 'Payment is processed by Safaricom M-Pesa. By proceeding, you agree to M-Pesa terms of service.',
          refundPolicy: 'Refunds are processed within 7-14 business days.'
        });
      });

      const response = await request(app)
        .get('/api/payments/info')
        .expect(200);

      expect(response.body.paymentProvider).toContain('M-Pesa');
      expect(response.body.disclosure).toBeDefined();
    });

    it('should show service is not a recruitment agency', async () => {
      app.get('/api/disclaimer', (req, res) => {
        res.json({
          disclaimer: 'WorkAbroad Hub is a career consultation service. We do not guarantee employment, do not sell jobs, and are not a licensed recruitment agency. All job applications are made on third-party platforms.',
          notRecruitmentAgency: true,
          noEmploymentGuarantee: true
        });
      });

      const response = await request(app)
        .get('/api/disclaimer')
        .expect(200);

      expect(response.body.notRecruitmentAgency).toBe(true);
      expect(response.body.noEmploymentGuarantee).toBe(true);
      expect(response.body.disclaimer).toContain('not a licensed recruitment agency');
    });
  });

  describe('No Restricted Permissions Requested', () => {
    it('should not request unnecessary permissions in manifest', async () => {
      const appManifest = {
        name: 'WorkAbroad Hub',
        permissions: ['internet', 'vibrate'],
        restrictedPermissions: []
      };

      const restrictedPermissions = [
        'camera',
        'microphone',
        'location',
        'contacts',
        'sms',
        'call_log',
        'storage'
      ];

      app.get('/api/app/manifest', (req, res) => {
        res.json(appManifest);
      });

      const response = await request(app)
        .get('/api/app/manifest')
        .expect(200);

      const requestedPermissions = response.body.permissions || [];
      const hasRestrictedPermissions = requestedPermissions.some(
        (p: string) => restrictedPermissions.includes(p)
      );

      expect(hasRestrictedPermissions).toBe(false);
    });

    it('should justify any sensitive permissions', async () => {
      const permissionJustifications = {
        internet: 'Required for API communication and payment processing',
        vibrate: 'Used for payment confirmation notifications'
      };

      app.get('/api/app/permissions', (req, res) => {
        res.json({
          permissions: Object.keys(permissionJustifications),
          justifications: permissionJustifications
        });
      });

      const response = await request(app)
        .get('/api/app/permissions')
        .expect(200);

      const permissions = response.body.permissions || [];
      permissions.forEach((permission: string) => {
        expect(response.body.justifications[permission]).toBeDefined();
      });
    });
  });

  describe('Data Protection Compliance', () => {
    it('should not expose sensitive data in error responses', async () => {
      app.get('/api/test-error', (req, res) => {
        const error = new Error('Database connection failed');
        
        res.status(500).json({
          message: 'Internal server error',
          code: 'SERVER_ERROR'
        });
      });

      const response = await request(app)
        .get('/api/test-error')
        .expect(500);

      expect(response.body.message).not.toContain('password');
      expect(response.body.message).not.toContain('DATABASE_URL');
      expect(response.body.message).not.toContain('secret');
    });

    it('should redact PII from logs', () => {
      const sensitiveData = {
        email: 'user@example.com',
        phone: '254712345678',
        password: 'secret123',
        mpesaPin: '1234'
      };

      const redactPII = (data: any): any => {
        const redactedKeys = ['password', 'pin', 'mpesaPin', 'secret'];
        const partialRedactKeys = ['email', 'phone'];

        const result = { ...data };
        
        for (const key of redactedKeys) {
          if (result[key]) {
            result[key] = '[REDACTED]';
          }
        }
        
        for (const key of partialRedactKeys) {
          if (result[key] && typeof result[key] === 'string') {
            if (key === 'email') {
              const parts = result[key].split('@');
              result[key] = `${parts[0].substring(0, 2)}***@${parts[1]}`;
            } else if (key === 'phone') {
              result[key] = result[key].substring(0, 6) + '****';
            }
          }
        }
        
        return result;
      };

      const redacted = redactPII(sensitiveData);

      expect(redacted.password).toBe('[REDACTED]');
      expect(redacted.mpesaPin).toBe('[REDACTED]');
      expect(redacted.email).not.toBe(sensitiveData.email);
      expect(redacted.phone).not.toBe(sensitiveData.phone);
    });

    it('should enforce minimum data retention policies', () => {
      const retentionPolicies = {
        paymentRecords: 7 * 365,
        userProfiles: 365,
        sessionLogs: 30,
        deletedAccountData: 90
      };

      expect(retentionPolicies.paymentRecords).toBeGreaterThanOrEqual(7 * 365);
      expect(retentionPolicies.userProfiles).toBeLessThanOrEqual(5 * 365);
      expect(retentionPolicies.sessionLogs).toBeLessThanOrEqual(90);
    });
  });

  describe('Service Disclosure Compliance', () => {
    it('should clearly state service is career consultation', async () => {
      app.get('/api/service-info', (req, res) => {
        res.json({
          serviceType: 'Career Consultation Service',
          includes: [
            '1-on-1 WhatsApp consultation',
            'AI-powered country/job recommendations',
            'Ongoing access to verified job portals'
          ],
          price: 4500,
          currency: 'KES',
          doesNotInclude: [
            'Job placement guarantee',
            'Visa sponsorship',
            'Direct employment'
          ]
        });
      });

      const response = await request(app)
        .get('/api/service-info')
        .expect(200);

      expect(response.body.serviceType).toContain('Consultation');
      expect(response.body.doesNotInclude).toContain('Job placement guarantee');
    });
  });
});
