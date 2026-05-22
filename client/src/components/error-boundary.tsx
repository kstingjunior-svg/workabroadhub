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
    console.error(
      "[ErrorBoundary] Caught:",
      { name: error.name, message: error.message, status: (error as any).status },
      errorInfo
    );
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
