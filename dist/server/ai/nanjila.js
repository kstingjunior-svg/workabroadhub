"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nanjilaAgent = nanjilaAgent;
exports.checkUserServices = checkUserServices;
const openai_1 = require("../lib/openai");
const db_1 = require("../db");
const utils_1 = require("./utils");
async function nanjilaAgent(user, message) {
    const lang = user?.language || (0, utils_1.detectLanguage)(message);
    let languageInstruction = "";
    if (lang === "sw") {
        languageInstruction = "Respond in Swahili (Kiswahili). Be clear and professional.";
    }
    if (lang === "ar") {
        languageInstruction = "Respond in Arabic. Be clear and helpful.";
    }
    if (lang === "en") {
        languageInstruction = "Respond in English.";
    }
    const systemPrompt = `
You are Nanjila, an AI assistant and SALES CLOSER for WorkAbroadHub.

${languageInstruction}

Your goal:
- Help users
- Guide them
- CLOSE them into buying services

You understand:
- Fear (scams, rejection)
- Desire (travel, money, better life)

You must:
- Ask smart questions
- Build trust
- Offer the right service
- Close naturally (not pushy)

Always:
- Be human
- Be persuasive
- Be confident

If user hesitates:
→ reassure them

If user shows interest:
→ guide to payment

If user is confused:
→ simplify

Never sound robotic.
`;
    const response = await openai_1.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
        ],
    });
    return response.choices[0].message.content ?? "";
}
async function checkUserServices(userId) {
    const res = await db_1.pool.query(`SELECT service_name, status
       FROM payments
      WHERE user_id = $1
        AND status = 'success'`, [userId]);
    return res.rows;
}
