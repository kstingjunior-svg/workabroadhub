import { vi } from 'vitest';

export const mockUser = {
  id: 'test-user-123',
  claims: {
    sub: 'test-user-123',
    email: 'test@example.com',
    name: 'Test User',
  },
};

export const mockAdminUser = {
  id: 'admin-user-123',
  claims: {
    sub: 'admin-user-123',
    email: 'admin@example.com',
    name: 'Admin User',
  },
};

export const mockMpesaCallback = {
  Body: {
    stkCallback: {
      MerchantRequestID: 'test-merchant-123',
      CheckoutRequestID: 'test-checkout-123',
      ResultCode: 0,
      ResultDesc: 'The service request is processed successfully.',
      CallbackMetadata: {
        Item: [
          { Name: 'Amount', Value: 4500 },
          { Name: 'MpesaReceiptNumber', Value: 'ABC123XYZ' },
          { Name: 'TransactionDate', Value: 20260131123456 },
          { Name: 'PhoneNumber', Value: 254712345678 },
        ],
      },
    },
  },
};

export const mockFailedMpesaCallback = {
  Body: {
    stkCallback: {
      MerchantRequestID: 'test-merchant-456',
      CheckoutRequestID: 'test-checkout-456',
      ResultCode: 1032,
      ResultDesc: 'Request cancelled by user',
    },
  },
};

export function createMockRequest(overrides: any = {}) {
  return {
    user: null,
    body: {},
    params: {},
    query: {},
    headers: {},
    ip: '127.0.0.1',
    ...overrides,
  };
}

export function createMockResponse() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

export const SAFARICOM_IPS = [
  '196.201.214.200',
  '196.201.214.206',
  '196.201.213.114',
  '196.201.214.207',
  '196.201.214.208',
  '196.201.213.44',
  '196.201.212.127',
  '196.201.212.128',
  '196.201.212.129',
  '196.201.212.132',
  '196.201.212.136',
  '196.201.212.138',
];

export const EXPECTED_PAYMENT_AMOUNT = 4500;
