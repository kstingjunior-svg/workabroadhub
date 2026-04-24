import { apiRequest } from "./queryClient";

const CONSENT_KEY = "workabroad-data-consent";

/**
 * Returns true only when the user has explicitly accepted analytics tracking.
 * If the user clicked "Decline" or has not yet been shown the banner, all
 * tracking calls are silently no-ops — we never collect data without consent.
 */
function hasAnalyticsConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === "accepted";
  } catch {
    return false;
  }
}

// Generate or retrieve session ID
function getSessionId(): string {
  let sessionId = sessionStorage.getItem("analytics_session_id");
  if (!sessionId) {
    sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    sessionStorage.setItem("analytics_session_id", sessionId);
  }
  return sessionId;
}

// Detect device type from user agent
function getDeviceType(): "mobile" | "tablet" | "desktop" {
  const ua = navigator.userAgent.toLowerCase();
  if (/android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
    return "mobile";
  }
  if (/ipad|tablet|playbook|silk/i.test(ua)) {
    return "tablet";
  }
  return "desktop";
}

// Event categories
export const EVENT_CATEGORIES = {
  NAVIGATION: "navigation",
  CONVERSION: "conversion",
  ENGAGEMENT: "engagement",
  ERROR: "error",
} as const;

// Funnel steps
export const FUNNEL_STEPS = {
  LANDING_VIEW: "landing_view",
  SIGNUP: "signup",
  PAYMENT_STARTED: "payment_started",
  PAYMENT_COMPLETED: "payment_completed",
  DASHBOARD_ACCESS: "dashboard_access",
  JOB_LINK_CLICK: "job_link_click",
  SERVICE_ORDER: "service_order",
} as const;

// Track a generic event — silently no-ops if the user has not consented.
export async function trackEvent(
  eventType: string,
  eventName: string,
  eventCategory: string,
  eventData?: Record<string, unknown>
): Promise<void> {
  if (!hasAnalyticsConsent()) return;
  try {
    await apiRequest("POST", "/api/analytics/event", {
      sessionId: getSessionId(),
      eventType,
      eventName,
      eventCategory,
      eventData,
      page: window.location.pathname,
      referrer: document.referrer || null,
      deviceType: getDeviceType(),
    });
  } catch (error) {
    console.debug("Analytics event failed:", error);
  }
}

// Track a page view
export async function trackPageView(pageName: string): Promise<void> {
  return trackEvent("page_view", pageName, EVENT_CATEGORIES.NAVIGATION, {
    url: window.location.href,
    title: document.title,
  });
}

// Track a button click
export async function trackButtonClick(
  buttonName: string,
  context?: Record<string, unknown>
): Promise<void> {
  return trackEvent("button_click", buttonName, EVENT_CATEGORIES.ENGAGEMENT, context);
}

// Track a conversion funnel step — silently no-ops if the user has not consented.
export async function trackConversion(
  funnelStep: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (!hasAnalyticsConsent()) return;
  try {
    await apiRequest("POST", "/api/analytics/conversion", {
      sessionId: getSessionId(),
      funnelStep,
      metadata,
    });
  } catch (error) {
    console.debug("Conversion tracking failed:", error);
  }
}

// Convenience functions for common events

export const trackLandingView = () =>
  trackConversion(FUNNEL_STEPS.LANDING_VIEW);

export const trackSignup = () =>
  trackConversion(FUNNEL_STEPS.SIGNUP);

export const trackPaymentStarted = (amount?: number, method?: string) =>
  trackConversion(FUNNEL_STEPS.PAYMENT_STARTED, { amount, method });

export const trackPaymentCompleted = (amount?: number, method?: string) =>
  trackConversion(FUNNEL_STEPS.PAYMENT_COMPLETED, { amount, method });

export const trackDashboardAccess = () =>
  trackConversion(FUNNEL_STEPS.DASHBOARD_ACCESS);

export const trackJobLinkClick = (linkName: string, countryCode: string, url: string) =>
  trackConversion(FUNNEL_STEPS.JOB_LINK_CLICK, { linkName, countryCode, url });

export const trackServiceOrder = (serviceName: string, price: number) =>
  trackConversion(FUNNEL_STEPS.SERVICE_ORDER, { serviceName, price });

// Track form submissions
export const trackFormSubmit = (formName: string, success: boolean, errorMessage?: string) =>
  trackEvent("form_submit", formName, success ? EVENT_CATEGORIES.CONVERSION : EVENT_CATEGORIES.ERROR, {
    success,
    errorMessage,
  });

// Track errors
export const trackError = (errorType: string, message: string, context?: Record<string, unknown>) =>
  trackEvent("error", errorType, EVENT_CATEGORIES.ERROR, {
    message,
    ...context,
  });

/**
 * Fire-and-forget event tracker — sends named events with optional metadata
 * to /api/track-event (stored in funnel_events with page context).
 *
 * Usage:
 *   trackServerEvent("view_service", { service: "ats_cv_optimization" });
 *   trackServerEvent("start_payment", { amount: 4500, method: "mpesa" });
 */
export function trackServerEvent(
  event: string,
  metadata: Record<string, unknown> = {},
  userId?: number
): void {
  fetch("/api/track-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: userId ?? null,
      event,
      page: window.location.pathname,
      metadata,
    }),
    credentials: "include",
  }).catch(() => {});
}
