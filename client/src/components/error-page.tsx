import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";

type ErrorType = "payment" | "network" | "auth" | "validation" | "notfound" | "server" | "general";

interface ErrorPageProps {
  type?: ErrorType;
  code?: string | number;
  /** Raw error object (from ErrorBoundary) — shown in debug panel in dev */
  error?: Error | null;
  errorInfo?: string | null;
  /** Called when "Try Again" is pressed (used by ErrorBoundary to reset state) */
  onRetry?: () => void;
}

const MESSAGES: Record<ErrorType, { heading: string; message: string; autoRetry: boolean }> = {
  payment: {
    heading: "Payment processing paused",
    message:
      "Your payment didn't complete. This happens sometimes with M-Pesa — your money is safe and hasn't been deducted.",
    autoRetry: true,
  },
  network: {
    heading: "Connection interrupted",
    message:
      "We couldn't reach our servers. Please check your internet connection and try again.",
    autoRetry: true,
  },
  auth: {
    heading: "Login session expired",
    message:
      "For your security, your session has timed out. Please log in again to continue.",
    autoRetry: false,
  },
  validation: {
    heading: "Some information needs attention",
    message:
      "One or more fields need to be corrected. Please check the form and try again.",
    autoRetry: false,
  },
  notfound: {
    heading: "Page not found",
    message:
      "The page you're looking for doesn't exist or has been moved.",
    autoRetry: false,
  },
  server: {
    heading: "We're fixing this",
    message:
      "Our team has been alerted and is working on it. Please try again in a few minutes.",
    autoRetry: true,
  },
  general: {
    heading: "Just a small detour",
    message:
      "Something didn't load quite right. Don't worry — your information is safe.",
    autoRetry: false,
  },
};

const SUPPORT_WHATSAPP = "254111467601";
const SUPPORT_EMAIL = "support@workabroadhub.tech";

function buildRef(code: string | number) {
  // 2026-07: use UTC (getUTC*) so the ref timestamp matches Render log
  // timestamps directly. Previously used local time which made
  // user-reported refs ambiguous — a "23 00:07" ref in Kenya (EAT) was
  // actually "22 21:07" UTC in Render logs, and support had to convert
  // by hand for every ticket.
  const now = new Date();
  const ts =
    String(now.getUTCFullYear()).slice(-2) +
    String(now.getUTCMonth() + 1).padStart(2, "0") +
    String(now.getUTCDate()).padStart(2, "0") +
    String(now.getUTCHours()).padStart(2, "0") +
    String(now.getUTCMinutes()).padStart(2, "0");
  // 4-char random suffix so two users hitting different errors at the
  // same minute don't share the same ref. Enables us to search support
  // DMs for a specific incident.
  const rand = Math.random().toString(36).slice(2, 6);
  return `WAH-${code}-${ts}-${rand}`;
}

// Surface the underlying error to the browser console *and* (when
// clicked) inline on the error page itself. No more hidden shift+click
// keyboard combo — users can copy the actual error and report it.

export default function ErrorPage({
  type,
  code,
  error,
  errorInfo,
  onRetry,
}: ErrorPageProps) {
  const [, navigate] = useLocation();

  // Derive type/code from URL params if not passed directly
  const urlParams = new URLSearchParams(window.location.search);
  const resolvedType: ErrorType =
    type ?? (urlParams.get("type") as ErrorType) ?? "general";
  const resolvedCode = code ?? urlParams.get("code") ?? "500";

  const config = MESSAGES[resolvedType] ?? MESSAGES.general;
  const errorRef = buildRef(resolvedCode);

  // Surface the actual exception to the browser console on every render so
  // the user / support can immediately see what really happened — and copy
  // it. Previously this was only available behind shift+click 3x.
  useEffect(() => {
    if (error) {
      console.error(
        "[ErrorPage] Underlying error\n  type:", resolvedType,
        "\n  code:", resolvedCode,
        "\n  ref:", errorRef,
        "\n  name:", error.name,
        "\n  message:", error.message,
        "\n  status:", (error as any).status,
        "\n  stack:", error.stack,
      );
      // 2026-07: also POST server-side so we can see aggregate crash
      // patterns in Render logs. Fire-and-forget — failures ignored so
      // we don't compound the error.
      try {
        fetch("/api/log/client-error", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            ref:       errorRef,
            type:      resolvedType,
            code:      resolvedCode,
            name:      error.name,
            message:   error.message,
            status:    (error as any).status,
            stack:     error.stack?.slice(0, 4000),
            url:       window.location.href,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
          }),
        }).catch(() => {});
      } catch {}
    }
  }, [error, resolvedType, resolvedCode, errorRef]);

  // Auto-retry countdown
  const [countdown, setCountdown] = useState(config.autoRetry ? 5 : 0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!config.autoRetry) return;
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(countdownRef.current!);
          if (onRetry) {
            onRetry();
          } else {
            window.history.back();
          }
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // Shift+click 3× on illustration → show debug panel
  const [debugVisible, setDebugVisible] = useState(false);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleIllustrationClick(e: React.MouseEvent) {
    if (!e.shiftKey) return;
    clickCountRef.current++;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => { clickCountRef.current = 0; }, 2000);
    if (clickCountRef.current >= 3) {
      setDebugVisible(true);
      clickCountRef.current = 0;
    }
  }

  function handleRetryClick() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (onRetry) {
      onRetry();
    } else {
      window.history.back();
    }
  }

  // 2026-06 (Tony's "Just a small detour" report): the most common cause of
  // the generic error boundary is a stale index.html in an in-app browser
  // cache that points at chunk hashes no longer on the server. The default
  // "Go Back" button doesn't help — it just navigates within the same
  // broken shell. This helper does a HARD recovery: clears the lazy-retry
  // cooldown so the next chunk failure can auto-reload again, drops every
  // service worker + CacheStorage entry (in-app browsers sometimes hold
  // these from a previous visit), and forces a no-cache reload of the
  // current URL. The cache-busting query string defeats any HTTP/in-app
  // cache layer that ignores Cache-Control headers.
  async function handleHardReload() {
    try {
      sessionStorage.removeItem("wah:lazy-retry-reloaded-at");
    } catch {}
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch {}
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {}
    // Add a one-shot ?_t=… so even Messenger/WhatsApp's in-app HTTP cache
    // can't satisfy this request from its own store.
    const url = new URL(window.location.href);
    url.searchParams.set("_t", Date.now().toString());
    window.location.replace(url.toString());
  }

  function reportIssue() {
    const msg = `Hi WorkAbroad Hub, I encountered an error (Ref: ${errorRef}). Can you help?`;
    window.open(`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8 sm:px-8 sm:py-12"
      style={{
        background: "linear-gradient(135deg, #F4F2EE 0%, #FFFFFF 100%)",
        fontFamily: "'Inter', sans-serif",
        color: "#1E2A36",
      }}
      data-testid="error-page"
    >
      <div
        className="w-full max-w-[600px] mx-auto text-center rounded-[28px] sm:rounded-[32px] p-5 sm:p-10"
        style={{
          background: "#FFFFFF",
          border: "1px solid #E2DDD5",
          boxShadow: "0 20px 40px -10px rgba(0,0,0,0.05)",
        }}
      >
        {/* Illustration */}
        <div
          className="text-[3.5rem] sm:text-[5rem] mb-4 sm:mb-6 leading-none cursor-default select-none"
          onClick={handleIllustrationClick}
          data-testid="error-illustration"
          title="(Shift+click 3× for debug info)"
        >
          🧭
        </div>

        {/* Heading */}
        <h1
          className="text-[1.5rem] sm:text-[2.2rem] mb-3 sm:mb-4 leading-tight break-words"
          style={{
            fontFamily: "'Crimson Pro', serif",
            fontWeight: 500,
            color: "#1A2530",
          }}
          data-testid="error-heading"
        >
          {config.heading}
        </h1>

        {/* Message */}
        <p
          className="mb-6 sm:mb-8 text-[0.95rem] sm:text-[1.1rem] leading-relaxed break-words"
          style={{ color: "#5A6A7A" }}
          data-testid="error-message"
        >
          {config.message}
        </p>

        {/* Reassurance box */}
        <div
          className="text-left mb-6 sm:mb-8 rounded-2xl p-4 sm:p-5"
          style={{
            background: "#ECFDF3",
            border: "1px solid #ABEFC6",
          }}
          data-testid="error-reassurance"
        >
          <p className="flex items-start gap-3 m-0" style={{ color: "#067647" }}>
            <span className="text-xl flex-shrink-0">🛡️</span>
            <span className="min-w-0 break-words">
              <strong>Your data is secure.</strong> This is a temporary technical issue — no action is
              needed from you. Your account and payment information remain protected.
            </span>
          </p>
        </div>

        {/* Action buttons — stack full-width on mobile so long labels never
            overflow the card; flex-wrap alone isn't enough because flex
            items default to min-width:auto and refuse to shrink below their
            unwrapped content width, which is what pushed "Refresh & Continue"
            etc. past the viewport edge on narrow phones. */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 justify-center mb-6 sm:mb-8 w-full">
          <button
            onClick={resolvedType === "general" ? handleHardReload : handleRetryClick}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full font-medium text-[0.95rem] px-6 py-3 cursor-pointer transition-all text-center break-words"
            style={{
              background: (config.autoRetry || resolvedType === "general") ? "#1A2530" : "transparent",
              color: (config.autoRetry || resolvedType === "general") ? "white" : "#3A4A5A",
              border: (config.autoRetry || resolvedType === "general") ? "none" : "1.5px solid #D1CEC8",
            }}
            data-testid="button-go-back"
          >
            {resolvedType === "general"
              ? "⟳ Refresh & Continue"
              : config.autoRetry
                ? countdown > 0
                  ? `⟳ Retrying in ${countdown}s…`
                  : "⟳ Try Again"
                : "← Go Back"}
          </button>

          <button
            onClick={() => navigate("/")}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full font-medium text-[0.95rem] px-6 py-3 cursor-pointer transition-all text-center break-words"
            style={{
              background: config.autoRetry ? "transparent" : "#1A2530",
              color: config.autoRetry ? "#3A4A5A" : "white",
              border: config.autoRetry ? "1.5px solid #D1CEC8" : "none",
            }}
            data-testid="button-go-home"
          >
            🏠 Return to Homepage
          </button>

          <button
            onClick={reportIssue}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full font-medium text-[0.95rem] px-6 py-3 cursor-pointer transition-all text-center break-words"
            style={{
              background: "transparent",
              color: "#3A4A5A",
              border: "1.5px solid #D1CEC8",
            }}
            data-testid="button-contact-support"
          >
            📞 Contact Support
          </button>
        </div>

        {/* Support info */}
        <div
          className="pt-5 sm:pt-6 text-[0.85rem] sm:text-[0.9rem]"
          style={{
            borderTop: "1px solid #E2DDD5",
            color: "#7A8A9A",
          }}
          data-testid="error-support-info"
        >
          <p className="m-0 break-words">
            If this keeps happening, please reach out:
            <br />
            <a
              href={`https://wa.me/${SUPPORT_WHATSAPP}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium"
              style={{ color: "#1A2530" }}
              data-testid="link-whatsapp-support"
            >
              💬 WhatsApp Support
            </a>
            {" · "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="underline font-medium break-all"
              style={{ color: "#1A2530" }}
              data-testid="link-email-support"
            >
              ✉️ {SUPPORT_EMAIL}
            </a>
          </p>

          {/* Error reference */}
          <div
            className="font-mono rounded-lg px-3 py-1 text-xs inline-block mt-4 max-w-full overflow-x-auto whitespace-nowrap"
            style={{
              background: "#F4F2EE",
              color: "#5A6A7A",
            }}
            data-testid="error-reference"
          >
            Ref: {errorRef}
          </div>
        </div>

        {/* Debug panel — dev env OR Shift+click ×3 on illustration */}
        {(debugVisible || (import.meta.env.DEV && error)) && (
          <div
            className="text-left rounded-xl p-4 font-mono text-xs mt-6 overflow-x-auto max-w-full"
            style={{
              background: "#1A2530",
              color: "#A0B0C0",
            }}
            data-testid="error-debug-panel"
          >
            <strong style={{ color: "#E0E8F0" }}>🔧 Developer Information</strong>
            <br />
            Type: {resolvedType}
            <br />
            Code: {resolvedCode}
            <br />
            Time: {new Date().toISOString()}
            <br />
            URL: <span className="break-all">{window.location.href}</span>
            {error && (
              <>
                <br />
                Error: <span className="break-all">{error.message}</span>
              </>
            )}
            {errorInfo && (
              <pre className="whitespace-pre-wrap break-all mt-2" style={{ color: "#FF9999" }}>
                {errorInfo}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
