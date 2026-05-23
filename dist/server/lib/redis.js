"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisConnection = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL environment variable is missing");
}
exports.redisConnection = new ioredis_1.default(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: {},
});
exports.redisConnection.on("connect", () => {
    console.log("✅ Redis connected successfully");
});
exports.redisConnection.on("error", (err) => {
    console.error("❌ Redis connection error:", err);
});
exports.default = exports.redisConnection;
