/**
 * Price Engine — single source of truth for final price calculation.
 * Runs on the server; mirrored by client/src/lib/price-engine.ts.
 *
 * Rules:
 *  • Flash sale is active only when flash_sale=true AND discount_percent>0
 *    AND current time falls within [sale_start, sale_end] (null = unlimited)
 *  • Discount is capped at 80 % to prevent accidental zero-price
 *  • Any unexpected error falls back to base price (no crash allowed)
 */

export interface PriceResult {
  originalPrice:   number;   // base DB price, KES
  finalPrice:      number;   // price to charge, KES
  discountPercent: number;   // 0 if no active sale
  isFlashSale:     boolean;
  saleEndsAt:      string | null;  // ISO string or null
  savings:         number;   // KES saved
}

export interface ServicePriceRow {
  price:            number;
  flashSale:        boolean;
  discountPercent:  number;
  saleStart:        string | Date | null;
  saleEnd:          string | Date | null;
}

export function calcFinalPrice(svc: ServicePriceRow): PriceResult {
  const originalPrice = Math.max(0, Math.round(Number(svc.price) || 0));

  try {
    const now = new Date();
    let isFlashSale    = false;
    let discountPercent = 0;
    let saleEndsAt: string | null = null;

    if (svc.flashSale && Number(svc.discountPercent) > 0) {
      const startOk = !svc.saleStart || new Date(svc.saleStart as string) <= now;
      const endOk   = !svc.saleEnd   || new Date(svc.saleEnd   as string) >= now;

      if (startOk && endOk) {
        isFlashSale     = true;
        discountPercent = Math.min(80, Math.max(1, Math.round(Number(svc.discountPercent))));
        saleEndsAt      = svc.saleEnd ? new Date(svc.saleEnd as string).toISOString() : null;
      }
    }

    const finalPrice = isFlashSale
      ? Math.max(1, Math.round(originalPrice * (1 - discountPercent / 100)))
      : originalPrice;

    return { originalPrice, finalPrice, discountPercent, isFlashSale, saleEndsAt, savings: originalPrice - finalPrice };
  } catch {
    // Failsafe — never crash, always return base price
    return { originalPrice, finalPrice: originalPrice, discountPercent: 0, isFlashSale: false, saleEndsAt: null, savings: 0 };
  }
}
