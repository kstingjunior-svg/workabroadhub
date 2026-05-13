import 'dotenv/config';
// @ts-nocheck
import express from "express";
import router from "./routes";
import { createServer } from "http";
import { initSocketIO } from "./socket";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import compression from "compression";
import { applyDdosProtection } from "./middleware/ddos-protection";

// =======================
// 🚀 CREATE APP + SERVER
// =======================
const app = express();
const httpServer = createServer(app);
initSocketIO(httpServer);

// =======================
// 🌐 CORS
// =======================
app.use(cors({
  origin: true,
  credentials: true,
}));

// =======================
// 🔐 SECURITY
// =======================
app.use(helmet());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
}));

// =======================
// 🔥 BODY PARSER
// =======================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// =======================
// 🛡️ OPTIONAL DDOS
// =======================
try {
  app.use(applyDdosProtection);
} catch (e) {
  console.warn("⚠️ DDoS protection skipped");
}

// =======================
// 🧪 TEST ROUTE
// =======================
app.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "Server is running 🚀"
  });
});

// =======================
// ✅ API ROUTES
// =======================
app.use(router);
app.get("/premium-test", (_req, res) => {
  res.json({
    success: true,
    message: "🔥 Premium route works"
  });
});

// =======================
// 🚀 START SERVER
// =======================
const PORT = Number(process.env.PORT) || 10001;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
