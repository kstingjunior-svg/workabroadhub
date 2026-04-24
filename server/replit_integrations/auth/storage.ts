import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq, count } from "drizzle-orm";
import { activityEvents } from "@shared/schema";

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
    const isAdminEmail = userData.email && adminEmails.includes(userData.email.toLowerCase());

    // First check if user exists by ID (if ID provided)
    let existingUserById: User | undefined;
    if (userData.id) {
      existingUserById = await this.getUser(userData.id);
    }
    
    // Also check if user exists by email (different ID, same email)
    let existingUserByEmail: User | undefined;
    if (userData.email) {
      const [found] = await db.select().from(users).where(eq(users.email, userData.email));
      existingUserByEmail = found;
    }

    // If user exists by email with different ID, update that record instead
    if (existingUserByEmail && existingUserByEmail.id !== userData.id) {
      const [user] = await db
        .update(users)
        .set({
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          isAdmin: isAdminEmail ? true : existingUserByEmail.isAdmin,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingUserByEmail.id))
        .returning();
      
      if (isAdminEmail && user.isAdmin) {
        console.log(`User ${user.email} granted admin access via ADMIN_EMAILS`);
      }
      return user;
    }

    // Detect brand-new signup before upsert
    const isNewSignup = !existingUserById && !existingUserByEmail;

    // Normal upsert by ID
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        isAdmin: isAdminEmail ? true : undefined,
      })
      .onConflictDoUpdate({
        target: users.id,
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
      db.insert(activityEvents).values({ type: "signup", location: null }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
      // Dynamic import to avoid circular-dependency at startup
      import("../../websocket").then(({ broadcastNewUserEvent }) => {
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
      const [countResult] = await db.select({ count: count() }).from(users);
      if (countResult.count === 1 && !user.isAdmin) {
        const [promotedUser] = await db
          .update(users)
          .set({ isAdmin: true })
          .where(eq(users.id, user.id))
          .returning();
        console.log(`First user ${promotedUser.email} automatically promoted to admin (no ADMIN_EMAILS configured)`);
        return promotedUser;
      }
    }
    
    return user;
  }
}

export const authStorage = new AuthStorage();
