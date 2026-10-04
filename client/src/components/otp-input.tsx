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

  // ── The Netflix magic: on window focus, peek at clipboard ────────────
  // If the clipboard holds a 6-digit code (user just copied it from the
  // email), fill the boxes automatically. Silently swallows permission
  // errors — some browsers block clipboard reads outside a user gesture
  // or in insecure contexts. On those browsers, the user just pastes
  // manually and the paste handler below takes over.
  useEffect(() => {
    if (disabled) return;
    let cancelled = false;

    const tryClipboard = async () => {
      try {
        if (!navigator.clipboard?.readText) return;
        const text = await navigator.clipboard.readText();
        if (cancelled) return;
        const match = text?.match(new RegExp(`\\b(\\d{${length}})\\b`));
        if (!match) return;
        // Only autofill if the input is still empty — don't clobber
        // whatever the user is already typing.
        if (value.replace(/\D/g, "").length > 0) return;
        setDigits(match[1].split(""));
        // Focus the last box so Enter/Verify is one keystroke away
        setTimeout(() => focusBox(length - 1), 0);
      } catch {
        // Clipboard permission denied / not available — fine, user
        // will paste manually.
      }
    };

    const onFocus = () => {
      // tiny delay so the browser has settled the focus event before
      // we ask for clipboard access
      setTimeout(tryClipboard, 50);
    };

    // Try once on mount (covers "user navigates to /account/verify
    // with the code already in their clipboard")
    tryClipboard();

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
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
