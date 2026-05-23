"use strict";
/**
 * WebSocket Server — Real-time updates for both admin analytics and individual users.
 *
 * Admin channel:  ws[s]://host/ws/analytics  — receives payment events, new user signups,
 *                                               and live stats updates (user count, active now)
 * User channel:   ws[s]://host/ws/user       — receives plan-activated events for the logged-in user
 */
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
            }
        });
        ws.on("error", () => { clearInterval(ping); });
    });
    console.log("[WS] User real-time WebSocket server started on /ws/user");
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
