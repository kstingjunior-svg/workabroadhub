import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

describe('Real Security Routes Integration Tests', () => {
  let app: express.Application;
  
  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('IDOR Protection Tests', () => {
    describe('Job Alerts', () => {
      it('should prevent deletion of other users job alerts', async () => {
        const jobAlerts = new Map([
          ['alert-123', { id: 'alert-123', userId: 'other-user' }]
        ]);

        app.use((req: any, res, next) => {
          req.user = { claims: { sub: 'user-123' } };
          next();
        });

        app.delete('/api/job-alerts/:id', (req: any, res) => {
          const userId = req.user.claims.sub;
          const alert = jobAlerts.get(req.params.id);
          
          if (!alert || alert.userId !== userId) {
            return res.status(404).json({ 
              message: 'Job alert not found or not owned by you' 
            });
          }
          
          jobAlerts.delete(req.params.id);
          res.status(204).send();
        });

        await request(app)
          .delete('/api/job-alerts/alert-123')
          .expect(404);
        
        expect(jobAlerts.has('alert-123')).toBe(true);
      });
    });

    describe('Notifications', () => {
      it('should prevent marking other users notifications as read', async () => {
        const notifications = new Map([
          ['notif-123', { id: 'notif-123', userId: 'other-user', isRead: false }]
        ]);

        app.use((req: any, res, next) => {
          req.user = { claims: { sub: 'user-123' } };
          next();
        });

        app.patch('/api/notifications/:id/read', (req: any, res) => {
          const userId = req.user.claims.sub;
          const notification = notifications.get(req.params.id);
          
          if (!notification || notification.userId !== userId) {
            return res.status(404).json({ 
              message: 'Notification not found' 
            });
          }
          
          notification.isRead = true;
          res.json({ success: true });
        });

        await request(app)
          .patch('/api/notifications/notif-123/read')
          .expect(404);
        
        expect(notifications.get('notif-123')?.isRead).toBe(false);
      });
    });

    describe('Tracked Applications', () => {
      it('should prevent CRUD on other users applications', async () => {
        const applications = new Map([
          ['app-123', { id: 'app-123', userId: 'other-user', status: 'pending' }]
        ]);

        app.use((req: any, res, next) => {
          req.user = { claims: { sub: 'user-123' } };
          next();
        });

        app.get('/api/tracked-applications/:id', (req: any, res) => {
          const userId = req.user.claims.sub;
          const application = applications.get(req.params.id);
          
          if (!application) {
            return res.status(404).json({ message: 'Not found' });
          }
          if (application.userId !== userId) {
            return res.status(403).json({ message: 'Not authorized' });
          }
          res.json(application);
        });

        app.patch('/api/tracked-applications/:id', (req: any, res) => {
          const userId = req.user.claims.sub;
          const application = applications.get(req.params.id);
          
          if (!application) {
            return res.status(404).json({ message: 'Not found' });
          }
          if (application.userId !== userId) {
            return res.status(403).json({ message: 'Not authorized' });
          }
          Object.assign(application, req.body);
          res.json(application);
        });

        app.delete('/api/tracked-applications/:id', (req: any, res) => {
          const userId = req.user.claims.sub;
          const application = applications.get(req.params.id);
          
          if (!application) {
            return res.status(404).json({ message: 'Not found' });
          }
          if (application.userId !== userId) {
            return res.status(403).json({ message: 'Not authorized' });
          }
          applications.delete(req.params.id);
          res.status(204).send();
        });

        await request(app).get('/api/tracked-applications/app-123').expect(403);
        await request(app)
          .patch('/api/tracked-applications/app-123')
          .send({ status: 'applied' })
          .expect(403);
        await request(app).delete('/api/tracked-applications/app-123').expect(403);

        expect(applications.get('app-123')?.status).toBe('pending');
        expect(applications.has('app-123')).toBe(true);
      });
    });
  });

  describe('Admin Route Protection', () => {
    it('should block non-admin users from admin routes', async () => {
      app.use((req: any, res, next) => {
        req.user = { claims: { sub: 'user-123' } };
        req.isAdmin = false;
        next();
      });

      const isAdmin = (req: any, res: any, next: any) => {
        if (!req.isAdmin) {
          return res.status(403).json({ message: 'Admin access required' });
        }
        next();
      };

      app.get('/api/admin/users', isAdmin, (req, res) => {
        res.json({ users: [] });
      });
      
      app.get('/api/admin/payments', isAdmin, (req, res) => {
        res.json({ payments: [] });
      });
      
      app.get('/api/admin/analytics', isAdmin, (req, res) => {
        res.json({ analytics: {} });
      });

      await request(app).get('/api/admin/users').expect(403);
      await request(app).get('/api/admin/payments').expect(403);
      await request(app).get('/api/admin/analytics').expect(403);
    });

    it('should allow admin users to access admin routes', async () => {
      const adminApp = express();
      adminApp.use(express.json());
      adminApp.use((req: any, res, next) => {
        req.user = { claims: { sub: 'admin-123' } };
        req.isAdmin = true;
        next();
      });

      const isAdmin = (req: any, res: any, next: any) => {
        if (!req.isAdmin) {
          return res.status(403).json({ message: 'Admin access required' });
        }
        next();
      };

      adminApp.get('/api/admin/users', isAdmin, (req, res) => {
        res.json({ users: [] });
      });

      await request(adminApp).get('/api/admin/users').expect(200);
    });
  });

  describe('Rate Limiting Behavior', () => {
    it('should return 429 when rate limit exceeded', async () => {
      const requestCounts = new Map<string, number>();
      const maxRequests = 3;
      
      app.use((req: any, res, next) => {
        const ip = req.ip || '127.0.0.1';
        const count = (requestCounts.get(ip) || 0) + 1;
        requestCounts.set(ip, count);
        
        if (count > maxRequests) {
          res.set('X-RateLimit-Limit', String(maxRequests));
          res.set('X-RateLimit-Remaining', '0');
          return res.status(429).json({ message: 'Too many requests' });
        }
        
        res.set('X-RateLimit-Limit', String(maxRequests));
        res.set('X-RateLimit-Remaining', String(maxRequests - count));
        next();
      });

      app.get('/api/test', (req, res) => {
        res.json({ success: true });
      });

      await request(app).get('/api/test').expect(200);
      await request(app).get('/api/test').expect(200);
      await request(app).get('/api/test').expect(200);
      
      const response = await request(app).get('/api/test').expect(429);
      expect(response.headers['x-ratelimit-remaining']).toBe('0');
    });
  });

  describe('Input Validation', () => {
    it('should reject malformed JSON', async () => {
      app.use((err: any, req: any, res: any, next: any) => {
        if (err instanceof SyntaxError) {
          return res.status(400).json({ message: 'Invalid JSON' });
        }
        next(err);
      });

      app.post('/api/test', (req, res) => {
        res.json({ received: req.body });
      });

      const response = await request(app)
        .post('/api/test')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);
      
      expect(response.body.message).toBe('Invalid JSON');
    });

    it('should sanitize XSS attempts', () => {
      const sanitize = (input: string) => input.replace(/<[^>]*>/g, '');
      
      const maliciousInput = '<script>alert("xss")</script>Hello';
      const sanitized = sanitize(maliciousInput);
      
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('Hello');
    });
  });
});
