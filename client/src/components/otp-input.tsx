/**
 * OtpInput — Netflix-style 6-digit code input.
 *
 * UX features:
 *  - 6 boxed inputs with auto-advance on type
 *  - Backspace walks back to the previous box
 *  - Paste anywhere fills all 6 boxes
 *  - Arrow keys move left/right
 *  - On window-focus (e.g. user comes back from Gmail with the code
 *    just copied) we silently read the clipboard and, if it contains
 *    a 6-digit number, auto-fill the boxes. This is the "Netflix
 *    magic" — the inputs are already waiting with the code when you
 *    come back.
 *  - autoComplete="one-time-code" so iOS/Android native OTP suggestion
 *    bar still works.
 *  - onComplete fires once all 6 digits are filled so the caller can
 *    auto-submit (same UX as Netflix).
 *
 * Props:
 *  - value: current 6-char numeric string ("", "1", "12", ..., "123456")
 *  - onChange(next): called on every change
 *  - onComplete(code): fired exactly once per "full code typed/pasted"
 *  - disabled: locks all boxes
 *  - autoFocus: focuses the first empty box on mount
 */
import { useEffect, useRef, useCallback } from "react";

interface OtpInputProps {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  length?: number;
  "data-testid"?: string;
}

export default function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
  length = 6,
  "data-testid": testId,
}: OtpInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const lastCompleteFor = useRef<string>("");

  const digits = value.replace(/\D/g, "").slice(0, length).split("");
  while (digits.length < length) digits.push("");

  const setDigits = useCallback(
    (next: string[]) => {
      const joined = next.join("").replace(/\D/g, "").slice(0, length);
      onChange(joined);
      if (joined.length === length && lastCompleteFor.current !== joined) {
        lastCompleteFor.current = joined;
        onComplete?.(joined);
      }
      if (joined.length < length) {
        // Reset the "already fired" guard so a fresh full code fires again
        // (e.g. user deleted a digit and retyped).
        if (lastCompleteFor.current.length === length) {
          lastCompleteFor.current = "";
        }
      }
    },
    [length, onChange, onComplete],
  );

  const focusBox = (i: number) => {
    const el = inputsRef.current[Math.max(0, Math.min(length - 1, i))];
    el?.focus();
    el?.select();
  };

  // Auto-focus the first empty box on mount
  useEffect(() => {
    if (!autoFocus) return;
    const firstEmpty = digits.findIndex((d) => !d);
    focusBox(firstEmpty === -1 ? length - 1 : firstEmpty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  // ── The Netflix magic: on window RE-focus, peek at clipboard ─────────
  // If the clipboard holds a 6-digit code (user just copied it from the
  // email in another tab/window), fill the boxes automatically.
  //
  // 2026-10 fix (Tony "sign-in code request has issue"):
  //   - DO NOT read clipboard on mount. That triggered an intrusive
  //     "Allow this site to read clipboard?" prompt the moment the
  //     verify page loaded, before the user had done anything. Many
  //     users denied → every subsequent OTP in the session was broken.
  //     Clipboard is only touched after the user leaves AND comes
  //     back, which is the only time it would plausibly contain a
  //     freshly-copied code anyway.
  //   - Guard visibilitychange with document.visibilityState so we
  //     only run on SHOW, not on HIDE.
  //   - Guard against reading clipboard when the user is actively
  //     typing in the inputs (focus event may fire during normal use).
  useEffect(() => {
    if (disabled) return;
    let cancelled = false;
    let hasBeenHidden = false; // only autofill after a round-trip away

    const tryClipboard = async () => {
      try {
        if (!navigator.clipboard?.readText) return;
        // Only fire if the page is actually visible — Firefox throws
        // on hidden pages, Chrome returns stale cached clipboard.
        if (document.visibilityState !== "visible") return;
        // Only autofill if the input is still empty — don't clobber
        // whatever the user is already typing.
        if (value.replace(/\D/g, "").length > 0) return;
        const text = await navigator.clipboard.readText();
        if (cancelled) return;
        if (!text) return;
        // Accept either a clean 6-digit code OR a code copied out of
        // our Netflix-style boxed digits (which may paste as
        // "1 2 3 4 5 6" or "1\n2\n3\n4\n5\n6" depending on the email
        // client). Strip whitespace, then look for exactly `length`
        // digits in a row.
        const stripped = text.replace(/\s+/g, "");
        const match = stripped.match(new RegExp(`(?:^|\\D)(\\d{${length}})(?:$|\\D)`));
        if (!match) return;
        if (value.replace(/\D/g, "").length > 0) return; // re-check after await
        setDigits(match[1].split(""));
        setTimeout(() => focusBox(length - 1), 0);
      } catch {
        // Clipboard permission denied / not available — fine, user
        // will paste manually with Ctrl+V and the paste handler
        // below fills all 6 boxes.
      }
    };

    const onVisibilityOrFocus = () => {
      if (document.visibilityState === "hidden") {
        hasBeenHidden = true;
        return;
      }
      // Only on returning from away
      if (!hasBeenHidden) return;
      hasBeenHidden = false;
      // tiny delay so the browser has settled the focus event
      setTimeout(tryClipboard, 50);
    };

    window.addEventListener("focus", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, length]);

  const handleChange = (i: number, raw: string) => {
    const d = raw.replace(/\D/g, "");
    // If the user pasted into one box (or iOS OTP autofill dropped the
    // whole 6-digit code into box 0), distribute across the remaining
    // boxes.
    if (d.length > 1) {
      const next = [...digits];
      for (let k = 0; k < d.length && i + k < length; k++) {
        next[i + k] = d[k];
      }
      setDigits(next);
      focusBox(Math.min(i + d.length, length - 1));
      return;
    }
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    if (d && i < length - 1) focusBox(i + 1);
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (digits[i]) {
        const next = [...digits];
        next[i] = "";
        setDigits(next);
      } else if (i > 0) {
        const next = [...digits];
        next[i - 1] = "";
        setDigits(next);
        focusBox(i - 1);
      }
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      focusBox(i - 1);
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      focusBox(i + 1);
      e.preventDefault();
    } else if (e.key === "Enter") {
      // Let the parent form handle submit if full
      if (digits.every((d) => d) && lastCompleteFor.current !== digits.join("")) {
        lastCompleteFor.current = digits.join("");
        onComplete?.(digits.join(""));
      }
    }
  };

  const handlePaste = (i: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text") || "";
    // Strip ALL non-digits — tolerates "1 2 3 4 5 6", "1-2-3-4-5-6",
    // "Your code: 123456", "123 456", etc. First `length` digits win.
    const d = text.replace(/\D/g, "").slice(0, length);
    if (!d) return;
    e.preventDefault();
    const next = [...digits];
    for (let k = 0; k < d.length && i + k < length; k++) {
      next[i + k] = d[k];
    }
    setDigits(next);
    focusBox(Math.min(i + d.length, length - 1));
  };

  return (
    <div className="flex gap-2 justify-center" data-testid={testId}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (inputsRef.current[i] = el)}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={length /* allow single-box paste */}
          value={d}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          onFocus={(e) => e.currentTarget.select()}
          className="w-11 h-14 sm:w-12 sm:h-14 text-center text-2xl font-bold font-mono rounded-md border border-input bg-background text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed"
          aria-label={`Digit ${i + 1} of ${length}`}
          data-testid={`${testId ?? "otp"}-digit-${i}`}
        />
      ))}
    </div>
  );
}
