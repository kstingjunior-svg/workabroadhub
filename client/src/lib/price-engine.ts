/**
 * Client-side price engine — mirrors server/price-engine.ts.
 * Runs entirely from data already in the API response; no extra fetch needed.
 */

export interface PriceResult {
  originalPrice:   number;
  finalPrice:      number;
  discountPercent: number;
  isFlashSale:     boolean;
  saleEndsAt:      string | null;
  savings:         number;
}

export interface ServicePriceRow {
  price:            number;
  flashSale?:       boolean;
  flash_sale?:      boolean;
  discountPercent?: number;
  discount_percent?: number;
  saleStart?:       string | null;
  sale_start?:      string | null;
  saleEnd?:         string | null;
  sale_end?:        string | null;
}

export function calcFinalPrice(svc: ServicePriceRow): PriceResult {
  const originalPrice = Math.max(0, Math.round(Number(svc.price) || 0));

  try {
    const flashSale      = svc.flashSale      ?? svc.flash_sale      ?? false;
    const discountPct    = svc.discountPercent ?? svc.discount_percent ?? 0;
    const saleStartRaw   = svc.saleStart      ?? svc.sale_start      ?? null;
    const saleEndRaw     = svc.saleEnd        ?? svc.sale_end        ?? null;

    const now = new Date();
    let isFlashSale    = false;
    let discountPercent = 0;
    let saleEndsAt: string | null = null;

    if (flashSale && Number(discountPct) > 0) {
      const startOk = !saleStartRaw || new Date(saleStartRaw) <= now;
      const endOk   = !saleEndRaw   || new Date(saleEndRaw)   >= now;

      if (startOk && endOk) {
        isFlashSale     = true;
        discountPercent = Math.min(80, Math.max(1, Math.round(Number(discountPct))));
        saleEndsAt      = saleEndRaw ? new Date(saleEndRaw).toISOString() : null;
      }
    }

    const finalPrice = isFlashSale
      ? Math.max(1, Math.round(originalPrice * (1 - discountPercent / 100)))
      : originalPrice;

    return { originalPrice, finalPrice, discountPercent, isFlashSale, saleEndsAt, savings: originalPrice - finalPrice };
  } catch {
    return { originalPrice, finalPrice: originalPrice, discountPercent: 0, isFlashSale: false, saleEndsAt: null, savings: 0 };
  }
}
