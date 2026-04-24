import { db } from "../db";
import { activityLogs } from "../../shared/schema";

export type ActivityEvent =
  | "signup"
  | "payment_started"
  | "payment_success"
  | "payment_failed"
  | "user_upgraded"
  | "error";

interface LogOptions {
  event: ActivityEvent;
  userId?: string;
  email?: string;
  meta?: Record<string, any>;
  ip?: string;
}

/**
 * Fire-and-forget activity logger. Never throws — errors are swallowed
 * so a logging failure never disrupts the main request flow.
 */
export function logActivity(opts: LogOptions): void {
  setImmediate(async () => {
    try {
      await db.insert(activityLogs).values({
        event: opts.event,
        userId: opts.userId ?? null,
        email: opts.email ?? null,
        meta: opts.meta ?? null,
        ip: opts.ip ?? null,
      });
    } catch (err) {
      // Silent — logging must never crash the app
      console.warn("[ActivityLogger] Failed to write log:", (err as Error).message);
    }
  });
}
