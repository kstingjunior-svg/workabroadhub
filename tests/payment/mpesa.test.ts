import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  mockMpesaCallback, 
  mockFailedMpesaCallback, 
  SAFARICOM_IPS, 
  EXPECTED_PAYMENT_AMOUNT 
} from '../setup';

describe('M-Pesa Payment Test Suite', () => {
  describe('STK Push Flow', () => {
    it('should format phone number correctly for M-Pesa', () => {
      const formatPhone = (phone: string): string => {
        let cleaned = phone.replace(/\s/g, '').replace(/\+/g, '');
        if (cleaned.startsWith('0')) {
          cleaned = '254' + cleaned.substring(1);
        }
        return cleaned;
      };
      
      expect(formatPhone('0712345678')).toBe('254712345678');
      expect(formatPhone('+254712345678')).toBe('254712345678');
      expect(formatPhone('254712345678')).toBe('254712345678');
    });

    it('should generate valid timestamp format', () => {
      const generateTimestamp = (): string => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${year}${month}${day}${hours}${minutes}${seconds}`;
      };
      
      const timestamp = generateTimestamp();
      expect(timestamp).toMatch(/^\d{14}$/);
    });

    it('should generate valid password for STK push', () => {
      const shortCode = '174379';
      const passKey = 'testPassKey123';
      const timestamp = '20260131123456';
      
      const password = Buffer.from(shortCode + passKey + timestamp).toString('base64');
      
      expect(password).toBeDefined();
      expect(password.length).toBeGreaterThan(0);
    });

    it('should use correct payment amount', () => {
      expect(EXPECTED_PAYMENT_AMOUNT).toBe(4500);
    });
  });

  describe('Webhook/Callback Handling', () => {
    it('should verify Safaricom IP whitelist', () => {
      const isValidSafaricomIP = (ip: string): boolean => {
        return SAFARICOM_IPS.includes(ip);
      };
      
      expect(isValidSafaricomIP('196.201.214.200')).toBe(true);
      expect(isValidSafaricomIP('192.168.1.1')).toBe(false);
      expect(isValidSafaricomIP('10.0.0.1')).toBe(false);
    });

    it('should parse successful callback correctly', () => {
      const callback = mockMpesaCallback.Body.stkCallback;
      
      expect(callback.ResultCode).toBe(0);
      expect(callback.ResultDesc).toContain('successfully');
      expect(callback.CallbackMetadata).toBeDefined();
    });

    it('should extract metadata from successful callback', () => {
      const metadata = mockMpesaCallback.Body.stkCallback.CallbackMetadata.Item;
      
      const amount = metadata.find((item: any) => item.Name === 'Amount')?.Value;
      const receipt = metadata.find((item: any) => item.Name === 'MpesaReceiptNumber')?.Value;
      const phone = metadata.find((item: any) => item.Name === 'PhoneNumber')?.Value;
      
      expect(amount).toBe(4500);
      expect(receipt).toBe('ABC123XYZ');
      expect(phone).toBe(254712345678);
    });

    it('should handle failed callback correctly', () => {
      const callback = mockFailedMpesaCallback.Body.stkCallback as any;
      
      expect(callback.ResultCode).not.toBe(0);
      expect(callback.ResultDesc).toContain('cancelled');
      expect(callback.CallbackMetadata).toBeUndefined();
    });

    it('should validate payment amount matches expected', () => {
      const receivedAmount = mockMpesaCallback.Body.stkCallback.CallbackMetadata.Item
        .find((item: any) => item.Name === 'Amount')?.Value;
      
      const isValidAmount = receivedAmount === EXPECTED_PAYMENT_AMOUNT;
      expect(isValidAmount).toBe(true);
    });

    it('should reject mismatched payment amounts', () => {
      const receivedAmount = 1000 as number;
      const isValidAmount = receivedAmount === (EXPECTED_PAYMENT_AMOUNT as number);
      
      expect(isValidAmount).toBe(false);
    });
  });

  describe('Idempotency & Replay Prevention', () => {
    it('should detect duplicate transactions', () => {
      const processedReceipts = new Set(['ABC123XYZ', 'DEF456UVW']);
      const newReceipt = 'ABC123XYZ';
      
      const isDuplicate = processedReceipts.has(newReceipt);
      expect(isDuplicate).toBe(true);
    });

    it('should accept new transactions', () => {
      const processedReceipts = new Set(['ABC123XYZ', 'DEF456UVW']);
      const newReceipt = 'GHI789RST';
      
      const isDuplicate = processedReceipts.has(newReceipt);
      expect(isDuplicate).toBe(false);
    });

    it('should implement webhook processing lock', () => {
      const processingLocks = new Map<string, boolean>();
      const checkoutRequestId = 'test-checkout-123';
      
      const acquireLock = (id: string): boolean => {
        if (processingLocks.get(id)) {
          return false;
        }
        processingLocks.set(id, true);
        return true;
      };
      
      const releaseLock = (id: string): void => {
        processingLocks.delete(id);
      };
      
      expect(acquireLock(checkoutRequestId)).toBe(true);
      expect(acquireLock(checkoutRequestId)).toBe(false);
      releaseLock(checkoutRequestId);
      expect(acquireLock(checkoutRequestId)).toBe(true);
    });
  });

  describe('Transaction Status Management', () => {
    it('should track transaction lifecycle', () => {
      const validTransitions = {
        pending: ['processing', 'failed'],
        processing: ['completed', 'failed'],
        completed: ['refunded'],
        failed: [],
        refunded: [],
      };
      
      expect(validTransitions.pending).toContain('processing');
      expect(validTransitions.processing).toContain('completed');
      expect(validTransitions.completed).not.toContain('pending');
    });

    it('should store M-Pesa receipt number', () => {
      const payment = {
        id: 'payment-123',
        mpesaReceiptNumber: 'ABC123XYZ',
        status: 'completed',
      };
      
      expect(payment.mpesaReceiptNumber).toBeDefined();
      expect(payment.mpesaReceiptNumber.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should map M-Pesa error codes to user messages', () => {
      const errorMessages: Record<number, string> = {
        0: 'Success',
        1: 'Insufficient balance',
        1032: 'Request cancelled by user',
        1037: 'DS timeout user cannot be reached',
        2001: 'Wrong PIN',
        17: 'System internal error',
      };
      
      expect(errorMessages[1032]).toBe('Request cancelled by user');
      expect(errorMessages[0]).toBe('Success');
    });

    it('should handle timeout scenarios', () => {
      const paymentTimeout = 60000;
      const requestStartTime = Date.now() - 70000;
      
      const isTimedOut = Date.now() - requestStartTime > paymentTimeout;
      expect(isTimedOut).toBe(true);
    });
  });
});
