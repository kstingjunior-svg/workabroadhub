/**
 * Independent server-side confirmation of an STK "success" callback.
 *
 * 2026-11 (payment audit): the STK callback endpoints trusted ResultCode 0
 * from the request body. The only gate in front of them is
 * safaricomIpGuard, which reads the FIRST X-Forwarded-For entry — a value
 * the caller controls. A forged callback carrying a known CheckoutRequestID
 * could therefore have activated a plan without payment.
 *
 * Before any "success" callback is acted on, we now ask Safaricom directly
 * (STK Query) whether that CheckoutRequestID really completed. If Safaricom
 * can't answer yet, the payment is left pending — the StkRecovery poller
 * re-queries every 30s and activates it once Safaricom confirms, so a real
 * customer is delayed by seconds, never blocked.
 */
import { stkQuery } from "../mpesa";

export type StkConfirmation = "confirmed" | "rejected" | "unavailable";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function confirmStkSuccess(checkoutRequestId: string, attempts = 3): Promise<{ result: StkConfirmation; detail: string }> {
  let lastDetail = "no response";
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(4000);
    try {
      const r: any = await stkQuery(checkoutRequestId);
      const code = r?.ResultCode;
      if (code === 0 || code === "0") return { result: "confirmed", detail: String(r?.ResultDesc ?? "ok") };
      if (code !== undefined && code !== null && code !== "") {
        // Safaricom gave a definitive non-success answer (cancelled, timeout, insufficient funds…)
        return { result: "rejected", detail: `ResultCode=${code} ${r?.ResultDesc ?? ""}`.trim() };
      }
      lastDetail = String(r?.errorMessage ?? r?.ResponseDescription ?? "pending");
    } catch (err: any) {
      // "The transaction is being processed" comes back as an HTTP error — retry.
      lastDetail = String(err?.response?.data?.errorMessage ?? err?.message ?? err).slice(0, 200);
    }
  }
  return { result: "unavailable", detail: lastDetail };
}
