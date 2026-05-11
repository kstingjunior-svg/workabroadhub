// @ts-nocheck
import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey:
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    "sk-test",
});