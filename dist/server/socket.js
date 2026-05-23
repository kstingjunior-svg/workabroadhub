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
        console.log("⚡ Admin connected:", socket.id);
    });
    return io;
}
function getIO() {
    if (!io)
        throw new Error("Socket.io not initialised");
    return io;
}
