// @ts-nocheck
import type { Payment } from "@shared/schema";
import { isPayPalConfigured } from "../paypal";

export type PaymentMethodType = "mpesa" | "paypal";

export interface PaymentRecommendation {
  recommended: PaymentMethodType;
  available: PaymentMethodType[];
  country: string;
  countryName: string;
  fromHistory: boolean;
  alternativeOnFailure: PaymentMethodType;
  isKenyaUser: boolean;
}

export function getAlternativeMethod(
  failedMethod: PaymentMethodType,
  country: string
): PaymentMethodType {
  const isKenya = country === "KE";
  if (isKenya) return "mpesa"; // Kenya always falls back to M-Pesa
  return failedMethod === "mpesa" ? "paypal" : "mpesa";
}

export function getRecommendedPaymentMethod(
  userCountry: string,
  userHistory: Payment[],
  userCountryName = "Unknown"
): PaymentRecommendation {
  const paypalEnabled = isPayPalConfigured();
  const isKenya = userCountry === "KE";

  // Kenya users: M-Pesa only
  if (isKenya) {
    return {
      recommended: "mpesa",
      available: ["mpesa"],
      country: userCountry,
      countryName: userCountryName,
      fromHistory: false,
      alternativeOnFailure: "mpesa",
      isKenyaUser: true,
    };
  }

  // International users: PayPal recommended (if configured), M-Pesa as fallback
  const available: PaymentMethodType[] = [];
  if (paypalEnabled) available.push("paypal");
  available.push("mpesa");

  // Check payment history for preferred method
  const lastSuccessful = userHistory
    .filter((p) => p.status === "success")
    .sort(
      (a, b) =>
        new Date(b.createdAt ?? 0).getTime() -
        new Date(a.createdAt ?? 0).getTime()
    )[0];

  const historyMethod = lastSuccessful?.paymentMethod as
    | PaymentMethodType
    | undefined;

  let recommended: PaymentMethodType;
  let fromHistory = false;

  if (historyMethod && available.includes(historyMethod)) {
    recommended = historyMethod;
    fromHistory = true;
  } else {
    recommended = paypalEnabled ? "paypal" : "mpesa";
  }

  return {
    recommended,
    available,
    country: userCountry,
    countryName: userCountryName,
    fromHistory,
    alternativeOnFailure: recommended === "paypal" ? "mpesa" : (paypalEnabled ? "paypal" : "mpesa"),
    isKenyaUser: false,
  };
}
