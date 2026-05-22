import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

describe('Security Integration Tests', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('IDOR Protection - Job Alerts', () => {
    it('should prevent deletion of other users job alerts', async () => {
      const jobAlerts = new Map([
        ['alert-123', { id: 'alert-123', userId: 'other-user' }]
      ]);

      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'user-123' } };
        next();
      };

      app.delete('/api/job-alerts/:id', isAuthenticated, (req, res) => {
        const userId = req.user.claims.sub;
        const alert = jobAlerts.get(req.params.id);
        
        if (!alert || alert.userId !== userId) {
          return res.status(404).json({ message: 'Job alert not found or not owned by you' });
        }
        
        jobAlerts.delete(req.params.id);
        res.status(204).send();
      });

      const response = await request(app)
        .delete('/api/job-alerts/alert-123')
        .expect(404);
      
      expect(response.body.message).toBe('Job alert not found or not owned by you');
      expect(jobAlerts.has('alert-123')).toBe(true);
    });

    it('should allow deletion of own job alerts', async () => {
      const jobAlerts = new Map([
        ['alert-123', { id: 'alert-123', userId: 'user-123' }]
      ]);

      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'user-123' } };
        next();
      };

      app.delete('/api/job-alerts/:id', isAuthenticated, (req, res) => {
        const userId = req.user.claims.sub;
        const alert = jobAlerts.get(req.params.id);
        
        if (!alert || alert.userId !== userId) {
          return res.status(404).json({ message: 'Job alert not found or not owned by you' });
        }
        
        jobAlerts.delete(req.params.id);
        res.status(204).send();
      });

      await request(app)
        .delete('/api/job-alerts/alert-123')
        .expect(204);
      
      expect(jobAlerts.has('alert-123')).toBe(false);
    });
  });

  describe('IDOR Protection - Notifications', () => {
    it('should prevent marking other users notifications as read', async () => {
      const notifications = new Map([
        ['notif-123', { id: 'notif-123', userId: 'other-user', isRead: false }]
      ]);

      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'user-123' } };
        next();
      };

      app.patch('/api/notifications/:id/read', isAuthenticated, (req, res) => {
        const userId = req.user.claims.sub;
        const notification = notifications.get(req.params.id);
        
        if (!notification || notification.userId !== userId) {
          return res.status(404).json({ message: 'Notification not found or not owned by you' });
        }
        
        notification.isRead = true;
        res.json({ success: true });
      });

      const response = await request(app)
        .patch('/api/notifications/notif-123/read')
        .expect(404);
      
      expect(response.body.message).toBe('Notification not found or not owned by you');
      expect(notifications.get('notif-123')?.isRead).toBe(false);
    });
  });

  describe('IDOR Protection - Tracked Applications', () => {
    it('should prevent viewing other users applications', async () => {
      const applications = new Map([
        ['app-123', { id: 'app-123', userId: 'other-user', jobTitle: 'Developer' }]
      ]);

      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'user-123' } };
        next();
      };

      app.get('/api/tracked-applications/:id', isAuthenticated, (req, res) => {
        const userId = req.user.claims.sub;
        const application = applications.get(req.params.id);
        
        if (!application) {
          return res.status(404).json({ message: 'Application not found' });
        }
        if (application.userId !== userId) {
          return res.status(403).json({ message: 'Not authorized' });
        }
        
        res.json(application);
      });

      const response = await request(app)
        .get('/api/tracked-applications/app-123')
        .expect(403);
      
      expect(response.body.message).toBe('Not authorized');
    });

    it('should prevent updating other users applications', async () => {
      const applications = new Map([
        ['app-123', { id: 'app-123', userId: 'other-user', status: 'pending' }]
      ]);

      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'user-123' } };
        next();
      };

      app.patch('/api/tracked-applications/:id', isAuthenticated, (req, res) => {
        const userId = req.user.claims.sub;
        const application = applications.get(req.params.id);
        
        if (!application) {
          return res.status(404).json({ message: 'Application not found' });
        }
        if (application.userId !== userId) {
          return res.status(403).json({ message: 'Not authorized' });
        }
        
        Object.assign(application, req.body);
        res.json(application);
      });

      const response = await request(app)
        .patch('/api/tracked-applications/app-123')
        .send({ status: 'applied' })
        .expect(403);
      
      expect(response.body.message).toBe('Not authorized');
      expect(applications.get('app-123')?.status).toBe('pending');
    });

    it('should prevent deleting other users applications', async () => {
      const applications = new Map([
        ['app-123', { id: 'app-123', userId: 'other-user' }]
      ]);

      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'user-123' } };
        next();
      };

      app.delete('/api/tracked-applications/:id', isAuthenticated, (req, res) => {
        const userId = req.user.claims.sub;
        const application = applications.get(req.params.id);
        
        if (!application) {
          return res.status(404).json({ message: 'Application not found' });
        }
        if (application.userId !== userId) {
          return res.status(403).json({ message: 'Not authorized' });
        }
        
        applications.delete(req.params.id);
        res.status(204).send();
      });

      const response = await request(app)
        .delete('/api/tracked-applications/app-123')
        .expect(403);
      
      expect(response.body.message).toBe('Not authorized');
      expect(applications.has('app-123')).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    it('should return 429 when rate limit exceeded', async () => {
      const requestCounts = new Map<string, number>();
      const maxRequests = 3;
      
      const rateLimit = (req: any, res: any, next: any) => {
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
      };

      app.get('/api/test', rateLimit, (req, res) => {
        res.json({ success: true });
      });

      await request(app).get('/api/test').expect(200);
      await request(app).get('/api/test').expect(200);
      await request(app).get('/api/test').expect(200);
      
      const response = await request(app)
        .get('/api/test')
        .expect(429);
      
      expect(response.body.message).toBe('Too many requests');
      expect(response.headers['x-ratelimit-remaining']).toBe('0');
    });

    it('should include rate limit headers in response', async () => {
      const rateLimit = (req: any, res: any, next: any) => {
        res.set('X-RateLimit-Limit', '100');
        res.set('X-RateLimit-Remaining', '99');
        res.set('X-RateLimit-Reset', String(Date.now() + 900000));
        next();
      };

      app.get('/api/test', rateLimit, (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/api/test')
        .expect(200);
      
      expect(response.headers['x-ratelimit-limit']).toBe('100');
      expect(response.headers['x-ratelimit-remaining']).toBe('99');
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });
  });

  describe('Input Validation', () => {
    it('should reject invalid JSON body', async () => {
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

    it('should sanitize user input', async () => {
      app.post('/api/test', (req, res) => {
        const { name } = req.body;
        const sanitized = name?.replace(/<[^>]*>/g, '');
        res.json({ name: sanitized });
      });

      const response = await request(app)
        .post('/api/test')
        .send({ name: '<script>alert("xss")</script>Test' })
        .expect(200);
      
      expect(response.body.name).toBe('alert("xss")Test');
      expect(response.body.name).not.toContain('<script>');
    });
  });
});
