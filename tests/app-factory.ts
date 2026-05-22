import express from 'express';
import { storage } from '../server/storage';

export function createTestAppWithMockAuth(mockUserId: string | null, isAdmin: boolean = false) {
  const app = express();
  app.use(express.json());
  
  app.use((req: any, res, next) => {
    if (mockUserId) {
      req.user = {
        claims: {
          sub: mockUserId,
          email: `${mockUserId}@test.com`,
          name: 'Test User',
        },
      };
      req.isAdmin = isAdmin;
    } else {
      req.user = null;
    }
    next();
  });
  
  return app;
}

export function isAuthenticated(req: any, res: any, next: any) {
  if (!req.user?.claims?.sub) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  next();
}

export function isAdmin(req: any, res: any, next: any) {
  if (!req.isAdmin) {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

export { storage };
