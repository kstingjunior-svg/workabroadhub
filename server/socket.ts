import { Server } from "socket.io";
import type { Server as HttpServer } from "http";

let io: Server;

export function initSocketIO(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    console.log("⚡ Admin connected:", socket.id);
  });

  return io;
}

export function getIO(): Server {
  if (!io) throw new Error("Socket.io not initialised");
  return io;
}
