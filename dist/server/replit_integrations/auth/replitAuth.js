"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAuthenticated = void 0;
exports.getSessionParser = getSessionParser;
exports.getSession = getSession;
exports.setupAuth = setupAuth;
const passport_1 = __importDefault(require("passport"));
const express_session_1 = __importDefault(require("express-session"));
const connect_pg_simple_1 = __importDefault(require("connect-pg-simple"));
const pgStore = (0, connect_pg_simple_1.default)(express_session_1.default);
let _sessionParser = null;
function getSessionParser() {
    if (!_sessionParser)
        _sessionParser = getSession();
    return _sessionParser;
}
function getSession() {
    return (0, express_session_1.default)({
        secret: process.env.SESSION_SECRET,
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
async function setupAuth(app) {
    app.set("trust proxy", 1);
    app.use(getSessionParser());
    app.use((req, _res, next) => {
        if (!req.session) {
            req.session = {
                regenerate: (cb) => cb(),
                save: (cb) => { if (cb)
                    cb(); },
                destroy: (cb) => { if (cb)
                    cb(); },
            };
        }
        else {
            if (!req.session.regenerate)
                req.session.regenerate = (cb) => cb();
            if (!req.session.save)
                req.session.save = (cb) => { if (cb)
                    cb(); };
        }
        next();
    });
    app.use(passport_1.default.initialize());
    app.use(passport_1.default.session());
    passport_1.default.serializeUser((user, cb) => cb(null, user));
    passport_1.default.deserializeUser((user, cb) => cb(null, user));
}
const isAuthenticated = async (req, res, next) => {
    const customUserId = req.session.customUserId;
    if (customUserId) {
        req.user = {
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
exports.isAuthenticated = isAuthenticated;
