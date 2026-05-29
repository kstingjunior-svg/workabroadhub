import { nanjilaAgent } from "./nanjila";
import { checkPayment } from "./tools/checkPayment";
import { sendWhatsApp } from "../services/whatsapp";
import { trackEvent } from "./utils";
export { detectLanguage } from "./utils";

export function detectIntent(message: string) {
  const m = message.toLowerCase();

  if (m.includes("job") || m.includes("work abroad")) return "lead";
  if (m.includes("price") || m.includes("how much"))  return "pricing";
  if (m.includes("help me") || m.includes("apply"))   return "hot";
  if (m.includes("later") || m.includes("not now"))   return "hesitant";
  if (m === "yes" || m === "yes please" || m.includes("start now") || m.includes("i'm ready") || m.includes("im ready")) return "closing";
  if (m.includes("scam") || m.includes("trust") || m.includes("safe") || m.includes("fake") || m.includes("legit")) return "trust";

  return "general";
}

export async function handleUserMessage(
  user: { id: number; name?: string; phone?: string; email?: string; language?: string; interests?: any[] },
  message: string
): Promise<string> {
  const lower  = message.toLowerCase();
  const intent = detectIntent(message);

  // 🔥 PERSONALISED — Dubai interest detected
  if (user.interests?.includes("dubai")) {
    return `
I see you're interested in Dubai jobs 🇦🇪

That market is very competitive right now.

To stand out, you need:
✔ Strong CV
✔ Proper application strategy

I can help you get started immediately.

Ready?
`;
  }

  // 🔥 PERSONALISED — general profile recommendation
  if (user.interests && user.interests.length > 0) {
    return `
🔥 Based on your profile:

You need:
✔ ATS CV Optimization
✔ Assisted Apply

I recommend starting with CV first.

👉 Start here:
https://workabroadhub.tech/pay?service=ats_cv_optimization

Let's get you moving.
`;
  }

  // 🔥 LEAD — job/work abroad interest
  if (intent === "lead") {
    return `
I can help you secure verified jobs abroad without agents.

Tell me:
👉 Which country are you targeting?

I'll guide you step-by-step.
`;
  }

  // 🔥 PRICING — keep in sync with DashboardServicesGrid + /services page
  if (intent === "pricing") {
    return `
Our services are super affordable — most cost less than a single mandazi per day.

Here's the current menu:
✔ CV Health Check — FREE (3 min)
✔ CV Fix Lite — KES 99
✔ Cover Letter — KES 149
✔ ATS CV Optimization — KES 499  🔥 (most popular)
✔ Country-Specific CV Rewrite — KES 699
✔ Motivation Letter — KES 699
✔ SOP / Personal Statement — KES 999
✔ LinkedIn Profile Optimization — KES 3,000

For comparison, a typical career consultant in Nairobi charges KES 5,000–25,000 for the same work.

You pay by M-Pesa, AI delivers in minutes, and you download as Word or PDF.

Want me to point you at the right one for what you're trying to do?
`;
  }

  // 🔥 HOT — ready to act
  if (intent === "hot") {
    return `
You're in the right place.

We can help you apply professionally and increase your chances.

🚀 Our Assisted Apply service handles everything for you.

Do you want me to start your application now?
`;
  }

  // 🔥 CLOSING — user confirmed, send payment link
  if (intent === "closing") {
    trackEvent(user?.id ?? null, "click_service", { service: "ats_cv_optimization" }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

    return `
🔥 Let's get you started.

Click here to begin:

👉 https://workabroadhub.tech/pay?service=ats_cv_optimization

Once you pay, I will immediately start working on your CV.
`;
  }

  // 🔥 TRUST — scam/safety concerns
  if (intent === "trust") {
    return `
We don't use agents.

Everything is:
✔ Verified
✔ Transparent
✔ Controlled by you

That's why people trust WorkAbroadHub.

I'm here to guide you safely.
`;
  }

  // 🔥 HESITANT — objection handling
  if (intent === "hesitant") {
    return `
I understand — it's a big step.

But let me be honest:

Most people lose money to fake agents because they wait or go the wrong way.

Here, everything is verified and controlled.

You don't need to risk your money.

Would you like to start safely with a CV first?
`;
  }

  // 🔥 PAYMENT CHECK
  if (lower.includes("paid") || lower.includes("payment")) {
    const payment = await checkPayment(user.id);

    if (!payment) {
      return "❌ I cannot find your payment. Please try again.";
    }

    if (payment.status === "success") {
      return `✅ Payment confirmed for ${payment.service_name} (KES ${payment.amount})`;
    }

    return `⏳ Your payment for ${payment.service_name} is ${payment.status}.`;
  }

  // 🔥 CV REQUEST
  if (lower.includes("cv")) {
    return `
⚠️ Important:

Many job openings close quickly.

If your CV is not ready, you miss the opportunity.

Let's prepare yours now so you're ready to apply immediately.

Ready to proceed?
`;
  }

  // 🔥 LANGUAGE CHANGE
  if (lower.includes("change language")) {
    return "Choose your language: English, Swahili, Arabic.";
  }

  // 🔥 DEFAULT AI RESPONSE
  return await nanjilaAgent(user, message);
}
