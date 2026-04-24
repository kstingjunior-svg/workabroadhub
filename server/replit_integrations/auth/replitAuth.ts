import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
      sameSite: "lax",
    },
  });
}

// Singleton session middleware shared between HTTP routes and the WebSocket server.
// Calling getSession() twice would open a second DB connection pool — avoid that.
let _sessionParser: RequestHandler | null = null;
export function getSessionParser(): RequestHandler {
  if (!_sessionParser) _sessionParser = getSession();
  return _sessionParser;
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  await authStorage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSessionParser()); // reuse singleton so WebSocket shares the same store

  // Passport 0.6.x compatibility: session stores that don't implement
  // regenerate/save will cause an uncaughtException. Patch them in as no-ops
  // so passport can call them safely.
  // Also guard against req.session being entirely undefined (can happen when the
  // session store fails silently, e.g. after a server restart invalidates the
  // session cookie) — in that case create a minimal stub so passport doesn't
  // throw "Cannot read properties of undefined (reading 'regenerate')".
  app.use((req: any, _res: any, next: any) => {
    if (!req.session) {
      // Provide a stub so passport internals don't crash; real auth will still
      // fail gracefully (401) because the stub carries no user data.
      req.session = {
        regenerate: (cb: (err?: any) => void) => cb(),
        save: (cb?: (err?: any) => void) => { if (cb) cb(); },
        destroy: (cb?: (err?: any) => void) => { if (cb) cb(); },
        reload: (cb?: (err?: any) => void) => { if (cb) cb(); },
      } as any;
    } else {
      if (!req.session.regenerate) {
        req.session.regenerate = (cb: (err?: any) => void) => cb();
      }
      if (!req.session.save) {
        req.session.save = (cb?: (err?: any) => void) => { if (cb) cb(); };
      }
    }
    next();
  });

  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    // Save user to DB — wrapped in try/catch so a transient DB error never
    // blocks login. The next successful callback attempt will retry the upsert.
    try {
      await upsertUser(tokens.claims());
    } catch (err: any) {
      console.error("[Auth] upsertUser failed (non-fatal):", err?.message ?? err);
    }
    verified(null, user);
  };

  // Keep track of registered strategies
  const registeredStrategies = new Set<string>();

  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    // Store return URL so user comes back to the right page after login
    const nextPath = req.query.next as string | undefined;
    if (nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")) {
      (req.session as any).returnTo = nextPath;
    }
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

// In-memory cache of Replit user IDs that have been synced to the DB this
// server session, so we don't hit the database on every single request.
const syncedReplitUsers = new Set<string>();

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  // ── Custom email/password session ─────────────────────────────────────────
  const customUserId = (req.session as any).customUserId as string | undefined;
  if (customUserId) {
    // Inject a synthetic user object so both req.user.id and req.user?.claims?.sub work
    (req as any).user = {
      id: customUserId,
      claims: { sub: customUserId },
      expires_at: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
    };
    return next();
  }

  // ── Replit OIDC session ───────────────────────────────────────────────────
  const user = req.user as any;

  if (!req.isAuthenticated() || !user?.expires_at) {
    const sessionId = (req.session as any)?.id?.slice(0, 8) ?? "none";
    console.warn(`[Auth] 401 on ${req.method} ${req.path} | sessionId=${sessionId} isAuthenticated=${req.isAuthenticated()} customUserId=${customUserId ?? "null"} oidcUser=${!!user} oidcExp=${user?.expires_at ?? "null"}`);
    // Only say "session expired" if the user had an OIDC session that is now gone.
    // For visitors who never logged in, return a plain unauthenticated response.
    const hadSession = !!(req.session as any)?.passport;
    const msg = hadSession
      ? "Your session has expired. Please sign in again."
      : "Authentication required.";
    const code = hadSession ? "SESSION_EXPIRED" : "UNAUTHENTICATED";
    return res.status(401).json({ message: msg, code });
  }

  // Synchronously ensure this Replit user exists in our DB (runs once per user per restart).
  // IMPORTANT: if an email/password account already exists with the same email, the upsert
  // returns that account's ID. We patch user.claims.sub to match the DB row ID so that ALL
  // downstream route handlers (profile, subscription, etc.) look up the correct record.
  // The patched session is re-saved so subsequent requests also carry the correct ID.
  const claimsId = user?.claims?.sub as string | undefined;
  if (claimsId && !syncedReplitUsers.has(claimsId)) {
    syncedReplitUsers.add(claimsId);
    try {
      const dbUser = await authStorage.upsertUser({
        id: claimsId,
        email: user.claims?.email,
        firstName: user.claims?.first_name,
        lastName: user.claims?.last_name,
        profileImageUrl: user.claims?.profile_image_url,
      });
      // If the email matched a pre-existing account with a different ID (e.g. user
      // registered via email/password then later logged in via Replit OIDC), patch
      // the session so every route sees the canonical DB user ID.
      if (dbUser && dbUser.id !== claimsId) {
        console.log(`[Auth] OIDC ID ${claimsId} → merged with existing account ${dbUser.id} (${dbUser.email})`);
        user.claims.sub = dbUser.id;
        // Persist the patched session — await so the next request sees the correct ID
        await new Promise<void>((resolve) => req.session.save(() => resolve()));
      }
    } catch (err: any) {
      syncedReplitUsers.delete(claimsId); // allow retry next request
      console.warn("[Auth] Sync upsert failed:", err?.message ?? err);
    }
  }

  // Always stamp req.user.id with the canonical DB id (claims.sub may have been patched above)
  user.id = user.claims?.sub ?? user.id;

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    console.warn(`[Auth] No refresh token on ${req.method} ${req.path} — session needs re-login`);
    res.status(401).json({ message: "Your session has expired. Please sign in again.", code: "SESSION_EXPIRED" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    console.log(`[Auth] OIDC token refreshed for ${req.method} ${req.path}`);
    return next();
  } catch (error: any) {
    console.warn(`[Auth] Token refresh failed on ${req.method} ${req.path}: ${error?.message ?? error}`);
    // Do NOT destroy the session — the CSRF token inside must survive so subsequent
    // requests (including the retry after re-login) still pass CSRF validation.
    res.status(401).json({ message: "Your session has expired. Please sign in again.", code: "SESSION_EXPIRED" });
    return;
  }
};
