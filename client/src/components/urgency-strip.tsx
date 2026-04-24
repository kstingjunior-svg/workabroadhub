import { useEffect, useState } from "react";

interface UrgencyData {
  viewing:          number;
  recentPurchases:  number;
}

interface UrgencyStripProps {
  serviceCode: string;
  saleEndsAt?:  string | null;
}

function useUrgencyStats(serviceCode: string) {
  const [data, setData] = useState<UrgencyData>({ viewing: 0, recentPurchases: 0 });

  useEffect(() => {
    let cancelled = false;

    async function fetch_() {
      try {
        const res = await fetch(`/api/urgency-stats?code=${encodeURIComponent(serviceCode)}`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch { /* ignore — non-critical */ }
    }

    fetch_();
    const id = setInterval(fetch_, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [serviceCode]);

  return data;
}

function useCountdown(endsAt: string | null | undefined) {
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

export function UrgencyStrip({ serviceCode, saleEndsAt }: UrgencyStripProps) {
  const { viewing, recentPurchases } = useUrgencyStats(serviceCode);
  const remaining = useCountdown(saleEndsAt ?? null);
  const showCountdown = remaining !== null && remaining > 0;

  const items = [
    viewing > 0          && { icon: "⚡", text: `${viewing} ${viewing === 1 ? "person" : "people"} viewing this`, color: "text-blue-600 dark:text-blue-400" },
    recentPurchases > 0  && { icon: "🔥", text: `${recentPurchases} purchase${recentPurchases === 1 ? "" : "s"} in the last hour`, color: "text-orange-600 dark:text-orange-400" },
    showCountdown        && { icon: "⏳", text: `Offer ends in ${formatCountdown(remaining!)}`, color: "text-red-600 dark:text-red-400" },
  ].filter(Boolean) as { icon: string; text: string; color: string }[];

  if (items.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-1 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 px-3 py-2"
      data-testid="urgency-strip"
    >
      {items.map((item, i) => (
        <p key={i} className={`text-xs font-semibold flex items-center gap-1.5 ${item.color}`}>
          <span>{item.icon}</span>
          <span>{item.text}</span>
        </p>
      ))}
    </div>
  );
}
