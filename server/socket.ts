import { Server } from "socket.io";
import type { Server as HttpServer } from "http";

let io: Server;

export function initSocketIO(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    console.log("⚡ Socket connected:", socket.id);

    // Community chat room subscriptions. Client emits "chat:join" with a
    // valid room slug; server adds the socket to that room and starts
    // streaming "chat:message" events posted via REST.
    socket.on("chat:join", (slug: string) => {
      if (typeof slug !== "string") return;
      const safe = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
      if (!safe || safe.length > 40) return;
      socket.join(`chat:${safe}`);
    });

    socket.on("chat:leave", (slug: string) => {
      if (typeof slug !== "string") return;
      const safe = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
      if (!safe) return;
      socket.leave(`chat:${safe}`);
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) throw new Error("Socket.io not initialised");
  return io;
}
