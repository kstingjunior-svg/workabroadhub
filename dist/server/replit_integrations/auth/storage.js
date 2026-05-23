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
Object.defineProperty(exports, "__esModule", { value: true });
exports.authStorage = void 0;
// @ts-nocheck
const auth_1 = require("@shared/models/auth");
const db_1 = require("../../db");
const drizzle_orm_1 = require("drizzle-orm");
const schema_1 = require("@shared/schema");
class AuthStorage {
    async getUser(id) {
        const [user] = await db_1.db.select().from(auth_1.users).where((0, drizzle_orm_1.eq)(auth_1.users.id, id));
        return user;
    }
    async upsertUser(userData) {
        const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
        const isAdminEmail = userData.email && adminEmails.includes(userData.email.toLowerCase());
        // First check if user exists by ID (if ID provided)
        let existingUserById;
        if (userData.id) {
            existingUserById = await this.getUser(userData.id);
        }
        // Also check if user exists by email (different ID, same email)
        let existingUserByEmail;
        if (userData.email) {
            const [found] = await db_1.db.select().from(auth_1.users).where((0, drizzle_orm_1.eq)(auth_1.users.email, userData.email));
            existingUserByEmail = found;
        }
        // If user exists by email with different ID, update that record instead
        if (existingUserByEmail && existingUserByEmail.id !== userData.id) {
            const [user] = await db_1.db
                .update(auth_1.users)
                .set({
                firstName: userData.firstName,
                lastName: userData.lastName,
                profileImageUrl: userData.profileImageUrl,
                isAdmin: isAdminEmail ? true : existingUserByEmail.isAdmin,
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(auth_1.users.id, existingUserByEmail.id))
                .returning();
            if (isAdminEmail && user.isAdmin) {
                console.log(`User ${user.email} granted admin access via ADMIN_EMAILS`);
            }
            return user;
        }
        // Detect brand-new signup before upsert
        const isNewSignup = !existingUserById && !existingUserByEmail;
        // Normal upsert by ID
        const [user] = await db_1.db
            .insert(auth_1.users)
            .values({
            ...userData,
            isAdmin: isAdminEmail ? true : undefined,
        })
            .onConflictDoUpdate({
            target: auth_1.users.id,
            set: {
                ...userData,
                isAdmin: isAdminEmail ? true : undefined,
                updatedAt: new Date(),
            },
        })
            .returning();
        if (isAdminEmail && user.isAdmin) {
            console.log(`User ${user.email} granted admin access via ADMIN_EMAILS`);
        }
        // Fire activity event + WebSocket notification for new Replit OIDC signups — fire and forget
        if (isNewSignup) {
            db_1.db.insert(schema_1.activityEvents).values({ type: "signup", location: null }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
            // Dynamic import to avoid circular-dependency at startup
            Promise.resolve().then(() => __importStar(require("../../websocket"))).then(({ broadcastNewUserEvent }) => {
                broadcastNewUserEvent({
                    type: "new_user",
                    userId: user.id,
                    email: user.email ?? "",
                    firstName: user.firstName ?? "",
                    method: "replit",
                    ip: "",
                    userAgent: "",
                    timestamp: new Date().toISOString(),
                });
            }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        }
        if (!adminEmails.length) {
            const [countResult] = await db_1.db.select({ count: (0, drizzle_orm_1.count)() }).from(auth_1.users);
            if (countResult.count === 1 && !user.isAdmin) {
                const [promotedUser] = await db_1.db
                    .update(auth_1.users)
                    .set({ isAdmin: true })
                    .where((0, drizzle_orm_1.eq)(auth_1.users.id, user.id))
                    .returning();
                console.log(`First user ${promotedUser.email} automatically promoted to admin (no ADMIN_EMAILS configured)`);
                return promotedUser;
            }
        }
        return user;
    }
}
exports.authStorage = new AuthStorage();
