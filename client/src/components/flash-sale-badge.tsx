import { useEffect, useState } from "react";

interface FlashSaleBadgeProps {
  discountPercent: number;
  saleEndsAt: string | null;
  size?: "sm" | "md" | "lg";
}

function useCountdown(endsAt: string | null) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!endsAt) { setRemaining(null); return; }

    function tick() {
      const ms = new Date(endsAt!).getTime() - Date.now();
      setRemaining(ms > 0 ? ms : 0);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  return remaining;
}

function formatCountdown(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function FlashSaleBadge({ discountPercent, saleEndsAt, size = "md" }: FlashSaleBadgeProps) {
  const remaining = useCountdown(saleEndsAt);
  const expired   = remaining !== null && remaining === 0;
  if (expired) return null;

  const textSize   = size === "sm" ? "text-xs" : size === "lg" ? "text-base" : "text-sm";
  const paddingCls = size === "sm" ? "px-2 py-0.5" : size === "lg" ? "px-4 py-1.5" : "px-3 py-1";

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="flash-sale-badge">
      <span
        className={`inline-flex items-center gap-1 ${paddingCls} rounded-full bg-red-500 text-white font-bold ${textSize} animate-pulse`}
      >
        🔥 FLASH SALE
      </span>
      <span
        className={`inline-flex items-center gap-1 ${paddingCls} rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-bold ${textSize} border border-red-300 dark:border-red-700`}
      >
        {discountPercent}% OFF
      </span>
      {remaining !== null && saleEndsAt && (
        <span
          className={`inline-flex items-center gap-1 ${paddingCls} rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 font-mono font-semibold ${textSize} border border-orange-300 dark:border-orange-700`}
          data-testid="flash-countdown"
        >
          ⏳ {formatCountdown(remaining)}
        </span>
      )}
    </div>
  );
}
