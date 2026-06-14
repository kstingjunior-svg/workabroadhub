import { useEffect } from "react";
import { useLocation } from "wouter";

// The standalone /login page used to render a duplicate sign-in form.
// We removed it in favor of the modal on the landing page; this thin
// redirector keeps the route working (forgot-password emails, share
// links, etc.) by sending the user to / with the right query params so
// landing.tsx auto-opens the modal in login mode.
export default function LoginRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect");
    // SECURITY: only honour relative-path redirects. An attacker could craft
    // /login?redirect=https://evil.com hoping landing.tsx forwards there
    // after a successful login. Reject anything that doesn't start with a
    // single forward slash (so `//evil.com` and `https://...` are both out).
    const safe = redirect && /^\/(?![/\\])/.test(redirect) ? redirect : null;
    const target = safe ? `/?redirect=${encodeURIComponent(safe)}` : "/";
    navigate(target, { replace: true });
  }, []);
  return null;
}
