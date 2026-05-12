
import 'dotenv/config';
// @ts-nocheck

import express from "express";
import path from "path";
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
// 🛡️ DDoS PROTECTION
// =======================

try {
  app.use(applyDdosProtection);
} catch (e) {
  console.warn("⚠️ DDoS protection skipped");
}

// =======================
// ✅ API ROUTES
// =======================

app.use(router);

// =======================
// 🧪 TEST ROUTE
// =======================

app.get("/premium-test", (_req, res) => {
  res.json({
    success: true,
    message: "🔥 Premium route works",
  });
});

// =======================
// 🌍 SERVE FRONTEND
// =======================

const __dirname = path.resolve();

app.use(express.static(path.join(__dirname, "dist")));

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// =======================
// 🚀 START SERVER
// =======================

const PORT = process.env.PORT || 10001;

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});