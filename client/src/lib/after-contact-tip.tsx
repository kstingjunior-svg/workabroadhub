/**
 * After a job seeker contacts an employer (free), suggest — once per session —
 * a genuinely relevant next step: get their CV ready. Non-blocking toast, never a
 * modal, never before the contact (FREEMIUM_RULES: prompts only after a deliberate
 * action, always dismissible). Tracked as a conversion event (no personal data).
 */
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { conv, CONV } from "@/lib/conversion-events";

const KEY = "wah_after_contact_tip_shown";

export function showAfterContactTip(source: "kazi" | "kenyan_jobs") {
  conv(CONV.LOCAL_CONTACT, { feature: source }); // every contact is counted
  try { if (sessionStorage.getItem(KEY)) return; sessionStorage.setItem(KEY, "1"); } catch { /* storage blocked — still show once */ }
  toast({
    title: "Good luck! Employers often ask for a CV",
    description: "Get your CV recruiter-ready before they reply — CV services from KES 200.",
    duration: 9000,
    action: (
      <ToastAction altText="See CV services" onClick={() => { conv(CONV.AFTER_CONTACT_CV_CLICK, { feature: source }); window.location.href = "/services"; }}>
        See CV help
      </ToastAction>
    ),
  });
}
