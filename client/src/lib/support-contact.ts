/**
 * Single source of truth for WorkAbroad Hub support contact channels.
 *
 * Any file that needs to show / link to our support WhatsApp, email, or
 * phone MUST import from here — never hardcode. This file was created
 * after 3 client files were caught shipping placeholder numbers to real
 * users (see commit e7514b4 for the specifics).
 *
 * If we ever change the support number, this is the ONE place to edit.
 *
 * If VITE_SUPPORT_WHATSAPP is set in the env, it overrides the default —
 * so QA / staging can point at a test line without a code change.
 */

const DEFAULT_WHATSAPP_KE = "254742619777";
const DEFAULT_EMAIL       = "support@workabroadhub.tech";
const DEFAULT_PHONE_HUMAN = "+254 742 619 777";

export const SUPPORT_WHATSAPP: string =
  (import.meta.env.VITE_SUPPORT_WHATSAPP as string | undefined) ?? DEFAULT_WHATSAPP_KE;

export const SUPPORT_EMAIL: string =
  (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) ?? DEFAULT_EMAIL;

/** Human-readable phone for display, e.g. in error copy. */
export const SUPPORT_PHONE_DISPLAY: string = DEFAULT_PHONE_HUMAN;

/**
 * Build a wa.me deep link with optional pre-filled message text.
 * Handles URL encoding so callers can pass plain strings.
 */
export function whatsappLink(message?: string): string {
  const base = `https://wa.me/${SUPPORT_WHATSAPP}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
