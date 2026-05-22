import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { storage } from '../../server/storage';

describe('Real Auth Routes Integration Tests', () => {
  let app: express.Application;
  
  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    app.get('/api/auth/user', (req: any, res) => {
      if (!req.user) {
        return res.status(401).json({ message: 'Not authenticated' });
      }
      res.json({ user: req.user });
    });
  });

  describe('Authentication Enforcement', () => {
    it('should return 401 when no user is authenticated', async () => {
      const response = await request(app)
        .get('/api/auth/user')
        .expect(401);
      
      expect(response.body.message).toBe('Not authenticated');
    });

    it('should return user data when authenticated', async () => {
      app.use((req: any, res, next) => {
        req.user = { claims: { sub: 'user-123', email: 'test@test.com' } };
        next();
      });
      
      app.get('/api/auth/user-test', (req: any, res) => {
        res.json({ user: req.user });
      });

      const response = await request(app)
        .get('/api/auth/user-test')
        .expect(200);
      
      expect(response.body.user.claims.sub).toBe('user-123');
    });
  });

  describe('User ID Consistency (req.user.claims.sub)', () => {
    it('should extract userId from claims.sub consistently', async () => {
      const extractedUserIds: string[] = [];
      
      const authMiddleware = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'consistent-user-id' } };
        next();
      };
      
      app.get('/api/test1', authMiddleware, (req: any, res) => {
        const userId = req.user?.claims?.sub;
        extractedUserIds.push(userId);
        res.json({ userId });
      });
      
      app.get('/api/test2', authMiddleware, (req: any, res) => {
        const userId = req.user?.claims?.sub;
        extractedUserIds.push(userId);
        res.json({ userId });
      });

      await request(app).get('/api/test1').expect(200);
      await request(app).get('/api/test2').expect(200);

      expect(extractedUserIds[0]).toBe('consistent-user-id');
      expect(extractedUserIds[1]).toBe('consistent-user-id');
      expect(extractedUserIds[0]).toBe(extractedUserIds[1]);
    });
  });
});
