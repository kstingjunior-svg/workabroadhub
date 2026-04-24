import { supabase } from "../supabaseClient";

export async function trackEvent(
  userId: number | string | null,
  event: string,
  extra?: { service?: string; page?: string; category?: string; country?: string }
): Promise<void> {
  try {
    await supabase.from("user_events").insert([{
      user_id: userId ? String(userId) : null,
      event,
      ...(extra?.service  ? { category: extra.service } : {}),
      ...(extra?.page     ? { page:     extra.page    } : {}),
      ...(extra?.category ? { category: extra.category } : {}),
      ...(extra?.country  ? { country:  extra.country } : {}),
    }]);
  } catch (err: any) {
    console.warn("[trackEvent] failed:", err.message);
  }
}

export function getVoice(language: string): string {
  if (language === "sw") return "Polly.Joanna"; // closest
  if (language === "ar") return "Polly.Zeina";
  return "Polly.Amy";
}

export function detectLanguage(text: string) {
  const t = text.toLowerCase();

  if (
    t.includes("habari") ||
    t.includes("kazi") ||
    t.includes("nisaidie") ||
    t.includes("tafadhali")
  ) {
    return "sw";
  }

  if (/[\u0600-\u06FF]/.test(text)) {
    return "ar";
  }

  return "en";
}
