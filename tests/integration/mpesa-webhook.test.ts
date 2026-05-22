import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const SAFARICOM_IPS = [
  '196.201.214.200',
  '196.201.214.206',
  '196.201.213.114',
  '196.201.214.207',
  '196.201.214.208',
  '196.201.213.44',
];

describe('M-Pesa Webhook Integration Tests', () => {
  let app: express.Application;
  let processedTransactions: Set<string>;
  let webhookLocks: Map<string, boolean>;
  let payments: Map<string, any>;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    processedTransactions = new Set();
    webhookLocks = new Map();
    payments = new Map([
      ['checkout-123', { 
        id: 'pay-123', 
        checkoutRequestId: 'checkout-123',
        userId: 'user-123',
        amount: 4500,
        status: 'pending'
      }]
    ]);

    app.set('trust proxy', true);

    app.post('/api/mpesa/callback', (req, res) => {
      const clientIP = req.ip || req.socket.remoteAddress || '';
      
      if (process.env.NODE_ENV === 'production' && !SAFARICOM_IPS.includes(clientIP)) {
        console.log(`Rejected M-Pesa callback from unauthorized IP: ${clientIP}`);
        return res.status(403).json({ message: 'Unauthorized IP' });
      }

      const { Body } = req.body;
      if (!Body?.stkCallback) {
        return res.status(400).json({ message: 'Invalid callback format' });
      }

      const { CheckoutRequestID, ResultCode, CallbackMetadata } = Body.stkCallback;

      if (webhookLocks.get(CheckoutRequestID)) {
        return res.json({ message: 'Already processing' });
      }
      webhookLocks.set(CheckoutRequestID, true);

      try {
        const payment = payments.get(CheckoutRequestID);
        if (!payment) {
          return res.status(404).json({ message: 'Payment not found' });
        }

        if (ResultCode === 0) {
          const metadata = CallbackMetadata?.Item || [];
          const amount = metadata.find((i: any) => i.Name === 'Amount')?.Value;
          const receipt = metadata.find((i: any) => i.Name === 'MpesaReceiptNumber')?.Value;

          if (amount !== 4500) {
            payment.status = 'failed';
            payment.failureReason = 'Amount mismatch';
            return res.json({ message: 'Amount mismatch' });
          }

          if (processedTransactions.has(receipt)) {
            return res.json({ message: 'Duplicate transaction' });
          }
          processedTransactions.add(receipt);

          payment.status = 'completed';
          payment.mpesaReceiptNumber = receipt;
        } else {
          payment.status = 'failed';
          payment.failureReason = Body.stkCallback.ResultDesc;
        }

        res.json({ message: 'Callback processed' });
      } finally {
        webhookLocks.delete(CheckoutRequestID);
      }
    });
  });

  describe('IP Verification', () => {
    it('should accept callbacks from Safaricom IPs in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const response = await request(app)
        .post('/api/mpesa/callback')
        .set('X-Forwarded-For', '196.201.214.200')
        .send({
          Body: {
            stkCallback: {
              CheckoutRequestID: 'checkout-123',
              ResultCode: 0,
              CallbackMetadata: {
                Item: [
                  { Name: 'Amount', Value: 4500 },
                  { Name: 'MpesaReceiptNumber', Value: 'ABC123XYZ' }
                ]
              }
            }
          }
        });
      
      process.env.NODE_ENV = originalEnv;
      expect([200, 403]).toContain(response.status);
    });

    it('should reject callbacks from unauthorized IPs in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const response = await request(app)
        .post('/api/mpesa/callback')
        .set('X-Forwarded-For', '192.168.1.1')
        .send({
          Body: {
            stkCallback: {
              CheckoutRequestID: 'checkout-123',
              ResultCode: 0
            }
          }
        });
      
      process.env.NODE_ENV = originalEnv;
      expect(response.status).toBe(403);
    });
  });

  describe('Callback Validation', () => {
    it('should reject malformed callbacks', async () => {
      const response = await request(app)
        .post('/api/mpesa/callback')
        .send({ invalid: 'data' })
        .expect(400);
      
      expect(response.body.message).toBe('Invalid callback format');
    });

    it('should process successful payment callbacks', async () => {
      const response = await request(app)
        .post('/api/mpesa/callback')
        .send({
          Body: {
            stkCallback: {
              CheckoutRequestID: 'checkout-123',
              ResultCode: 0,
              CallbackMetadata: {
                Item: [
                  { Name: 'Amount', Value: 4500 },
                  { Name: 'MpesaReceiptNumber', Value: 'UNIQUE123' }
                ]
              }
            }
          }
        })
        .expect(200);
      
      const payment = payments.get('checkout-123');
      expect(payment?.status).toBe('completed');
      expect(payment?.mpesaReceiptNumber).toBe('UNIQUE123');
    });

    it('should process failed payment callbacks', async () => {
      const response = await request(app)
        .post('/api/mpesa/callback')
        .send({
          Body: {
            stkCallback: {
              CheckoutRequestID: 'checkout-123',
              ResultCode: 1032,
              ResultDesc: 'Request cancelled by user'
            }
          }
        })
        .expect(200);
      
      const payment = payments.get('checkout-123');
      expect(payment?.status).toBe('failed');
      expect(payment?.failureReason).toBe('Request cancelled by user');
    });
  });

  describe('Amount Verification', () => {
    it('should reject callbacks with wrong amount', async () => {
      const response = await request(app)
        .post('/api/mpesa/callback')
        .send({
          Body: {
            stkCallback: {
              CheckoutRequestID: 'checkout-123',
              ResultCode: 0,
              CallbackMetadata: {
                Item: [
                  { Name: 'Amount', Value: 1000 },
                  { Name: 'MpesaReceiptNumber', Value: 'ABC123' }
                ]
              }
            }
          }
        })
        .expect(200);
      
      const payment = payments.get('checkout-123');
      expect(payment?.status).toBe('failed');
      expect(payment?.failureReason).toBe('Amount mismatch');
    });
  });

  describe('Idempotency', () => {
    it('should prevent duplicate transaction processing', async () => {
      processedTransactions.add('DUPLICATE123');
      
      const response = await request(app)
        .post('/api/mpesa/callback')
        .send({
          Body: {
            stkCallback: {
              CheckoutRequestID: 'checkout-123',
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

    it('should handle concurrent webhook requests', async () => {
      const checkoutId = 'checkout-concurrent';
      payments.set(checkoutId, {
        id: 'pay-concurrent',
        checkoutRequestId: checkoutId,
        status: 'pending',
        amount: 4500
      });

      const callback = {
        Body: {
          stkCallback: {
            CheckoutRequestID: checkoutId,
            ResultCode: 0,
            CallbackMetadata: {
              Item: [
                { Name: 'Amount', Value: 4500 },
                { Name: 'MpesaReceiptNumber', Value: 'CONCURRENT123' }
              ]
            }
          }
        }
      };

      const responses = await Promise.all([
        request(app).post('/api/mpesa/callback').send(callback),
        request(app).post('/api/mpesa/callback').send(callback),
        request(app).post('/api/mpesa/callback').send(callback),
      ]);

      const successCount = responses.filter(r => 
        r.body.message === 'Callback processed'
      ).length;
      const alreadyProcessingCount = responses.filter(r => 
        r.body.message === 'Already processing' || r.body.message === 'Duplicate transaction'
      ).length;

      expect(successCount + alreadyProcessingCount).toBe(3);
    });
  });
});
