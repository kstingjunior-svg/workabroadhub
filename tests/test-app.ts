import express from 'express';
import { storage } from '../server/storage';

export function createTestApp() {
  const app = express();
  app.use(express.json());
  
  return app;
}

export function mockAuthentication(req: any, userId: string | null, isAdmin: boolean = false) {
  if (userId) {
    req.user = {
      claims: {
        sub: userId,
        email: `${userId}@test.com`,
        name: 'Test User',
      },
    };
    req.isAdmin = isAdmin;
  } else {
    req.user = null;
  }
}

export function createAuthMiddleware(userId: string | null, isAdmin: boolean = false) {
  return (req: any, res: any, next: any) => {
    if (userId) {
      req.user = {
        claims: {
          sub: userId,
          email: `${userId}@test.com`,
          name: 'Test User',
        },
      };
      req.isAdmin = isAdmin;
    } else {
      req.user = null;
    }
    next();
  };
}

export { storage };
