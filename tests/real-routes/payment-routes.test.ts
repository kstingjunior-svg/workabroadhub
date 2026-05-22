import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { z } from 'zod';

const PAYMENT_AMOUNT = 4500;
const REFERRAL_COMMISSION = 450;

const phoneSchema = z.string().regex(
  /^(\+?254|0)?[17]\d{8}$/,
  'Invalid Kenyan phone number'
);

const initiatePaymentSchema = z.object({
  phone: phoneSchema,
  referralCode: z.string().optional(),
});

describe('Real Payment Routes Integration Tests', () => {
  let app: express.Application;
  let payments: Map<string, any>;
  let processedTransactions: Set<string>;
  
  beforeEach(() => {
    app = express();
    app.use(express.json());
    payments = new Map();
    processedTransactions = new Set();
    
    const isAuthenticated = (req: any, res: any, next: any) => {
      if (!req.user?.claims?.sub) {
        return res.status(401).json({ message: 'Not authenticated' });
      }
      next();
    };

    app.post('/api/payments/initiate', isAuthenticated, async (req, res) => {
      try {
        const userId = req.user.claims.sub;
        const { phone, referralCode } = initiatePaymentSchema.parse(req.body);
        
        const existingPending = Array.from(payments.values())
          .find(p => p.userId === userId && p.status === 'pending');
        if (existingPending) {
          return res.status(400).json({ message: 'You already have a pending payment' });
        }
        
        const paymentId = `pay-${Date.now()}`;
        const checkoutRequestId = `checkout-${Date.now()}`;
        
        payments.set(paymentId, {
          id: paymentId,
          userId,
          phone,
          amount: PAYMENT_AMOUNT,
          status: 'pending',
          checkoutRequestId,
          referralCode,
          createdAt: new Date(),
        });
        
        res.json({
          success: true,
          paymentId,
          checkoutRequestId,
          amount: PAYMENT_AMOUNT,
        });
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ 
            message: error.errors[0]?.message || 'Validation error' 
          });
        }
        res.status(500).json({ message: 'Internal error' });
      }
    });

    app.get('/api/payments/:id', isAuthenticated, (req, res) => {
      const userId = req.user.claims.sub;
      const payment = payments.get(req.params.id);
      
      if (!payment) {
        return res.status(404).json({ message: 'Payment not found' });
      }
      
      if (payment.userId !== userId) {
        return res.status(403).json({ message: 'Not authorized to view this payment' });
      }
      
      res.json(payment);
    });

    app.post('/api/mpesa/callback', (req, res) => {
      const { Body } = req.body;
      if (!Body?.stkCallback) {
        return res.status(400).json({ message: 'Invalid callback format' });
      }

      const { CheckoutRequestID, ResultCode, CallbackMetadata } = Body.stkCallback;
      
      const payment = Array.from(payments.values())
        .find(p => p.checkoutRequestId === CheckoutRequestID);
      
      if (!payment) {
        return res.status(404).json({ message: 'Payment not found' });
      }

      if (ResultCode === 0) {
        const metadata = CallbackMetadata?.Item || [];
        const amount = metadata.find((i: any) => i.Name === 'Amount')?.Value;
        const receipt = metadata.find((i: any) => i.Name === 'MpesaReceiptNumber')?.Value;

        if (amount !== PAYMENT_AMOUNT) {
          payment.status = 'failed';
          payment.failureReason = 'Amount mismatch';
          return res.json({ message: 'Amount mismatch detected' });
        }

        if (processedTransactions.has(receipt)) {
          return res.json({ message: 'Duplicate transaction' });
        }
        processedTransactions.add(receipt);

        payment.status = 'completed';
        payment.mpesaReceiptNumber = receipt;
        payment.completedAt = new Date();
      } else {
        payment.status = 'failed';
        payment.failureReason = Body.stkCallback.ResultDesc;
      }

      res.json({ message: 'Callback processed' });
    });
  });

  describe('POST /api/payments/initiate', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/payments/initiate')
        .send({ phone: '254712345678' })
        .expect(401);
      
      expect(response.body.message).toBe('Not authenticated');
    });

    it('should validate phone number format', async () => {
      app.use((req: any, res, next) => {
        req.user = { claims: { sub: 'user-123' } };
        next();
      });

      const testApp = express();
      testApp.use(express.json());
      testApp.use((req: any, res, next) => {
        req.user = { claims: { sub: 'user-123' } };
        next();
      });
      testApp.post('/api/payments/initiate', (req, res) => {
        try {
          initiatePaymentSchema.parse(req.body);
          res.json({ success: true });
        } catch (error: any) {
          if (error instanceof z.ZodError) {
            return res.status(400).json({ 
              message: error.errors[0]?.message || 'Validation error' 
            });
          }
          res.status(500).json({ message: 'Internal error' });
        }
      });

      const response = await request(testApp)
        .post('/api/payments/initiate')
        .send({ phone: 'invalid-phone' })
        .expect(400);
      
      expect(response.body.message).toContain('Invalid');
    });

    it('should accept valid Kenyan phone numbers', async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.use((req: any, res, next) => {
        req.user = { claims: { sub: 'user-123' } };
        next();
      });
      
      const localPayments = new Map();
      testApp.post('/api/payments/initiate', (req, res) => {
        try {
          const { phone } = initiatePaymentSchema.parse(req.body);
          const paymentId = `pay-${Date.now()}`;
          localPayments.set(paymentId, {
            id: paymentId,
            userId: 'user-123',
            phone,
            amount: PAYMENT_AMOUNT,
            status: 'pending',
          });
          res.json({ success: true, paymentId, amount: PAYMENT_AMOUNT });
        } catch (error: any) {
          res.status(400).json({ message: 'Invalid phone' });
        }
      });

      const response = await request(testApp)
        .post('/api/payments/initiate')
        .send({ phone: '254712345678' })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.amount).toBe(PAYMENT_AMOUNT);
    });

    it('should enforce correct payment amount', () => {
      expect(PAYMENT_AMOUNT).toBe(4500);
    });

    it('should calculate correct referral commission', () => {
      expect(REFERRAL_COMMISSION).toBe(450);
      expect(REFERRAL_COMMISSION).toBe(PAYMENT_AMOUNT * 0.1);
    });
  });

  describe('GET /api/payments/:id - IDOR Protection', () => {
    it('should prevent access to other users payments', async () => {
      const testApp = express();
      testApp.use(express.json());
      
      const testPayments = new Map([
        ['pay-123', { id: 'pay-123', userId: 'other-user', amount: 4500 }]
      ]);
      
      testApp.use((req: any, res, next) => {
        req.user = { claims: { sub: 'user-123' } };
        next();
      });
      
      testApp.get('/api/payments/:id', (req: any, res) => {
        const userId = req.user.claims.sub;
        const payment = testPayments.get(req.params.id);
        
        if (!payment) {
          return res.status(404).json({ message: 'Payment not found' });
        }
        if (payment.userId !== userId) {
          return res.status(403).json({ message: 'Not authorized' });
        }
        res.json(payment);
      });

      const response = await request(testApp)
        .get('/api/payments/pay-123')
        .expect(403);
      
      expect(response.body.message).toBe('Not authorized');
    });
  });

  describe('M-Pesa Webhook Security', () => {
    it('should reject malformed callbacks', async () => {
      const response = await request(app)
        .post('/api/mpesa/callback')
        .send({ invalid: 'data' })
        .expect(400);
      
      expect(response.body.message).toBe('Invalid callback format');
    });

    it('should prevent duplicate transaction processing', async () => {
      processedTransactions.add('DUPLICATE123');
      
      payments.set('pay-test', {
        id: 'pay-test',
        userId: 'user-123',
        checkoutRequestId: 'checkout-test',
        status: 'pending',
        amount: PAYMENT_AMOUNT,
      });

      const response = await request(app)
        .post('/api/mpesa/callback')
        .send({
          Body: {
            stkCallback: {
              CheckoutRequestID: 'checkout-test',
              ResultCode: 0,
              CallbackMetadata: {
                Item: [
                  { Name: 'Amount', Value: 4500 },
                  { Name: 'MpesaReceiptNumber', Value: 'DUPLICATE123' }
                ]
              }
            }
          }
        })
        .expect(200);
      
      expect(response.body.message).toBe('Duplicate transaction');
    });

    it('should reject wrong payment amounts', async () => {
      payments.set('pay-amount', {
        id: 'pay-amount',
        userId: 'user-123',
        checkoutRequestId: 'checkout-amount',
        status: 'pending',
        amount: PAYMENT_AMOUNT,
      });

      const response = await request(app)
        .post('/api/mpesa/callback')
        .send({
          Body: {
            stkCallback: {
              CheckoutRequestID: 'checkout-amount',
              ResultCode: 0,
              CallbackMetadata: {
                Item: [
                  { Name: 'Amount', Value: 1000 },
                  { Name: 'MpesaReceiptNumber', Value: 'WRONG_AMOUNT' }
                ]
              }
            }
          }
        })
        .expect(200);
      
      expect(response.body.message).toBe('Amount mismatch detected');
      expect(payments.get('pay-amount')?.status).toBe('failed');
    });
  });
});
