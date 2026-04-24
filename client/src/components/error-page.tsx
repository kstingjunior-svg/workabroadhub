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

const SUPPORT_WHATSAPP = "254700000000";
const SUPPORT_EMAIL = "support@workabroadhub.co.ke";

function buildRef(code: string | number) {
  const now = new Date();
  const ts =
    String(now.getFullYear()).slice(-2) +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0");
  return `WAH-${code}-${ts}`;
}

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

  function reportIssue() {
    const msg = `Hi WorkAbroad Hub, I encountered an error (Ref: ${errorRef}). Can you help?`;
    window.open(`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #F4F2EE 0%, #FFFFFF 100%)",
        fontFamily: "'Inter', sans-serif",
        color: "#1E2A36",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
      }}
      data-testid="error-page"
    >
      <div
        style={{
          maxWidth: 600,
          width: "100%",
          textAlign: "center",
          background: "#FFFFFF",
          borderRadius: 32,
          padding: "3rem 2.5rem",
          border: "1px solid #E2DDD5",
          boxShadow: "0 20px 40px -10px rgba(0,0,0,0.05)",
        }}
      >
        {/* Illustration */}
        <div
          style={{ fontSize: "5rem", marginBottom: "1.5rem", lineHeight: 1, cursor: "default", userSelect: "none" }}
          onClick={handleIllustrationClick}
          data-testid="error-illustration"
          title="(Shift+click 3× for debug info)"
        >
          🧭
        </div>

        {/* Heading */}
        <h1
          style={{
            fontFamily: "'Crimson Pro', serif",
            fontSize: "2.2rem",
            fontWeight: 500,
            color: "#1A2530",
            marginBottom: "1rem",
          }}
          data-testid="error-heading"
        >
          {config.heading}
        </h1>

        {/* Message */}
        <p
          style={{ color: "#5A6A7A", marginBottom: "2rem", fontSize: "1.1rem", lineHeight: 1.6 }}
          data-testid="error-message"
        >
          {config.message}
        </p>

        {/* Reassurance box */}
        <div
          style={{
            background: "#ECFDF3",
            border: "1px solid #ABEFC6",
            borderRadius: 16,
            padding: "1.25rem",
            marginBottom: "2rem",
            textAlign: "left",
          }}
          data-testid="error-reassurance"
        >
          <p style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", color: "#067647", margin: 0 }}>
            <span style={{ fontSize: "1.25rem" }}>🛡️</span>
            <span>
              <strong>Your data is secure.</strong> This is a temporary technical issue — no action is
              needed from you. Your account and payment information remain protected.
            </span>
          </p>
        </div>

        {/* Action buttons */}
        <div
          style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap", marginBottom: "2rem" }}
        >
          <button
            onClick={handleRetryClick}
            style={{
              padding: "12px 28px",
              borderRadius: 100,
              fontWeight: 500,
              fontSize: "0.95rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              cursor: "pointer",
              transition: "all 0.2s",
              background: config.autoRetry ? "#1A2530" : "transparent",
              color: config.autoRetry ? "white" : "#3A4A5A",
              border: config.autoRetry ? "none" : "1.5px solid #D1CEC8",
            }}
            data-testid="button-go-back"
          >
            {config.autoRetry
              ? countdown > 0
                ? `⟳ Retrying in ${countdown}s…`
                : "⟳ Try Again"
              : "← Go Back"}
          </button>

          <button
            onClick={() => navigate("/")}
            style={{
              padding: "12px 28px",
              borderRadius: 100,
              fontWeight: 500,
              fontSize: "0.95rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              cursor: "pointer",
              transition: "all 0.2s",
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
            style={{
              padding: "12px 28px",
              borderRadius: 100,
              fontWeight: 500,
              fontSize: "0.95rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              cursor: "pointer",
              transition: "all 0.2s",
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
          style={{
            paddingTop: "1.5rem",
            borderTop: "1px solid #E2DDD5",
            color: "#7A8A9A",
            fontSize: "0.9rem",
          }}
          data-testid="error-support-info"
        >
          <p style={{ margin: 0 }}>
            If this keeps happening, please reach out:
            <br />
            <a
              href={`https://wa.me/${SUPPORT_WHATSAPP}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#1A2530", textDecoration: "underline", fontWeight: 500 }}
              data-testid="link-whatsapp-support"
            >
              💬 WhatsApp Support
            </a>
            {" · "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              style={{ color: "#1A2530", textDecoration: "underline", fontWeight: 500 }}
              data-testid="link-email-support"
            >
              ✉️ {SUPPORT_EMAIL}
            </a>
          </p>

          {/* Error reference */}
          <div
            style={{
              fontFamily: "monospace",
              background: "#F4F2EE",
              padding: "0.25rem 0.75rem",
              borderRadius: 8,
              fontSize: "0.8rem",
              color: "#5A6A7A",
              display: "inline-block",
              marginTop: "1rem",
            }}
            data-testid="error-reference"
          >
            Ref: {errorRef}
          </div>
        </div>

        {/* Debug panel — dev env OR Shift+click ×3 on illustration */}
        {(debugVisible || (import.meta.env.DEV && error)) && (
          <div
            style={{
              textAlign: "left",
              background: "#1A2530",
              color: "#A0B0C0",
              padding: "1rem",
              borderRadius: 12,
              fontFamily: "monospace",
              fontSize: "0.75rem",
              marginTop: "1.5rem",
              overflowX: "auto",
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
            URL: {window.location.href}
            {error && (
              <>
                <br />
                Error: {error.message}
              </>
            )}
            {errorInfo && (
              <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", marginTop: "0.5rem", color: "#FF9999" }}>
                {errorInfo}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
