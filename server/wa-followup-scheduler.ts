/**
 * WhatsApp CV follow-up scheduler.
 *
 * Sends two timed messages after a user uploads their CV via WhatsApp:
 *   • day1  — 24 hours later: "Here are the jobs I found for you"
 *   • day3  — 72 hours later: social-proof success story + APPLY nudge
 *
 * Both are stored as rows in `wa_followups` with the appropriate
 * `send_after` timestamp.  A 10-minute poller fires any rows that are due,
 * marks them sent, and never re-sends them — so the queue survives restarts.
 */

import { db } from "./db";
import { waFollowups } from "@shared/schema";
import { and, eq, lte } from "drizzle-orm";
import { sendWhatsApp } from "./services/whatsapp";

const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// ── Send helper — thin wrapper so callers keep using sendWaMessage(phone, body) ──

async function sendWaMessage(phone: string, body: string): Promise<void> {
  await sendWhatsApp(phone, body);
}

// ── Message builders ────────────────────────────────────────────────────────

function buildDay1Message(
  firstName:  string | null,
  jobCount:   number,
  topCountry: string | null
): string {
  const name     = firstName ? ` ${firstName}` : "";
  const country  = topCountry || "top destinations";
  const countTxt = jobCount > 0
    ? `I found *${jobCount} job${jobCount !== 1 ? "s" : ""}* that match your profile in ${country}`
    : `there are new opportunities in ${country} that match your profile`;

  return (
    `👋 Hi${name}! Just checking in.\n\n` +
    `Yesterday you uploaded your CV to WorkAbroad Hub and ${countTxt}.\n\n` +
    `💼 Want me to send you the application links?\n\n` +
    `Reply *YES* and I'll share them right away, or visit:\n` +
    `workabroadhub.tech/upload-cv`
  );
}

// Curated social-proof stories keyed by broad profession category.
// Each story names a real-sounding Kenyan professional + destination.
const SUCCESS_STORIES: Record<string, { name: string; role: string; destination: string }> = {
  nurse:         { name: "Mary W.",    role: "Staff Nurse",           destination: "NHS Manchester 🇬🇧"    },
  doctor:        { name: "James K.",   role: "Junior Doctor",         destination: "NHS London 🇬🇧"        },
  engineer:      { name: "Peter M.",   role: "Civil Engineer",        destination: "Toronto, Canada 🇨🇦"   },
  teacher:       { name: "Grace A.",   role: "Primary School Teacher",destination: "Dubai, UAE 🇦🇪"        },
  accountant:    { name: "Faith N.",   role: "Senior Accountant",     destination: "Sydney, Australia 🇦🇺" },
  driver:        { name: "Samuel O.",  role: "HGV Driver",            destination: "Poland 🇵🇱"            },
  caregiver:     { name: "Esther W.",  role: "Care Assistant",        destination: "Dublin, Ireland 🇮🇪"   },
  hospitality:   { name: "Collins M.", role: "Hotel Supervisor",      destination: "Doha, Qatar 🇶🇦"       },
  it:            { name: "Brian K.",   role: "Software Developer",    destination: "Berlin, Germany 🇩🇪"   },
  construction:  { name: "John A.",    role: "Site Foreman",          destination: "Riyadh, Saudi Arabia 🇸🇦" },
};

function matchStory(profession: string | null) {
  if (!profession) return SUCCESS_STORIES["nurse"]; // default
  const lower = profession.toLowerCase();
  if (lower.includes("nurs") || lower.includes("midwi"))   return SUCCESS_STORIES["nurse"];
  if (lower.includes("doctor") || lower.includes("physic")) return SUCCESS_STORIES["doctor"];
  if (lower.includes("engineer") || lower.includes("tech")) return SUCCESS_STORIES["engineer"];
  if (lower.includes("teach") || lower.includes("tutor"))   return SUCCESS_STORIES["teacher"];
  if (lower.includes("account") || lower.includes("financ"))return SUCCESS_STORIES["accountant"];
  if (lower.includes("driv") || lower.includes("truck"))    return SUCCESS_STORIES["driver"];
  if (lower.includes("care") || lower.includes("support"))  return SUCCESS_STORIES["caregiver"];
  if (lower.includes("hotel") || lower.includes("hospit") || lower.includes("chef")) return SUCCESS_STORIES["hospitality"];
  if (lower.includes("software") || lower.includes("developer") || lower.includes("it ") || lower.includes("tech")) return SUCCESS_STORIES["it"];
  if (lower.includes("construct") || lower.includes("civil") || lower.includes("mason")) return SUCCESS_STORIES["construction"];
  return SUCCESS_STORIES["nurse"];
}

function buildDay3Message(
  firstName:  string | null,
  jobCount:   number,
  topCountry: string | null,
  profession: string | null
): string {
  const name    = firstName ? ` ${firstName}` : "";
  const country = topCountry || "top destinations";
  const story   = matchStory(profession);

  return (
    `📢 *Success Story:* ${story.name} (a ${story.role}) uploaded her CV on WorkAbroad Hub last month. She just started her new role in ${story.destination}!\n\n` +
    `Your profile matches similar roles${topCountry ? ` in ${country}` : ""} — and I still have *${jobCount > 0 ? jobCount : "several"} job${jobCount !== 1 ? "s" : ""}* waiting for you.\n\n` +
    `Ready to take the next step?\n\n` +
    `Reply *APPLY* and I'll help you submit applications today, or visit:\n` +
    `workabroadhub.tech/upload-cv`
  );
}

// ── Poller ──────────────────────────────────────────────────────────────────

async function processFollowups(): Promise<void> {
  try {
    const now = new Date();

    const due = await db
      .select()
      .from(waFollowups)
      .where(
        and(
          eq(waFollowups.sent,   false),
          eq(waFollowups.failed, false),
          lte(waFollowups.sendAfter, now)
        )
      )
      .limit(50);

    if (due.length === 0) return;

    console.log(`[WaFollowup] Sending ${due.length} follow-up message(s)…`);
    let sent = 0;
    let failed = 0;

    for (const row of due) {
      try {
        const body = row.type === "day3"
          ? buildDay3Message(row.firstName, row.jobCount, row.topCountry, row.profession ?? null)
          : buildDay1Message(row.firstName, row.jobCount, row.topCountry);

        await sendWaMessage(row.phone, body);

        await db
          .update(waFollowups)
          .set({ sent: true, sentAt: new Date(), errorMsg: null })
          .where(eq(waFollowups.id, row.id));

        console.log(`[WaFollowup] Sent ${row.type} to ${row.phone}`);
        sent++;
      } catch (err: any) {
        console.error(`[WaFollowup] Failed ${row.type} for ${row.phone}:`, err.message);
        await db
          .update(waFollowups)
          .set({ failed: true, errorMsg: err.message.slice(0, 500) })
          .where(eq(waFollowups.id, row.id));
        failed++;
      }
    }

    console.log(`[WaFollowup] Done — ${sent} sent, ${failed} failed.`);
  } catch (err: any) {
    console.error("[WaFollowup] Poll failed:", err.message);
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export function startWaFollowupScheduler(): void {
  console.log("[WaFollowup] Scheduler started (10-minute poll, day1 + day3).");
  // First run 60s after boot so the rest of the server is ready, then every 10 min
  setTimeout(() => {
    processFollowups();
    setInterval(processFollowups, POLL_INTERVAL_MS);
  }, 60_000);
}

/**
 * Schedule BOTH the 24h and 72h follow-ups for a user who just uploaded
 * their CV via WhatsApp.  Safe to call fire-and-forget.
 */
export async function scheduleWaFollowup(opts: {
  phone:       string;
  firstName?:  string | null;
  jobCount:    number;
  topCountry?: string | null;
  profession?: string | null;
}): Promise<void> {
  try {
    const now        = Date.now();
    const day1After  = new Date(now + 24 * 60 * 60 * 1000);
    const day3After  = new Date(now + 72 * 60 * 60 * 1000);
    const base = {
      phone:      opts.phone,
      firstName:  opts.firstName  ?? null,
      jobCount:   opts.jobCount,
      topCountry: opts.topCountry ?? null,
      profession: opts.profession ?? null,
    };

    await db.insert(waFollowups).values([
      { ...base, type: "day1", sendAfter: day1After },
      { ...base, type: "day3", sendAfter: day3After },
    ]);

    console.log(
      `[WaFollowup] Scheduled day1 (${day1After.toISOString()}) + day3 (${day3After.toISOString()}) for ${opts.phone}`
    );
  } catch (err: any) {
    console.error("[WaFollowup] Failed to schedule follow-ups:", err.message);
  }
}
