"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.pool = void 0;
exports.getPoolStats = getPoolStats;
exports.withTransaction = withTransaction;
const node_postgres_1 = require("drizzle-orm/node-postgres");
const pg_1 = __importDefault(require("pg"));
// Note: `subscriptions` used to be imported here but that symbol doesn't
// exist on the schema (the real export is `userSubscriptions`). Pulling in
// an undefined name caused the Drizzle schema map to be `{ subscriptions: undefined }`,
// which sometimes broke relational query plumbing. Using a wildcard import
// gives Drizzle the entire schema in one shot and stays correct even when
// new tables are added.
const schema = __importStar(require("../shared/schema"));
const { Pool } = pg_1.default;
if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set. See .env \u2014 should be a postgres:// connection string from Supabase \u2192 Database \u2192 Connection string \u2192 Session pooler.");
}
const sslConfig = process.env.DATABASE_URL?.includes("localhost")
    ? false
    : { rejectUnauthorized: false };
exports.pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslConfig,
    max: parseInt(process.env.DB_POOL_MAX || "20", 10),
    min: parseInt(process.env.DB_POOL_MIN || "2", 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
});
exports.db = (0, node_postgres_1.drizzle)(exports.pool, { schema });
// Pool observability (restored Batch D).
let poolStats = {
    totalConnections: 0,
    idleConnections: 0,
    waitingClients: 0,
    lastChecked: new Date(),
};
setInterval(() => {
    poolStats = {
        totalConnections: exports.pool.totalCount,
        idleConnections: exports.pool.idleCount,
        waitingClients: exports.pool.waitingCount,
        lastChecked: new Date(),
    };
    if (exports.pool.waitingCount > 10) {
        console.warn(`[DB Pool Warning] ${exports.pool.waitingCount} clients waiting for connections`);
    }
}, 10000);
function getPoolStats() {
    return {
        ...poolStats,
        totalConnections: exports.pool.totalCount,
        idleConnections: exports.pool.idleCount,
        waitingClients: exports.pool.waitingCount,
    };
}
exports.pool.on("error", (err) => {
    console.error("Unexpected database pool error:", err);
});
exports.pool.on("connect", () => {
    poolStats.totalConnections++;
});
// Transaction helper with deadlock retry (restored Batch D).
async function withTransaction(callback, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await exports.db.transaction(callback);
        }
        catch (error) {
            const isDeadlock = error?.code === "40P01" ||
                error?.message?.includes("deadlock");
            const isSerializationFailure = error?.code === "40001";
            if ((isDeadlock || isSerializationFailure) && attempt < retries) {
                await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 100));
                continue;
            }
            throw error;
        }
    }
    throw new Error("Transaction failed after max retries");
}
