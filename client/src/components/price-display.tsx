import { calcFinalPrice, type ServicePriceRow } from "@/lib/price-engine";
import { FlashSaleBadge } from "./flash-sale-badge";

interface PriceDisplayProps {
  service: ServicePriceRow & { name?: string };
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function PriceDisplay({ service, size = "md", className = "" }: PriceDisplayProps) {
  const { originalPrice, finalPrice, discountPercent, isFlashSale, saleEndsAt, savings } =
    calcFinalPrice(service);

  const isFree   = finalPrice === 0;
  const priceStr = isFree ? "Free" : `KES ${finalPrice.toLocaleString()}`;
  const origStr  = `KES ${originalPrice.toLocaleString()}`;

  const finalSize  = size === "sm" ? "text-xl" : size === "lg" ? "text-4xl" : "text-2xl";
  const origSize   = size === "sm" ? "text-sm"  : size === "lg" ? "text-xl"  : "text-base";
  const badgeSize  = size === "sm" ? "text-xs"  : size === "lg" ? "text-sm"  : "text-xs";

  return (
    <div className={`flex flex-col gap-1.5 ${className}`} data-testid="price-display">
      {isFlashSale && (
        <FlashSaleBadge
          discountPercent={discountPercent}
          saleEndsAt={saleEndsAt}
          size={size === "lg" ? "md" : "sm"}
        />
      )}

      <div className="flex items-baseline gap-2 flex-wrap">
        <span
          className={`font-extrabold ${finalSize} ${isFlashSale ? "text-red-600 dark:text-red-400" : "text-foreground"}`}
          data-testid="price-final"
        >
          {priceStr}
        </span>

        {isFlashSale && originalPrice > finalPrice && (
          <span
            className={`line-through text-muted-foreground ${origSize}`}
            data-testid="price-original"
          >
            {origStr}
          </span>
        )}
      </div>

      {isFlashSale && savings > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-semibold ${badgeSize} border border-green-300 dark:border-green-700`}
            data-testid="price-savings"
          >
            You save KES {savings.toLocaleString()} ({discountPercent}%)
          </span>
        </div>
      )}
    </div>
  );
}
