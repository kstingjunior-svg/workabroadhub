import { useEffect, useRef, useState } from "react";

interface AnimatedNumberProps {
  value: number;
  className?: string;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  "data-testid"?: string;
}

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

/**
 * Renders a number that smoothly counts up/down to its new value every time
 * `value` changes, with a brief glow pulse on the digit to signal the update.
 */
export function AnimatedNumber({
  value,
  className = "",
  suffix = "",
  prefix = "",
  decimals = 0,
  "data-testid": testId,
}: AnimatedNumberProps) {
  const [displayed, setDisplayed] = useState(value);
  const [glowing, setGlowing] = useState(false);
  const prevRef = useRef(value);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const DURATION = 700; // ms

  useEffect(() => {
    if (value === prevRef.current) return;

    const from = prevRef.current;
    const to = value;
    prevRef.current = to;

    // Trigger glow
    setGlowing(true);
    const glowTimer = setTimeout(() => setGlowing(false), 900);

    // Cancel any in-flight animation
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    startTimeRef.current = null;

    function tick(now: number) {
      if (startTimeRef.current === null) startTimeRef.current = now;
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / DURATION, 1);
      const eased = easeOutQuart(progress);
      const current = from + (to - from) * eased;
      setDisplayed(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayed(to);
        rafRef.current = null;
      }
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      clearTimeout(glowTimer);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  const formatted =
    decimals > 0
      ? displayed.toFixed(decimals)
      : Math.round(displayed).toLocaleString();

  return (
    <span
      data-testid={testId}
      className={[
        className,
        "inline-block transition-all duration-300",
        glowing
          ? "drop-shadow-[0_0_8px_currentColor] scale-[1.06]"
          : "scale-100",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        transitionProperty: "filter, transform",
      }}
    >
      {prefix}{formatted}{suffix}
    </span>
  );
}
