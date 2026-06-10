"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocketIO = initSocketIO;
exports.getIO = getIO;
const socket_io_1 = require("socket.io");
let io;
function initSocketIO(httpServer) {
    io = new socket_io_1.Server(httpServer, {
        cors: { origin: "*" },
    });
    io.on("connection", (socket) => {
        console.log("⚡ Socket connected:", socket.id);
        // Community chat room subscriptions. Client emits "chat:join" with a
        // valid room slug; server adds the socket to that room and starts
        // streaming "chat:message" events posted via REST.
        socket.on("chat:join", (slug) => {
            if (typeof slug !== "string")
                return;
            const safe = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
            if (!safe || safe.length > 40)
                return;
            socket.join(`chat:${safe}`);
        });
        socket.on("chat:leave", (slug) => {
            if (typeof slug !== "string")
                return;
            const safe = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
            if (!safe)
                return;
            socket.leave(`chat:${safe}`);
        });
    });
    return io;
}
function getIO() {
    if (!io)
        throw new Error("Socket.io not initialised");
    return io;
}
