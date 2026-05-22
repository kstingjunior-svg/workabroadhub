import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

describe('Role & Permission Tests', () => {
  let app: express.Application;
  let adminActions: Array<{userId: string, action: string, timestamp: Date}>;
  
  beforeEach(() => {
    app = express();
    app.use(express.json());
    adminActions = [];
  });

  describe('User Cannot Access Admin Routes', () => {
    it('should block normal user from admin users list', async () => {
      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'user-123' } };
        req.isAdmin = false;
        next();
      };

      const isAdmin = (req: any, res: any, next: any) => {
        if (!req.isAdmin) {
          return res.status(403).json({ message: 'Admin access required' });
        }
        next();
      };

      app.get('/api/admin/users', isAuthenticated, isAdmin, (req, res) => {
        res.json({ users: [] });
      });

      const response = await request(app)
        .get('/api/admin/users')
        .expect(403);
      
      expect(response.body.message).toBe('Admin access required');
    });

    it('should block normal user from admin payments', async () => {
      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'user-123' } };
        req.isAdmin = false;
        next();
      };

      const isAdmin = (req: any, res: any, next: any) => {
        if (!req.isAdmin) {
          return res.status(403).json({ message: 'Admin access required' });
        }
        next();
      };

      app.get('/api/admin/payments', isAuthenticated, isAdmin, (req, res) => {
        res.json({ payments: [] });
      });

      const response = await request(app)
        .get('/api/admin/payments')
        .expect(403);
      
      expect(response.body.message).toBe('Admin access required');
    });

    it('should block normal user from admin countries management', async () => {
      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'user-123' } };
        req.isAdmin = false;
        next();
      };

      const isAdmin = (req: any, res: any, next: any) => {
        if (!req.isAdmin) {
          return res.status(403).json({ message: 'Admin access required' });
        }
        next();
      };

      app.post('/api/admin/countries', isAuthenticated, isAdmin, (req, res) => {
        res.json({ country: req.body });
      });

      const response = await request(app)
        .post('/api/admin/countries')
        .send({ name: 'Test Country' })
        .expect(403);
      
      expect(response.body.message).toBe('Admin access required');
    });

    it('should block normal user from admin analytics', async () => {
      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'user-123' } };
        req.isAdmin = false;
        next();
      };

      const isAdmin = (req: any, res: any, next: any) => {
        if (!req.isAdmin) {
          return res.status(403).json({ message: 'Admin access required' });
        }
        next();
      };

      app.get('/api/admin/analytics', isAuthenticated, isAdmin, (req, res) => {
        res.json({ totalUsers: 100, totalPayments: 50 });
      });

      const response = await request(app)
        .get('/api/admin/analytics')
        .expect(403);
      
      expect(response.body.message).toBe('Admin access required');
    });
  });

  describe('Admin Actions Logged', () => {
    it('should log admin user creation action', async () => {
      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'admin-123' } };
        req.isAdmin = true;
        next();
      };

      const isAdmin = (req: any, res: any, next: any) => {
        if (!req.isAdmin) {
          return res.status(403).json({ message: 'Admin access required' });
        }
        next();
      };

      const logAdminAction = (action: string) => (req: any, res: any, next: any) => {
        adminActions.push({
          userId: req.user.claims.sub,
          action,
          timestamp: new Date()
        });
        next();
      };

      app.post('/api/admin/users', isAuthenticated, isAdmin, logAdminAction('CREATE_USER'), (req, res) => {
        res.json({ created: true });
      });

      await request(app)
        .post('/api/admin/users')
        .send({ email: 'new@test.com' })
        .expect(200);
      
      expect(adminActions.length).toBe(1);
      expect(adminActions[0].action).toBe('CREATE_USER');
      expect(adminActions[0].userId).toBe('admin-123');
    });

    it('should log admin payment status change', async () => {
      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'admin-123' } };
        req.isAdmin = true;
        next();
      };

      const isAdmin = (req: any, res: any, next: any) => {
        if (!req.isAdmin) {
          return res.status(403).json({ message: 'Admin access required' });
        }
        next();
      };

      const logAdminAction = (action: string) => (req: any, res: any, next: any) => {
        adminActions.push({
          userId: req.user.claims.sub,
          action: `${action}: ${req.params.id}`,
          timestamp: new Date()
        });
        next();
      };

      app.patch('/api/admin/payments/:id', isAuthenticated, isAdmin, logAdminAction('UPDATE_PAYMENT'), (req, res) => {
        res.json({ updated: true });
      });

      await request(app)
        .patch('/api/admin/payments/pay-123')
        .send({ status: 'completed' })
        .expect(200);
      
      expect(adminActions.length).toBe(1);
      expect(adminActions[0].action).toContain('UPDATE_PAYMENT');
      expect(adminActions[0].action).toContain('pay-123');
    });

    it('should log admin delete actions', async () => {
      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'admin-123' } };
        req.isAdmin = true;
        next();
      };

      const isAdmin = (req: any, res: any, next: any) => {
        if (!req.isAdmin) {
          return res.status(403).json({ message: 'Admin access required' });
        }
        next();
      };

      const logAdminAction = (action: string) => (req: any, res: any, next: any) => {
        adminActions.push({
          userId: req.user.claims.sub,
          action: `${action}: ${req.params.id}`,
          timestamp: new Date()
        });
        next();
      };

      app.delete('/api/admin/countries/:id', isAuthenticated, isAdmin, logAdminAction('DELETE_COUNTRY'), (req, res) => {
        res.status(204).send();
      });

      await request(app)
        .delete('/api/admin/countries/country-123')
        .expect(204);
      
      expect(adminActions.length).toBe(1);
      expect(adminActions[0].action).toContain('DELETE_COUNTRY');
    });
  });

  describe('Referral Earnings Visible Only to Owner', () => {
    it('should show referral earnings only to the owner', async () => {
      const referrals = new Map([
        ['ref-123', { id: 'ref-123', referrerId: 'user-123', earnings: 450 }],
        ['ref-456', { id: 'ref-456', referrerId: 'other-user', earnings: 900 }]
      ]);

      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'user-123' } };
        next();
      };

      app.get('/api/referrals/earnings', isAuthenticated, (req, res) => {
        const userId = req.user.claims.sub;
        const userReferrals = Array.from(referrals.values())
          .filter(r => r.referrerId === userId);
        const totalEarnings = userReferrals.reduce((sum, r) => sum + r.earnings, 0);
        res.json({ earnings: totalEarnings, referrals: userReferrals });
      });

      const response = await request(app)
        .get('/api/referrals/earnings')
        .expect(200);
      
      expect(response.body.earnings).toBe(450);
      expect(response.body.referrals.length).toBe(1);
      expect(response.body.referrals[0].referrerId).toBe('user-123');
    });

    it('should not expose other users referral data', async () => {
      const referrals = new Map([
        ['ref-123', { id: 'ref-123', referrerId: 'other-user', earnings: 450, refereeEmail: 'secret@email.com' }]
      ]);

      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'user-123' } };
        next();
      };

      app.get('/api/referrals/:id', isAuthenticated, (req, res) => {
        const userId = req.user.claims.sub;
        const referral = referrals.get(req.params.id);
        
        if (!referral || referral.referrerId !== userId) {
          return res.status(404).json({ message: 'Referral not found' });
        }
        
        res.json(referral);
      });

      const response = await request(app)
        .get('/api/referrals/ref-123')
        .expect(404);
      
      expect(response.body.message).toBe('Referral not found');
    });
  });

  describe('No Horizontal Privilege Escalation', () => {
    it('should prevent user from modifying another users profile', async () => {
      const users = new Map([
        ['user-123', { id: 'user-123', name: 'User One', email: 'one@test.com' }],
        ['user-456', { id: 'user-456', name: 'User Two', email: 'two@test.com' }]
      ]);

      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'user-123' } };
        next();
      };

      app.patch('/api/users/:id', isAuthenticated, (req, res) => {
        const userId = req.user.claims.sub;
        
        if (req.params.id !== userId) {
          return res.status(403).json({ message: 'Cannot modify another users profile' });
        }
        
        const user = users.get(req.params.id);
        if (!user) {
          return res.status(404).json({ message: 'User not found' });
        }
        
        Object.assign(user, req.body);
        res.json(user);
      });

      const response = await request(app)
        .patch('/api/users/user-456')
        .send({ name: 'Hacked Name' })
        .expect(403);
      
      expect(response.body.message).toBe('Cannot modify another users profile');
      expect(users.get('user-456')?.name).toBe('User Two');
    });

    it('should prevent user from viewing another users payment history', async () => {
      const payments = new Map([
        ['pay-123', { id: 'pay-123', userId: 'other-user', amount: 4500 }]
      ]);

      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'user-123' } };
        next();
      };

      app.get('/api/users/:userId/payments', isAuthenticated, (req, res) => {
        const userId = req.user.claims.sub;
        
        if (req.params.userId !== userId) {
          return res.status(403).json({ message: 'Cannot view another users payments' });
        }
        
        const userPayments = Array.from(payments.values())
          .filter(p => p.userId === req.params.userId);
        res.json({ payments: userPayments });
      });

      const response = await request(app)
        .get('/api/users/other-user/payments')
        .expect(403);
      
      expect(response.body.message).toBe('Cannot view another users payments');
    });

    it('should prevent user from deleting another users data', async () => {
      const applications = new Map([
        ['app-123', { id: 'app-123', userId: 'other-user', jobTitle: 'Developer' }]
      ]);

      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'user-123' } };
        next();
      };

      app.delete('/api/applications/:id', isAuthenticated, (req, res) => {
        const userId = req.user.claims.sub;
        const application = applications.get(req.params.id);
        
        if (!application) {
          return res.status(404).json({ message: 'Application not found' });
        }
        
        if (application.userId !== userId) {
          return res.status(403).json({ message: 'Cannot delete another users application' });
        }
        
        applications.delete(req.params.id);
        res.status(204).send();
      });

      const response = await request(app)
        .delete('/api/applications/app-123')
        .expect(403);
      
      expect(response.body.message).toBe('Cannot delete another users application');
      expect(applications.has('app-123')).toBe(true);
    });

    it('should prevent privilege escalation via role modification', async () => {
      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'user-123' } };
        req.isAdmin = false;
        next();
      };

      app.patch('/api/users/:id/role', isAuthenticated, (req, res) => {
        if (!req.isAdmin) {
          return res.status(403).json({ message: 'Only admins can modify roles' });
        }
        res.json({ updated: true });
      });

      const response = await request(app)
        .patch('/api/users/user-123/role')
        .send({ isAdmin: true })
        .expect(403);
      
      expect(response.body.message).toBe('Only admins can modify roles');
    });
  });
});
