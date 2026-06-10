"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startDeadlineReminderScheduler = startDeadlineReminderScheduler;
// @ts-nocheck
const db_1 = require("./db");
const drizzle_orm_1 = require("drizzle-orm");
const email_1 = require("./email");
const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DAYS_BEFORE = 3;
async function checkDeadlineReminders() {
    try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + DAYS_BEFORE);
        // Find all applications with a deadline within the next 3 days that haven't had a reminder sent
        const due = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT
        ta.id,
        ta.user_id,
        ta.job_title,
        ta.company_name,
        ta.deadline,
        u.email,
        u.first_name,
        EXTRACT(DAY FROM (ta.deadline - NOW()))::int AS days_left
      FROM tracked_applications ta
      JOIN users u ON u.id = ta.user_id
      WHERE ta.deadline IS NOT NULL
        AND ta.reminder_sent = false
        AND ta.deadline >= NOW()
        AND ta.deadline <= NOW() + INTERVAL '3 days'
        AND u.email IS NOT NULL
    `);
        const rows = due.rows;
        if (rows.length === 0) {
            console.log("[DeadlineReminder] No reminders due.");
            return;
        }
        console.log(`[DeadlineReminder] Sending ${rows.length} reminder(s)…`);
        let sent = 0;
        let failed = 0;
        for (const row of rows) {
            try {
                const result = await (0, email_1.sendDeadlineReminderEmail)(row.email, row.first_name, {
                    title: row.job_title,
                    company: row.company_name,
                    deadline: new Date(row.deadline),
                    daysLeft: Math.max(0, row.days_left),
                });
                if (result.success) {
                    // Mark reminder as sent
                    await db_1.db.execute((0, drizzle_orm_1.sql) `
            UPDATE tracked_applications SET reminder_sent = true WHERE id = ${row.id}
          `);
                    sent++;
                }
                else {
                    console.warn(`[DeadlineReminder] Email failed for ${row.email}: ${result.error}`);
                    failed++;
                }
            }
            catch (err) {
                console.error(`[DeadlineReminder] Error processing ${row.id}:`, err.message);
                failed++;
            }
        }
        console.log(`[DeadlineReminder] Done — ${sent} sent, ${failed} failed.`);
    }
    catch (err) {
        console.error("[DeadlineReminder] Check failed:", err.message);
    }
}
function startDeadlineReminderScheduler() {
    console.log(`[DeadlineReminder] Scheduler started (daily, ${DAYS_BEFORE}-day lead time).`);
    // Run once at startup after a 30s delay, then every 24h
    setTimeout(() => {
        checkDeadlineReminders();
        setInterval(checkDeadlineReminders, REMINDER_INTERVAL_MS);
    }, 30000);
}
