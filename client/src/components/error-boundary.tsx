import { Component, type ReactNode, type ErrorInfo } from "react";
import ErrorPage from "@/components/error-page";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

// Pick a friendlier ErrorPage type based on the actual error's status code.
// Previously this always rendered type="server", which made every transient
// API failure look like "the server is down" / "We're fixing this", and
// users frequently misinterpreted it as a logout.
function pickErrorType(err: Error | null): "server" | "auth" | "notfound" | "network" | "general" {
  if (!err) return "general";
  const status = (err as any).status as number | undefined;
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "notfound";
  if (status && status >= 500 && status < 600) return "server";
  if (err.name === "AbortError" || /network|failed to fetch|load failed/i.test(err.message ?? "")) {
    return "network";
  }
  // Default: still "general" rather than "server" so we don't claim the
  // server is down when it's actually a client-side TypeError.
  return "general";
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    // Loud, copy-pasteable diagnostic — surfaces the real cause so we can
    // fix it instead of just rendering "We're fixing this" indefinitely.
    console.group("%c[ErrorBoundary] Caught a render-time error", "color:#fff;background:#dc2626;padding:2px 6px;border-radius:3px");
    console.error("name:    ", error.name);
    console.error("message: ", error.message);
    console.error("status:  ", (error as any).status);
    console.error("stack:   ", error.stack);
    console.error("componentStack: ", errorInfo.componentStack);
    console.groupEnd();

    // 2026-08 (Tony's "Just a small detour" mobile screenshots): log every
    // caught error to the server so we can see what's actually failing in
    // production. Mobile users can't open dev-tools; without this we're
    // blind to the real cause. Fire-and-forget — never let the logger
    // itself throw and cause a loop.
    try {
      fetch("/api/log/client-error", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type:      "react-error-boundary",
          message:   error?.message ?? "unknown",
          stack:     error?.stack?.slice(0, 3000) ?? null,
          componentStack: errorInfo?.componentStack?.slice(0, 3000) ?? null,
          url:       window.location.href,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {}); // swallow silently
    } catch {}

    // 2026-08: auto-retry ONCE silently before showing the fallback. Many
    // render errors are transient (query race condition, in-app browser
    // hiccup, one-off fetch failure). If retry also fails, the boundary
    // remains in error state and shows the friendly fallback as before.
    // Uses a sessionStorage flag scoped to this pathname so we don't
    // infinite-loop on genuinely-broken routes.
    try {
      const key = `wah:eb-retried:${window.location.pathname}`;
      const lastRetry = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - lastRetry > 30_000) {
        sessionStorage.setItem(key, String(Date.now()));
        // Give React a beat to finish this error render, then reset state.
        // If the underlying issue was transient, the next render succeeds
        // and the user never sees the fallback.
        setTimeout(() => {
          this.setState({ hasError: false, error: null, errorInfo: null });
        }, 400);
      }
    } catch {}
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const type = pickErrorType(this.state.error);
      const code = (this.state.error as any)?.status ?? (type === "server" ? "500" : undefined);

      return (
        <div role="alert" aria-live="assertive" data-testid="error-boundary-fallback">
          <ErrorPage
            type={type}
            code={code}
            error={this.state.error}
            errorInfo={this.state.errorInfo?.componentStack ?? null}
            onRetry={this.handleRetry}
          />
        </div>
      );
    }

    return this.props.children;
  }
}
