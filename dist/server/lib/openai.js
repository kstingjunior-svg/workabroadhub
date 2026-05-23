"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openai = void 0;
exports.askGPT = askGPT;
const openai_1 = __importDefault(require("openai"));
// Restored Batch H: routes.ts has ~10 dynamic imports of askGPT that were
// silently failing after the migration.
exports.openai = new openai_1.default({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
        process.env.OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});
async function askGPT(prompt) {
    const res = await exports.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: "You are a professional career assistant." },
            { role: "user", content: prompt },
        ],
        temperature: 0.4,
    });
    return res.choices[0].message.content ?? "";
}
