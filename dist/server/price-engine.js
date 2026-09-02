"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.calcFinalPrice = calcFinalPrice;
function calcFinalPrice(svc) {
    const originalPrice = Math.max(0, Math.round(Number(svc.price) || 0));
    try {
        const now = new Date();
        let isFlashSale = false;
        let discountPercent = 0;
        let saleEndsAt = null;
        if (svc.flashSale && Number(svc.discountPercent) > 0) {
            const startOk = !svc.saleStart || new Date(svc.saleStart) <= now;
            const endOk = !svc.saleEnd || new Date(svc.saleEnd) >= now;
            if (startOk && endOk) {
                isFlashSale = true;
                discountPercent = Math.min(80, Math.max(1, Math.round(Number(svc.discountPercent))));
                saleEndsAt = svc.saleEnd ? new Date(svc.saleEnd).toISOString() : null;
            }
        }
        const finalPrice = isFlashSale
            ? Math.max(1, Math.round(originalPrice * (1 - discountPercent / 100)))
            : originalPrice;
        return { originalPrice, finalPrice, discountPercent, isFlashSale, saleEndsAt, savings: originalPrice - finalPrice };
    }
    catch {
        // Failsafe — never crash, always return base price
        return { originalPrice, finalPrice: originalPrice, discountPercent: 0, isFlashSale: false, saleEndsAt: null, savings: 0 };
    }
}
