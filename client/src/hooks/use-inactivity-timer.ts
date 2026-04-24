import { useEffect, useRef, useCallback } from "react";

const ACTIVITY_EVENTS = ["mousemove", "keypress", "click", "scroll"] as const;

const INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes

interface UseInactivityTimerOptions {
  onIdle: () => void;
  timeout?: number;
  enabled?: boolean;
}

/**
 * Tracks user activity across mousemove, keypress, click, and scroll events.
 * Fires `onIdle` once after `timeout` ms of inactivity (default 30 minutes).
 * Matches the canonical inactivity pattern:
 *
 *   ['mousemove', 'keypress', 'click', 'scroll'].forEach(event => {
 *     document.addEventListener(event, resetInactivityTimer);
 *   });
 *
 * The hook cleans up all event listeners and the timer on unmount.
 * Once idle fires, the timer is NOT reset by further activity.
 */
export function useInactivityTimer({
  onIdle,
  timeout = INACTIVITY_MS,
  enabled = true,
}: UseInactivityTimerOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  const resetTimer = useCallback(() => {
    if (firedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (firedRef.current) return;
      firedRef.current = true;
      onIdleRef.current();
    }, timeout);
  }, [timeout]);

  useEffect(() => {
    if (!enabled) return;

    ACTIVITY_EVENTS.forEach((ev) =>
      document.addEventListener(ev, resetTimer, { passive: true })
    );
    resetTimer();

    return () => {
      ACTIVITY_EVENTS.forEach((ev) =>
        document.removeEventListener(ev, resetTimer)
      );
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, resetTimer]);
}
