import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { pool } from '../db';

const PgSession = connectPgSimple(session);

let sessionParser: express.RequestHandler;

export function setupAuth(app: express.Application) {
  sessionParser = session({
    store: new PgSession({ pool, tableName: 'sessions' }),
    secret: process.env.SESSION_SECRET || 'fallback-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  });
  app.use(sessionParser);
}

export function registerAuthRoutes(app: express.Application) {
  // Auth routes handled by custom auth system
}

export function getSessionParser() {
  return sessionParser;
}

export const isAuthenticated: express.RequestHandler = (req: any, res, next) => {
  if (req.session?.customUserId || req.user) return next();
  res.status(401).json({ message: 'Unauthorized' });
};
