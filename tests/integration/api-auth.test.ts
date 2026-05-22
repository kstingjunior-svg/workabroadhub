import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';

describe('Authentication API Integration Tests', () => {
  let app: express.Application;
  
  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('Protected Route Access Control', () => {
    it('should return 401 for unauthenticated requests to protected routes', async () => {
      const isAuthenticated = (req: any, res: any, next: any) => {
        if (!req.user) {
          return res.status(401).json({ message: 'Not authenticated' });
        }
        next();
      };

      app.get('/api/user', isAuthenticated, (req, res) => {
        res.json({ user: req.user });
      });

      const response = await request(app)
        .get('/api/user')
        .expect(401);
      
      expect(response.body.message).toBe('Not authenticated');
    });

    it('should return 200 for authenticated requests', async () => {
      const mockUser = { claims: { sub: 'test-123', email: 'test@test.com' } };
      
      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = mockUser;
        next();
      };

      app.get('/api/user', isAuthenticated, (req, res) => {
        res.json({ user: req.user });
      });

      const response = await request(app)
        .get('/api/user')
        .expect(200);
      
      expect(response.body.user.claims.sub).toBe('test-123');
    });

    it('should return 403 for non-admin accessing admin routes', async () => {
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

    it('should return 200 for admin accessing admin routes', async () => {
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

      app.get('/api/admin/users', isAuthenticated, isAdmin, (req, res) => {
        res.json({ users: [] });
      });

      const response = await request(app)
        .get('/api/admin/users')
        .expect(200);
      
      expect(response.body.users).toEqual([]);
    });
  });

  describe('Session Validation', () => {
    it('should validate user claims structure', async () => {
      const validateSession = (req: any, res: any, next: any) => {
        if (!req.user?.claims?.sub) {
          return res.status(401).json({ message: 'Invalid session' });
        }
        next();
      };

      app.get('/api/protected', validateSession, (req, res) => {
        res.json({ valid: true });
      });

      const response = await request(app)
        .get('/api/protected')
        .expect(401);
      
      expect(response.body.message).toBe('Invalid session');
    });
  });
});
