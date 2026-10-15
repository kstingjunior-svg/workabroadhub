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

  // 2026-10 (customer dancanmwangi008 saw raw JSON "Authentication
  // required" when clicking a protected link). Detect whether the caller
  // is a browser (navigating directly) vs an API client (fetch / XHR /
  // mobile app) and respond appropriately:
  //   • Browser visiting a protected URL → 302 redirect to landing page
  //     with ?signin=1 so the login modal opens and ?redirect= so they
  //     land back on the original page after signing in.
  //   • API/XHR/fetch client → keep the JSON contract so our React
  //     frontend's existing error-handling still works.
  // Detection: a real browser navigation sends
  //   Accept: text/html,application/xhtml+xml,...
  // whereas fetch/XHR defaults to Accept: */* (and sometimes application/json).
  // We only redirect when text/html is EXPLICITLY in Accept AND the method
  // is GET (don't redirect form POSTs — those should still get the JSON).
  const acceptsHtml = String(req.headers.accept || "").includes("text/html");
  if (req.method === "GET" && acceptsHtml) {
    const redirectBack = encodeURIComponent(req.originalUrl || "/");
    return res.redirect(302, `/?signin=1&redirect=${redirectBack}`);
  }

  return res.status(401).json({ message: "Authentication required.", code: "UNAUTHENTICATED" });
};
