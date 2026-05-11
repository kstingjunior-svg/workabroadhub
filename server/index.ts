
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
// 🌐 CORS (SAFE + SIMPLE)
// =======================
app.use(cors({
  origin: true, // allow all for now (important for M-Pesa callback)
  credentials: true,
}));
// =======================
// 🔐 SECURITY
// =======================
app.use(helmet());
// ⚠️ DO NOT BLOCK CALLBACKS
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000, // increased (avoid blocking Safaricom)
}));
// =======================
// 🔥 BODY PARSER (CRITICAL)
// =======================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(compression());
// ⚠️ OPTIONAL (disable if causing issues)
try {
  app.use(applyDdosProtection);
} catch (e) {
  console.warn("⚠️ DDoS protection skipped");
}
// =======================
// 🧪 TEST ROUTE
// =======================
app.get("/", (req, res) => {
  res.send("Server is running 🚀");
});
// =======================
// ✅ ROUTES (VERY IMPORTANT)
// =======================
app.use(router);
// =======================
// 🚀 START SERVER
// =======================
const PORT = process.env.PORT || 10001;
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});