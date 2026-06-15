"use strict";
/**
 * WebSocket Server — Real-time updates for both admin analytics and individual users.
 *
 * Admin channel:  ws[s]://host/ws/analytics  — receives payment events, new user signups,
 *                                               and live stats updates (user count, active now)
 * User channel:   ws[s]://host/ws/user       — receives plan-activated events for the logged-in user
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setStatsProvider = setStatsProvider;
exports.initWebSocketServer = initWebSocketServer;
exports.broadcastNewUserEvent = broadcastNewUserEvent;
exports.broadcastPaymentEvent = broadcastPaymentEvent;
exports.broadcastStatsUpdate = broadcastStatsUpdate;
exports.notifyUserPlanActivated = notifyUserPlanActivated;
exports.notifyUserPaymentFailed = notifyUserPaymentFailed;
exports.notifyUserPaymentUpdate = notifyUserPaymentUpdate;
exports.notifyApplicationReady = notifyApplicationReady;
exports.getConnectedClients = getConnectedClients;
exports.getConnectedUserCount = getConnectedUserCount;
const ws_1 = require("ws");
const presence_1 = require("./lib/presence");
let _statsProvider = null;
function setStatsProvider(fn) { _statsProvider = fn; }
let wss = null;
let userWss = null;
// Map userId → set of open WebSocket connections (same user can have multiple tabs)
const userConnections = new Map();
/**
 * Extract the authenticated userId from an Express-session-backed request.
 * Supports both Replit OIDC (passport) and custom email/password auth.
 */
function sessionUserId(req) {
    const s = req.session;
    if (!s)
        return null;
    return (s.passport?.user?.claims?.sub ?? // Replit OIDC
        s.customUserId ?? // Email/password login
        null);
}
function initWebSocketServer(httpServer, sessionParser) {
    // ── Admin analytics channel ───────────────────────────────────────────────
    wss = new ws_1.WebSocketServer({ server: httpServer, path: "/ws/analytics" });
    wss.on("connection", (ws, req) => {
        // Only log analytics connections in debug mode to avoid log spam
        if (process.env.WS_DEBUG === "1") {
            console.log(`[WS] Analytics client connected from ${req.socket.remoteAddress}`);
        }
        ws.send(JSON.stringify({ type: "connected", message: "Revenue analytics stream active" }));
        const ping = setInterval(() => {
            if (ws.readyState === ws_1.WebSocket.OPEN)
                ws.send(JSON.stringify({ type: "ping" }));
        }, 30000);
        // Send current stats immediately on connection so new admin tabs don't wait
        if (_statsProvider) {
            _statsProvider().then((data) => {
                if (ws.readyState === ws_1.WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: "stats_update", ...data, timestamp: Date.now() }));
                }
            }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        }
        // 2026-06 REAL-TIME: also send the current presence snapshot so a new
        // admin tab sees the Live Sessions panel populated immediately instead
        // of waiting for the next join/leave or 30 s heartbeat.
        try {
            const paidList = (0, presence_1.getPaidOnlineSnapshot)();
            const allList = (0, presence_1.getOnlineSnapshot)();
            ws.send(JSON.stringify({
                type: "presence_update",
                totalOnline: (0, presence_1.getOnlineCount)(),
                paidOnline: (0, presence_1.getPaidOnlineCount)(),
                paidUsers: paidList.map((p) => ({
                    userId: p.userId, firstName: p.firstName, lastName: p.lastName,
                    email: p.email, phone: p.phone, planId: p.planId,
                    expiresAt: p.subscriptionExpiresAt, joinedAt: p.joinedAt,
                    lastSeen: p.lastSeen, currentPage: p.currentPage,
                })),
                allUsers: allList.map((p) => ({ userId: p.userId, firstName: p.firstName, planId: p.planId })),
                timestamp: Date.now(),
            }));
        }
        catch { /* non-fatal */ }
        ws.on("close", () => { clearInterval(ping); if (process.env.WS_DEBUG === "1")
            console.log("[WS] Analytics client disconnected"); });
        ws.on("error", () => { clearInterval(ping); });
    });
    // 30-second heartbeat: push live stats to all connected admin clients
    setInterval(async () => {
        if (!_statsProvider || !wss || wss.clients.size === 0)
            return;
        try {
            const data = await _statsProvider();
            broadcastStatsUpdate(data);
        }
        catch (_e) { }
    }, 30000);
    console.log("[WS] Analytics WebSocket server started on /ws/analytics");
    // ── User real-time channel ────────────────────────────────────────────────
    // Clients identify themselves by sending { type: "identify", userId: "..." }.
    // If a sessionParser is provided, the claimed userId is validated against the
    // server-side session — equivalent to Socket.io's socket.request.user?.id check.
    userWss = new ws_1.WebSocketServer({ server: httpServer, path: "/ws/user" });
    userWss.on("connection", (ws, req) => {
        let registeredUserId = null;
        const ping = setInterval(() => {
            if (ws.readyState === ws_1.WebSocket.OPEN)
                ws.send(JSON.stringify({ type: "ping" }));
        }, 30000);
        const registerUser = (claimedId, serverVerifiedId) => {
            // If session validation is active, enforce that the claimed ID matches
            if (serverVerifiedId !== null && claimedId !== serverVerifiedId) {
                console.warn(`[WS/User] Identity mismatch — claimed: ${claimedId}, session: ${serverVerifiedId} — closing`);
                ws.send(JSON.stringify({ type: "error", message: "Identity validation failed" }));
                ws.close();
                return;
            }
            registeredUserId = claimedId;
            if (!userConnections.has(registeredUserId)) {
                userConnections.set(registeredUserId, new Set());
            }
            userConnections.get(registeredUserId).add(ws);
            ws.send(JSON.stringify({ type: "identified", userId: registeredUserId }));
            // 2026-06 REAL-TIME PRESENCE: as soon as a tab connects we look up the
            // user's identity + plan from the DB and add them to the presence
            // registry. Subsequent tabs from the same user just increment the
            // tab count (no DB read needed). Subscribers (broadcastPresence below)
            // push the new snapshot to admin + home clients instantly.
            (async () => {
                try {
                    const { db } = await Promise.resolve().then(() => __importStar(require("./db")));
                    const { users } = await Promise.resolve().then(() => __importStar(require("@shared/models/auth")));
                    const { eq } = await Promise.resolve().then(() => __importStar(require("drizzle-orm")));
                    const [u] = await db
                        .select({
                        email: users.email,
                        firstName: users.firstName,
                        lastName: users.lastName,
                        phone: users.phone,
                        plan: users.plan,
                    })
                        .from(users)
                        .where(eq(users.id, claimedId))
                        .limit(1);
                    // Fetch active subscription for expiry tracking
                    const { storage } = await Promise.resolve().then(() => __importStar(require("./storage")));
                    const sub = await storage.getUserSubscription(claimedId).catch(() => null);
                    (0, presence_1.attach)(claimedId, {
                        email: u?.email ?? null,
                        firstName: u?.firstName ?? null,
                        lastName: u?.lastName ?? null,
                        phone: u?.phone ?? null,
                        planId: sub?.plan ?? u?.plan ?? "free",
                        subscriptionExpiresAt: sub?.endDate ?? null,
                    });
                }
                catch (err) {
                    console.warn(`[WS/User] presence attach failed for ${claimedId}: ${err?.message}`);
                    // Still register them as online so the count is right, just without details
                    (0, presence_1.attach)(claimedId);
                }
            })();
            console.log(`[WS/User] User ${registeredUserId} identified (tabs: ${userConnections.get(registeredUserId).size})${serverVerifiedId ? " ✓session" : ""}`);
        };
        ws.on("message", (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg.type === "identify" && typeof msg.userId === "string" && msg.userId.length > 0) {
                    if (sessionParser) {
                        // Run session middleware on the HTTP upgrade request, then validate
                        sessionParser(req, {}, () => {
                            registerUser(msg.userId, sessionUserId(req));
                        });
                    }
                    else {
                        // No session parser — trust client (dev mode fallback)
                        registerUser(msg.userId, null);
                    }
                }
            }
            catch (_e) { /* ignore malformed messages */ }
        });
        ws.on("close", () => {
            clearInterval(ping);
            if (registeredUserId) {
                const conns = userConnections.get(registeredUserId);
                if (conns) {
                    conns.delete(ws);
                    if (conns.size === 0)
                        userConnections.delete(registeredUserId);
                }
                // 2026-06 REAL-TIME: decrement presence. If this was the user's last
                // tab, presence.detach fires a "leave" event and the broadcaster
                // pushes the updated snapshot to admin + home clients immediately.
                (0, presence_1.detach)(registeredUserId);
            }
        });
        ws.on("error", () => { clearInterval(ping); });
    });
    console.log("[WS] User real-time WebSocket server started on /ws/user");
    // ── Real-time presence broadcaster ──────────────────────────────────────
    //
    // Listens for join / leave / update events from server/lib/presence.ts and
    // pushes two payload shapes:
    //   • admin clients on /ws/analytics get the full paid-only snapshot with
    //     email, name, plan, expiry — drives the admin Live Sessions panel
    //   • all clients on /ws/analytics ALSO get totalOnline for any banner
    //
    // We coalesce rapid join/leave bursts into 250 ms batches so the broadcast
    // doesn't fan-out 100× per second under load.
    let coalesceTimer = null;
    const broadcastPresence = () => {
        if (!wss)
            return;
        const totalOnline = (0, presence_1.getOnlineCount)();
        const paidOnline = (0, presence_1.getPaidOnlineCount)();
        const paidList = (0, presence_1.getPaidOnlineSnapshot)();
        const allList = (0, presence_1.getOnlineSnapshot)();
        const adminPayload = JSON.stringify({
            type: "presence_update",
            totalOnline,
            paidOnline,
            paidUsers: paidList.map((p) => ({
                userId: p.userId,
                firstName: p.firstName,
                lastName: p.lastName,
                email: p.email,
                phone: p.phone,
                planId: p.planId,
                expiresAt: p.subscriptionExpiresAt,
                joinedAt: p.joinedAt,
                lastSeen: p.lastSeen,
                currentPage: p.currentPage,
            })),
            allUsers: allList.map((p) => ({
                userId: p.userId,
                firstName: p.firstName,
                planId: p.planId,
            })),
            timestamp: Date.now(),
        });
        wss.clients.forEach((c) => {
            if (c.readyState === ws_1.WebSocket.OPEN)
                c.send(adminPayload);
        });
    };
    (0, presence_1.subscribePresence)(() => {
        if (coalesceTimer)
            return;
        coalesceTimer = setTimeout(() => {
            coalesceTimer = null;
            broadcastPresence();
        }, 250);
    });
    // Also broadcast a heartbeat every 30 s so newly-connected admin clients
    // get a fresh snapshot even if no presence events have fired
    setInterval(broadcastPresence, 30000);
}
function broadcastNewUserEvent(event) {
    if (!wss)
        return;
    const message = JSON.stringify(event);
    let count = 0;
    wss.clients.forEach((client) => {
        if (client.readyState === ws_1.WebSocket.OPEN) {
            client.send(message);
            count++;
        }
    });
    if (count > 0)
        console.log(`[WS] Broadcast new_user (${event.email}) to ${count} admin client(s)`);
}
function broadcastPaymentEvent(event) {
    if (!wss)
        return;
    const message = JSON.stringify(event);
    let count = 0;
    wss.clients.forEach((client) => {
        if (client.readyState === ws_1.WebSocket.OPEN) {
            client.send(message);
            count++;
        }
    });
    if (count > 0)
        console.log(`[WS] Broadcast ${event.type} to ${count} admin client(s)`);
}
function broadcastStatsUpdate(data) {
    if (!wss)
        return;
    const message = JSON.stringify({ type: "stats_update", ...data, timestamp: Date.now() });
    let count = 0;
    wss.clients.forEach((client) => {
        if (client.readyState === ws_1.WebSocket.OPEN) {
            client.send(message);
            count++;
        }
    });
    if (count > 0)
        console.log(`[WS] Broadcast stats_update → totalUsers=${data.totalUsers} activeNow=${data.activeNow} to ${count} client(s)`);
}
/**
 * Send a plan_activated event to all open WebSocket connections for a specific user.
 * Called from upgradeUserAccount immediately after the plan is activated in the DB.
 */
function notifyUserPlanActivated(userId, event) {
    const conns = userConnections.get(userId);
    if (!conns || conns.size === 0)
        return;
    const message = JSON.stringify(event);
    let count = 0;
    conns.forEach((ws) => {
        if (ws.readyState === ws_1.WebSocket.OPEN) {
            ws.send(message);
            count++;
        }
    });
    if (count > 0)
        console.log(`[WS/User] Sent plan_activated(${event.planId}) to user ${userId} (${count} connection(s))`);
}
/**
 * Send a payment_failed event directly to the user who initiated the payment.
 * Called immediately when Safaricom's callback arrives with a non-zero ResultCode.
 * This lets the frontend update instantly (instead of waiting for the 30s poller).
 */
function notifyUserPaymentFailed(userId, event) {
    const conns = userConnections.get(userId);
    if (!conns || conns.size === 0)
        return;
    const message = JSON.stringify(event);
    let count = 0;
    conns.forEach((ws) => {
        if (ws.readyState === ws_1.WebSocket.OPEN) {
            ws.send(message);
            count++;
        }
    });
    if (count > 0)
        console.log(`[WS/User] Sent payment_failed(code=${event.resultCode}) to user ${userId} (${count} connection(s))`);
}
/**
 * Emit a payment_update event to all open WebSocket connections for a user.
 * Drop-in native-WS equivalent of: io.to(`user_${userId}`).emit("payment_update", {...})
 * Called after any payment DB change (success or failure) in the M-Pesa callback
 * and PayPal capture endpoint so the My Payments page refreshes instantly.
 */
function notifyUserPaymentUpdate(userId, event) {
    const conns = userConnections.get(userId);
    if (!conns || conns.size === 0)
        return;
    const message = JSON.stringify(event);
    let count = 0;
    conns.forEach((ws) => {
        if (ws.readyState === ws_1.WebSocket.OPEN) {
            ws.send(message);
            count++;
        }
    });
    if (count > 0)
        console.log(`[WS/User] Sent payment_update(${event.status}) to user ${userId} (${count} connection(s))`);
}
/**
 * Notify a user that their AI-generated application materials (CV + cover letter) are ready.
 * Called from generateApplicationMaterials after preparedMaterials are persisted.
 */
function notifyApplicationReady(userId, event) {
    const conns = userConnections.get(userId);
    if (!conns || conns.size === 0)
        return;
    const message = JSON.stringify(event);
    let count = 0;
    conns.forEach((ws) => {
        if (ws.readyState === ws_1.WebSocket.OPEN) {
            ws.send(message);
            count++;
        }
    });
    if (count > 0) {
        console.log(`[WS/User] Sent application_ready(${event.applicationId}) to user ${userId} (${count} connection(s))`);
    }
}
function getConnectedClients() {
    if (!wss)
        return 0;
    return Array.from(wss.clients).filter((c) => c.readyState === ws_1.WebSocket.OPEN).length;
}
function getConnectedUserCount() {
    return userConnections.size;
}
