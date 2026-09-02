// @ts-nocheck
import { pool, db } from "../db";
import { sendWhatsApp } from "./whatsapp";
import { storage } from "../storage";
import { cvQueue } from "../lib/cvQueue";
import { generateCV } from "./cv";
import { userCareerProfiles } from "@shared/schema";
import { eq } from "drizzle-orm";

// Normalize raw payment IDs to a canonical slug.
// Resolution order:
//   1. payment.serviceSlug — explicit field set by the initiating route
//   2. metadata.serviceSlug — stored in JSON at STK push time (primary path)
//   3. payment.serviceId / service_id — raw value; skip UUIDs (36-char with hyphens)
//   4. planId — for plan purchases ("plan_pro" → "pro")
function resolveSlug(payment: any): string {
  // 1. Explicit slug field
  if (payment.serviceSlug) return String(payment.serviceSlug).toLowerCase();

  // 2. Slug baked into metadata JSON by POST /api/pay
  try {
    const meta: Record<string, any> =
      typeof payment.metadata === "string"
        ? JSON.parse(payment.metadata)
        : (payment.metadata ?? {});
    if (meta.serviceSlug) return String(meta.serviceSlug).toLowerCase();
  } catch { /* malformed JSON — continue */ }

  // 3. Fallback: serviceId/service_id if it looks like a slug (not a UUID)
  const raw: string =
    payment.serviceId ??
    payment.service_id ??
    payment.planId ??
    payment.plan_id ??
    "";

  // UUID pattern — 8-4-4-4-12 hex separated by hyphens; useless as a slug
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    return "";
  }

  return raw.startsWith("plan_") ? raw.replace("plan_", "") : raw.toLowerCase();
}

export async function deliverService(payment: any, user: any): Promise<void> {
  const slug = resolveSlug(payment);
  const phone: string = user.phone ?? payment.phone ?? "";
  const firstName: string = user.firstName ?? user.first_name ?? "";
  const lastName: string  = user.lastName  ?? user.last_name  ?? "";
  const name: string = [firstName, lastName].filter(Boolean).join(" ") || user.email?.split("@")[0] || "there";
  const amount: number = Number(payment.amount ?? 0);
  // The raw serviceId stored on the payment — used as the key in user_services.
  const rawServiceId: string =
    payment.serviceId ?? payment.service_id ?? payment.planId ?? payment.plan_id ?? slug;
  const paymentId: string = payment.id ?? payment.paymentId ?? "";

  console.log(`[deliverService] slug="${slug}" userId=${user.id} phone=${phone}`);

  // NOTE: unlockService is called as Step 2 of runPaymentPipeline, before deliverService.
  // deliverService is pure delivery — WhatsApp messages, CV queue, booking confirmations.

  switch (slug) {

    // ─── 1. ATS CV OPTIMIZATION ──────────────────────────────────────────────
    case "ats_cv_optimization":
    case "cv_service":
    case "cv_services": {
      // 2026-07 (Tony's audit fix): removed cvQueue.add — same duplication
      // as cv_fix_lite below. New unified processOrder handles the real
      // generation and notifyOrderCompleted sends the ready-to-download
      // email + WhatsApp when the AI finishes. See service-order-routes.ts.
      await sendWhatsApp(
        phone,
        `✅ Payment Confirmed — KES ${amount.toLocaleString()} received!\n\nHi ${name}, your ATS-optimised CV is being generated right now. We'll message you here the moment it's ready (usually 1-2 minutes).\n\nThank you for choosing WorkAbroad Hub 🌍`,
      ).catch((err) => reportRejection(err, 'services/delivery'));

      storage.createUserNotification({
        userId: user.id,
        type: "info",
        title: "CV Generation Started",
        message:
          "Your ATS CV is being generated. You'll get a WhatsApp + email the moment it's ready.",
      }).catch((err) => reportRejection(err, 'services/delivery'));

      break;
    }

    // ─── 2. INTERVIEW COACHING ───────────────────────────────────────────────
    case "interview_coaching": {
      await sendWhatsApp(
        phone,
        `🎯 Interview Coaching Activated!\n\nHi ${name}, thank you for your payment of KES ${amount.toLocaleString()}.\n\nNanjila will reach out shortly on WhatsApp to schedule your session.\n\nPlease reply with:\n1️⃣ Target Job Role\n2️⃣ Target Country\n\nGet ready to land your overseas job! 💼`,
      ).catch((err) => reportRejection(err, 'services/delivery'));

      storage.createUserNotification({
        userId: user.id,
        type: "success",
        title: "Interview Coaching Activated",
        message:
          "Check your WhatsApp — Nanjila will reach out to schedule your coaching session.",
      }).catch((err) => reportRejection(err, 'services/delivery'));

      break;
    }

    // ─── 3. JOB ALERTS SUBSCRIPTION ──────────────────────────────────────────
    case "job_alerts": {
      await pool.query(
        `UPDATE users SET job_alerts_active = true WHERE id = $1`,
        [user.id],
      );

      await sendWhatsApp(
        phone,
        `🚀 Job Alerts Activated!\n\nHi ${name}, you'll now receive verified international jobs directly on WhatsApp.\n\nPayment of KES ${amount.toLocaleString()} confirmed ✅\n\nStay ready — your next opportunity is coming!`,
      ).catch((err) => reportRejection(err, 'services/delivery'));

      storage.createUserNotification({
        userId: user.id,
        type: "success",
        title: "Job Alerts Activated",
        message:
          "You'll now receive verified international job alerts directly on WhatsApp.",
      }).catch((err) => reportRejection(err, 'services/delivery'));

      break;
    }

    // ─── 4. PRO / BASIC PLAN SUBSCRIPTIONS ───────────────────────────────────
    case "pro":
    case "basic":
    case "starter": {
      const planLabel =
        slug === "pro" ? "Pro" : slug === "basic" ? "Basic" : "Starter";

      // Fetch career profile then generate CV immediately — inline delivery,
      // no queue needed for plan activations.
      let cvText: string | null = null;
      try {
        const [careerProfile] = await db
          .select()
          .from(userCareerProfiles)
          .where(eq(userCareerProfiles.userId, user.id));

        cvText = await generateCV(user, careerProfile ?? null);

        // Persist so the dashboard can display it
        await pool.query(
          `UPDATE users SET generated_cv = $1 WHERE id = $2`,
          [cvText, user.id],
        );
        console.log(`[deliverService] CV generated and saved for userId=${user.id} (${cvText.length} chars)`);
      } catch (cvErr: any) {
        console.error(`[deliverService] CV generation failed for userId=${user.id}:`, cvErr?.message);
      }

      const waMessage = cvText
        ? [
            `🎉 Payment Received!`,
            ``,
            `Welcome to WorkAbroad Hub ${planLabel} ✅`,
            ``,
            `Hi ${name}, your account is now ACTIVE for 360 days.`,
            ``,
            `📄 Your ATS-Optimised CV:`,
            ``,
            cvText.substring(0, 1200),   // WhatsApp cap ~1,600 chars per message
            cvText.length > 1200 ? `\n…(full CV in your dashboard)` : ``,
            ``,
            `👉 Start applying for jobs now:`,
            `https://workabroadhub.tech`,
            ``,
            `- Nanjila 🤖`,
          ].join("\n")
        : [
            `🌟 ${planLabel} Plan Activated!`,
            ``,
            `Hi ${name}, your WorkAbroad Hub ${planLabel} plan is now live for 360 days.`,
            `Payment of KES ${amount.toLocaleString()} confirmed ✅`,
            ``,
            `Your ATS CV is being prepared and will be sent to this number shortly.`,
            ``,
            `👉 https://workabroadhub.tech`,
            ``,
            `- Nanjila 🤖`,
          ].join("\n");

      await sendWhatsApp(phone, waMessage).catch((err) => reportRejection(err, 'services/delivery'));

      storage.createUserNotification({
        userId: user.id,
        type: "success",
        title: `${planLabel} Plan Activated`,
        message: cvText
          ? `Your ${planLabel} plan is active for 360 days. Your ATS CV has been sent to your WhatsApp.`
          : `Your ${planLabel} plan is active for 360 days. Your ATS CV will arrive on WhatsApp shortly.`,
      }).catch((err) => reportRejection(err, 'services/delivery'));

      break;
    }

    // ─── 5. VISA GUIDE ────────────────────────────────────────────────────────
    case "visa_guide":
    case "visa": {
      await sendWhatsApp(
        phone,
        `📄 Visa Guide Ready!\n\nHi ${name}, thank you for your payment of KES ${amount.toLocaleString()} ✅\n\nYour comprehensive visa guide is now available in your WorkAbroad Hub dashboard under *My Services*.\n\nFor any questions, reply to this message and Nanjila will assist you 🤝`,
      ).catch((err) => reportRejection(err, 'services/delivery'));

      storage.createUserNotification({
        userId: user.id,
        type: "success",
        title: "Visa Guide Unlocked",
        message:
          "Your visa guide is available in your dashboard under My Services.",
      }).catch((err) => reportRejection(err, 'services/delivery'));

      break;
    }

    // ─── 6. CONSULTATION BOOKING ─────────────────────────────────────────────
    case "consultation":
    case "consult": {
      await sendWhatsApp(
        phone,
        `📞 Consultation Booked!\n\nHi ${name}, your payment of KES ${amount.toLocaleString()} has been received ✅\n\nOur team will contact you within 24 hours on WhatsApp to confirm your consultation slot.\n\nIf you have any questions before then, simply reply to this message.\n\n— WorkAbroad Hub Team 🌍`,
      ).catch((err) => reportRejection(err, 'services/delivery'));

      storage.createUserNotification({
        userId: user.id,
        type: "success",
        title: "Consultation Confirmed",
        message:
          "Our team will contact you within 24 hours to confirm your consultation slot.",
      }).catch((err) => reportRejection(err, 'services/delivery'));

      break;
    }

    // ─── 7. CV FIX LITE ──────────────────────────────────────────────────────
    case "cv_fix_lite":
    case "cv_fix": {
      // 2026-07 (Tony's audit fix): removed the cvQueue.add("generate_cv") that
      // ran the OLD generator alongside the new unified processOrder flow.
      // The old queue produced a DIFFERENT CV (based on user profile) and
      // WhatsApp'd its preview to the user, while the new flow produced the
      // REAL revamped CV from the uploaded document. Users got contradictory
      // outputs. Now: only the new flow runs. The "your CV is ready"
      // WhatsApp+email is sent by notifyOrderCompleted() the moment the AI
      // finishes — see server/service-order-routes.ts.
      await sendWhatsApp(
        phone,
        `✅ CV Revamp Confirmed — KES ${amount.toLocaleString()} received!\n\nHi ${name}, your CV is being revamped right now — cleaner structure, sharper achievement bullets, stronger recruiter keywords. We'll message you here the moment it's ready (usually 1-2 minutes).\n\n— Nanjila 🤖`,
      ).catch((err) => { console.error('[deliverService] WhatsApp failed:', { error: err?.message, timestamp: new Date().toISOString() }); });

      storage.createUserNotification({
        userId: user.id,
        type: "info",
        title: "CV Revamp In Progress",
        message: "Your CV is being revamped. You'll get a WhatsApp + email the moment it's ready.",
      }).catch((err) => { console.error('[deliverService] Notification failed:', err?.message); });

      break;
    }

    // ─── 8. JOB APPLICATION PACK (5 applications) ────────────────────────────
    case "job_pack_5":
    case "job_pack": {
      await sendWhatsApp(
        phone,
        `🗂️ Job Pack Activated — KES ${amount.toLocaleString()} confirmed!\n\nHi ${name}, your *5-Application Pack* is now live.\n\nLogin to your dashboard and submit job URLs — our AI will generate a tailored CV + cover letter for each one automatically.\n\n👉 https://workabroadhub.tech/dashboard\n\n— Nanjila 🤖`,
      ).catch((err) => { console.error('[deliverService] WhatsApp failed:', { error: err?.message, timestamp: new Date().toISOString() }); });

      storage.createUserNotification({
        userId: user.id,
        type: "success",
        title: "Job Pack Activated — 5 Applications Ready",
        message: "Submit job URLs from your dashboard. Tailored CV + cover letter generated automatically for each job.",
      }).catch((err) => { console.error('[deliverService] Notification failed:', err?.message); });

      break;
    }

    // ─── 9. ASSISTED APPLY LITE — 5 real application kits ────────────────────
    // 2026-08 (Tony's audit): the AI pipeline (processOrder) now generates
    // 5 tailored CV+cover letter kits per order via SERVICE_CONFIGS. This
    // handler only sends the "we're preparing them" confirmation — the real
    // deliverable arrives via notifyOrderCompleted (email + WhatsApp with PDF).
    case "assisted_apply_lite":
    case "assisted_apply": {
      await sendWhatsApp(
        phone,
        `📦 Assisted Apply Confirmed — KES ${amount.toLocaleString()} received!\n\nHi ${name}, we're preparing your 5 tailored application kits right now.\n\nEach kit includes a custom CV + cover letter for a real overseas employer that's currently hiring, plus step-by-step submission instructions.\n\nYou'll get the full PDF via WhatsApp and email in ~3 minutes.\n\n— WorkAbroad Hub 🌍`,
      ).catch((err) => { console.error('[deliverService] WhatsApp failed:', { error: err?.message, timestamp: new Date().toISOString() }); });

      storage.createUserNotification({
        userId: user.id,
        type: "info",
        title: "Preparing your 5 application kits",
        message: "Your 5 tailored application kits are being generated. You'll receive the PDF via WhatsApp + email in ~3 minutes.",
      }).catch((err) => { console.error('[deliverService] Notification failed:', err?.message); });

      break;
    }

    // ─── 10. GUIDED APPLY — 5 kits + tracker + interview prep bundle ─────────
    case "guided_apply":
    case "document_prep": {
      await sendWhatsApp(
        phone,
        `📋 Guided Apply Confirmed — KES ${amount.toLocaleString()} received!\n\nHi ${name}, we're preparing your premium bundle:\n\n✅ 5 tailored application kits (real employers)\n✅ 30-day tracker (pre-filled)\n✅ Interview prep for your top 3\n✅ 4 weeks of Monday WhatsApp check-ins\n\nFull bundle PDF arrives via WhatsApp + email in ~4 minutes.\n\n— WorkAbroad Hub 🌍`,
      ).catch((err) => { console.error('[deliverService] WhatsApp failed:', { error: err?.message, timestamp: new Date().toISOString() }); });

      storage.createUserNotification({
        userId: user.id,
        type: "info",
        title: "Preparing your Guided Apply bundle",
        message: "Your 5 kits + tracker + interview prep bundle is being generated. Delivery via WhatsApp + email in ~4 minutes.",
      }).catch((err) => { console.error('[deliverService] Notification failed:', err?.message); });

      break;
    }

    // ─── 11. VISA CONSULTATION ────────────────────────────────────────────────
    case "visa_consultation": {
      await sendWhatsApp(
        phone,
        `🛂 Visa Consultation Booked — KES ${amount.toLocaleString()} received!\n\nHi ${name}, your visa consultation is confirmed ✅\n\nOur visa specialist will contact you within 24 hours on WhatsApp to schedule your session.\n\nPlease have ready:\n• Passport copy\n• Target country\n• Employment offer (if any)\n\n— WorkAbroad Hub 🌍`,
      ).catch((err) => { console.error('[deliverService] WhatsApp failed:', { error: err?.message, timestamp: new Date().toISOString() }); });

      storage.createUserNotification({
        userId: user.id,
        type: "success",
        title: "Visa Consultation Booked",
        message: "Our visa specialist will contact you within 24 hours to schedule your consultation.",
      }).catch((err) => { console.error('[deliverService] Notification failed:', err?.message); });

      break;
    }

    // ─── 12. ATS CV OPTIMIZATION ALIASES ─────────────────────────────────────
    case "ats_cv":
    case "ats_cv_optimization_v2": {
      // 2026-07 (Tony's audit fix): same duplication issue as the other CV
      // cases above — cvQueue.add ran the old generator alongside the new
      // unified processOrder. Removed. notifyOrderCompleted handles delivery.
      await sendWhatsApp(
        phone,
        `✅ ATS CV Optimization Confirmed — KES ${amount.toLocaleString()} received!\n\nHi ${name}, your ATS-optimised CV is being generated right now. We'll message you here the moment it's ready (usually 1-2 minutes).\n\n— WorkAbroad Hub 🌍`,
      ).catch((err) => { console.error('[deliverService] WhatsApp failed:', { error: err?.message, timestamp: new Date().toISOString() }); });

      storage.createUserNotification({
        userId: user.id,
        type: "info",
        title: "CV Optimization Started",
        message: "Your ATS-optimised CV is being generated and will arrive on WhatsApp shortly.",
      }).catch((err) => { console.error('[deliverService] Notification failed:', err?.message); });

      break;
    }

    // ─── 13. COUNTRY-SPECIFIC CV REWRITE ─────────────────────────────────────
    case "cv_rewrite": {
      // 2026-07 (audit FIND-1): dedicated case so users get service-specific
      // confirmation instead of the generic default handler.
      await sendWhatsApp(
        phone,
        `✅ Country CV Rewrite Confirmed — KES ${amount.toLocaleString()} received!\n\nHi ${name}, your CV is being rewritten to match the format employers in your target country actually expect. We'll message you here the moment it's ready (usually 1-2 minutes).\n\n— WorkAbroad Hub 🌍`,
      ).catch((err) => { console.error('[deliverService] WhatsApp failed:', { error: err?.message, timestamp: new Date().toISOString() }); });
      storage.createUserNotification({
        userId: user.id,
        type: "info",
        title: "Country CV Rewrite In Progress",
        message: "Your country-specific CV rewrite is being prepared. You'll get a WhatsApp + email the moment it's ready.",
      }).catch((err) => { console.error('[deliverService] Notification failed:', err?.message); });
      break;
    }

    // ─── 14. COVER LETTER ────────────────────────────────────────────────────
    case "cover_letter": {
      await sendWhatsApp(
        phone,
        `✅ Cover Letter Confirmed — KES ${amount.toLocaleString()} received!\n\nHi ${name}, we're writing a cover letter that opens with a hook and reads like a human wrote it — not a template. Ready in 1-2 minutes on this WhatsApp + your email.\n\n— WorkAbroad Hub 🌍`,
      ).catch((err) => { console.error('[deliverService] WhatsApp failed:', { error: err?.message, timestamp: new Date().toISOString() }); });
      storage.createUserNotification({
        userId: user.id,
        type: "info",
        title: "Cover Letter In Progress",
        message: "Your cover letter is being written. You'll get a WhatsApp + email the moment it's ready.",
      }).catch((err) => { console.error('[deliverService] Notification failed:', err?.message); });
      break;
    }

    // ─── 15. STATEMENT OF PURPOSE ────────────────────────────────────────────
    case "sop_writing": {
      await sendWhatsApp(
        phone,
        `✅ SOP Confirmed — KES ${amount.toLocaleString()} received!\n\nHi ${name}, we're writing your Statement of Purpose right now — the kind admissions officers actually finish reading. Ready in a few minutes on this WhatsApp + your email.\n\n— WorkAbroad Hub 🌍`,
      ).catch((err) => { console.error('[deliverService] WhatsApp failed:', { error: err?.message, timestamp: new Date().toISOString() }); });
      storage.createUserNotification({
        userId: user.id,
        type: "info",
        title: "Statement of Purpose In Progress",
        message: "Your SOP is being written. You'll get a WhatsApp + email the moment it's ready.",
      }).catch((err) => { console.error('[deliverService] Notification failed:', err?.message); });
      break;
    }

    // ─── 16. MOTIVATION LETTER ───────────────────────────────────────────────
    case "motivation_letter": {
      await sendWhatsApp(
        phone,
        `✅ Motivation Letter Confirmed — KES ${amount.toLocaleString()} received!\n\nHi ${name}, your formal motivation letter (EU / scholarship / work permit standard) is being drafted. Ready in 1-2 minutes on this WhatsApp + your email.\n\n— WorkAbroad Hub 🌍`,
      ).catch((err) => { console.error('[deliverService] WhatsApp failed:', { error: err?.message, timestamp: new Date().toISOString() }); });
      storage.createUserNotification({
        userId: user.id,
        type: "info",
        title: "Motivation Letter In Progress",
        message: "Your motivation letter is being drafted. You'll get a WhatsApp + email the moment it's ready.",
      }).catch((err) => { console.error('[deliverService] Notification failed:', err?.message); });
      break;
    }

    // ─── 17. ATS + COVER LETTER BUNDLE ───────────────────────────────────────
    case "ats_cover_bundle": {
      await sendWhatsApp(
        phone,
        `✅ ATS + Cover Letter Bundle Confirmed — KES ${amount.toLocaleString()} received!\n\nHi ${name}, we're preparing BOTH your ATS-optimised CV and a matching cover letter — same role, same country, one clean package. Ready in a few minutes on this WhatsApp + your email.\n\n— WorkAbroad Hub 🌍`,
      ).catch((err) => { console.error('[deliverService] WhatsApp failed:', { error: err?.message, timestamp: new Date().toISOString() }); });
      storage.createUserNotification({
        userId: user.id,
        type: "info",
        title: "Bundle In Progress",
        message: "Your CV + cover letter bundle is being prepared. You'll get a WhatsApp + email the moment it's ready.",
      }).catch((err) => { console.error('[deliverService] Notification failed:', err?.message); });
      break;
    }

    // ─── 18. LINKEDIN OPTIMIZATION (paid via service-order-flow) ─────────────
    case "linkedin_optimization": {
      await sendWhatsApp(
        phone,
        `✅ LinkedIn Optimization Confirmed — KES ${amount.toLocaleString()} received!\n\nHi ${name}, we're preparing your LinkedIn optimization guide — headline, About section, skills, and a keyword strategy tuned for recruiters. Ready in a few minutes on this WhatsApp + your email.\n\n— WorkAbroad Hub 🌍`,
      ).catch((err) => { console.error('[deliverService] WhatsApp failed:', { error: err?.message, timestamp: new Date().toISOString() }); });
      storage.createUserNotification({
        userId: user.id,
        type: "info",
        title: "LinkedIn Optimization In Progress",
        message: "Your LinkedIn optimization is being prepared. You'll get a WhatsApp + email the moment it's ready.",
      }).catch((err) => { console.error('[deliverService] Notification failed:', err?.message); });
      break;
    }

    // ─── DEFAULT ─────────────────────────────────────────────────────────────
    default: {
      // Unknown service — send a generic confirmation so the user always
      // gets a WhatsApp receipt and an in-app notification.
      console.warn(`[deliverService] No specific handler for slug="${slug}" — sending generic confirmation`);

      if (phone) {
        await sendWhatsApp(
          phone,
          `✅ Payment Confirmed!\n\nHi ${name}, your payment of KES ${amount.toLocaleString()} has been received.\n\nYour service is being processed. Our team will reach out if any further action is needed.\n\n— WorkAbroad Hub 🌍`,
        ).catch((err) => reportRejection(err, 'services/delivery'));
      }

      storage.createUserNotification({
        userId: user.id,
        type: "info",
        title: "Payment Received",
        message: `Your payment of KES ${amount.toLocaleString()} was received. Your service is being processed.`,
      }).catch((err) => reportRejection(err, 'services/delivery'));

      break;
    }
  }
}
