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
function getSession() {
  return session({
    secret: process.env.SESSION_SECRET!,
    store: new pgStore({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: false,
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
export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/register", async (req: any, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;
      if (!email || !password) return res.status(400).json({ message: "Email and password required" });
      const bcrypt = await import("bcryptjs");
      const { storage } = await import("../storage");
      const existing = await storage.getUserByEmail(email);
      if (existing) return res.status(409).json({ message: "Email already registered" });
      const hash = await bcrypt.hash(password, 10);
      const user = await storage.createUser({ email, password: hash, firstName, lastName, authMethod: "email" });
      (req.session as any).customUserId = user.id;
      res.json({ id: user.id, email: user.email });
    } catch (err: any) {
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req: any, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ message: "Email and password required" });
      const bcrypt = await import("bcryptjs");
      const { storage } = await import("../storage");
      const user = await storage.getUserByEmail(email);
      if (!user || !user.password) return res.status(401).json({ message: "Invalid credentials" });
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(401).json({ message: "Invalid credentials" });
      (req.session as any).customUserId = user.id;
      res.json({ id: user.id, email: user.email });
    } catch (err: any) {
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req: any, res) => {
    req.session.destroy(() => res.json({ success: true }));
  });

  app.get("/api/auth/user", async (req: any, res) => {
    const userId = (req.session as any).customUserId;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const { storage } = await import("../storage");
    const user = await storage.getUserById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  });
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
