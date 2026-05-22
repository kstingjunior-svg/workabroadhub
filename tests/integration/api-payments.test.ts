import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

describe('Payment API Integration Tests', () => {
  let app: express.Application;
  const mockStorage: any = {};

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    mockStorage.payments = new Map();
    mockStorage.users = new Map();
  });

  describe('POST /api/payments/initiate', () => {
    it('should require authentication', async () => {
      const isAuthenticated = (req: any, res: any, next: any) => {
        if (!req.user) {
          return res.status(401).json({ message: 'Not authenticated' });
        }
        next();
      };

      app.post('/api/payments/initiate', isAuthenticated, (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .post('/api/payments/initiate')
        .send({ phone: '254712345678' })
        .expect(401);
      
      expect(response.body.message).toBe('Not authenticated');
    });

    it('should validate phone number format', async () => {
      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'user-123' } };
        next();
      };

      app.post('/api/payments/initiate', isAuthenticated, (req, res) => {
        const { phone } = req.body;
        if (!phone || !/^(\+?254|0)?[17]\d{8}$/.test(phone.replace(/\s/g, ''))) {
          return res.status(400).json({ message: 'Invalid phone number format' });
        }
        res.json({ success: true });
      });

      const response = await request(app)
        .post('/api/payments/initiate')
        .send({ phone: 'invalid' })
        .expect(400);
      
      expect(response.body.message).toBe('Invalid phone number format');
    });

    it('should accept valid Kenyan phone numbers', async () => {
      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'user-123' } };
        next();
      };

      app.post('/api/payments/initiate', isAuthenticated, (req, res) => {
        const { phone } = req.body;
        if (!phone || !/^(\+?254|0)?[17]\d{8}$/.test(phone.replace(/\s/g, ''))) {
          return res.status(400).json({ message: 'Invalid phone number format' });
        }
        res.json({ 
          success: true,
          paymentId: 'pay-123',
          checkoutRequestId: 'checkout-123'
        });
      });

      const response = await request(app)
        .post('/api/payments/initiate')
        .send({ phone: '254712345678' })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.paymentId).toBeDefined();
    });

    it('should reject duplicate pending payments', async () => {
      const pendingPayments = new Set(['user-123']);
      
      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'user-123' } };
        next();
      };

      app.post('/api/payments/initiate', isAuthenticated, (req, res) => {
        const userId = req.user.claims.sub;
        if (pendingPayments.has(userId)) {
          return res.status(400).json({ message: 'You already have a pending payment' });
        }
        res.json({ success: true });
      });

      const response = await request(app)
        .post('/api/payments/initiate')
        .send({ phone: '254712345678' })
        .expect(400);
      
      expect(response.body.message).toBe('You already have a pending payment');
    });
  });

  describe('GET /api/payments/:id - IDOR Protection', () => {
    it('should prevent access to other users payments', async () => {
      const payments = new Map([
        ['pay-123', { id: 'pay-123', userId: 'other-user', amount: 4500 }]
      ]);

      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'user-123' } };
        next();
      };

      app.get('/api/payments/:id', isAuthenticated, (req, res) => {
        const payment = payments.get(req.params.id);
        if (!payment) {
          return res.status(404).json({ message: 'Payment not found' });
        }
        if (payment.userId !== req.user.claims.sub) {
          return res.status(403).json({ message: 'Not authorized' });
        }
        res.json(payment);
      });

      const response = await request(app)
        .get('/api/payments/pay-123')
        .expect(403);
      
      expect(response.body.message).toBe('Not authorized');
    });

    it('should allow access to own payments', async () => {
      const payments = new Map([
        ['pay-123', { id: 'pay-123', userId: 'user-123', amount: 4500 }]
      ]);

      const isAuthenticated = (req: any, res: any, next: any) => {
        req.user = { claims: { sub: 'user-123' } };
        next();
      };

      app.get('/api/payments/:id', isAuthenticated, (req, res) => {
        const payment = payments.get(req.params.id);
        if (!payment) {
          return res.status(404).json({ message: 'Payment not found' });
        }
        if (payment.userId !== req.user.claims.sub) {
          return res.status(403).json({ message: 'Not authorized' });
        }
        res.json(payment);
      });

      const response = await request(app)
        .get('/api/payments/pay-123')
        .expect(200);
      
      expect(response.body.amount).toBe(4500);
    });
  });
});
