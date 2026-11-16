/**
 * Admin check for real-time connections (2026-11 security fix).
 *
 * /ws/analytics and the socket.io admin events used to be open to ANY
 * visitor. On connect they pushed the names, emails, phone numbers and
 * current page of paying users online, new sign-ups' emails + IP, and
 * payment events with phone numbers. The public live-activity widget even
 * connected every visitor to it. This helper reads the visitor's session
 * from the upgrade request and confirms they are an admin.
 */
import type { IncomingMessage } from "http";

function sessionUserId(req: IncomingMessage): string | null {
  const s = (req as any).session;
  if (!s) return null;
  return s.passport?.user?.claims?.sub ?? s.passport?.user?.id ?? s.userId ?? s.customUserId ?? null;
}

export async function isAdminRequest(req: IncomingMessage): Promise<boolean> {
  try {
    if (!(req as any).session) {
      const { getSessionParser } = await import("../replit_integrations/auth/replitAuth");
      const parser = getSessionParser();
      await new Promise<void>((resolve) => {
        try { parser(req as any, {} as any, () => resolve()); } catch { resolve(); }
        setTimeout(resolve, 5000);
      });
    }
    const uid = sessionUserId(req);
    if (!uid) return false;
    const { isAdminUser } = await import("../ai/admin-kpi");
    return await isAdminUser(uid);
  } catch {
    return false;
  }
}
