import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
const pgStore = connectPg(session);
let _sessionParser: RequestHandler | null = null;
export function getSessionParser(): RequestHandler {
  if (!_sessionParser) _sessionParser = getSession();
  return _sessionParser;
}
export function getSession() {
  return session({
    secret: process.env.SESSION_SECRET!,
    store: new pgStore({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true,
      ttl: 7 * 24 * 60 * 60,
      tableName: "sessions",
    }),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // `secure: true` requires the cookie to be sent only over HTTPS — fine
      // for production (workabroadhub.tech is HTTPS). Local dev over http://
      // would need this conditional, but tsx + Render always uses HTTPS.
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      // sameSite: "lax" is the correct setting for same-origin login flows
      // (frontend and API on the same domain). Previously this was "none",
      // which Chrome treats as a third-party cookie and blocks in incognito
      // mode + with third-party cookie restrictions — breaking the session
      // immediately after /api/auth/login. "lax" still allows the cookie on
      // top-level navigations and on same-origin XHR/fetch, which is what
      // the auth flow needs.
      sameSite: "lax",
    },
  });
}
export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSessionParser());
  app.use((req: any, _res: any, next: any) => {
    if (!req.session) {
      req.session = {
        regenerate: (cb: any) => cb(),
        save: (cb?: any) => { if (cb) cb(); },
        destroy: (cb?: any) => { if (cb) cb(); },
      } as any;
    } else {
      if (!req.session.regenerate) req.session.regenerate = (cb: any) => cb();
      if (!req.session.save) req.session.save = (cb?: any) => { if (cb) cb(); };
    }
    next();
  });
  app.use(passport.initialize());
  app.use(passport.session());
  passport.serializeUser((user: any, cb) => cb(null, user));
  passport.deserializeUser((user: any, cb) => cb(null, user));
}
export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const customUserId = (req.session as any).customUserId as string | undefined;
  if (customUserId) {
    (req as any).user = {
      id: customUserId,
      claims: { sub: customUserId },
    };
    return next();
  }
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ message: "Authentication required.", code: "UNAUTHENTICATED" });
};
