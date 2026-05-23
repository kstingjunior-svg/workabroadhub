"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ELEVENLABS_VOICE_ID = exports.elevenlabs = void 0;
exports.generateVoiceFile = generateVoiceFile;
// @ts-nocheck
const elevenlabs_1 = require("elevenlabs");
const fs_1 = __importDefault(require("fs"));
const stream_1 = require("stream");
const path_1 = __importDefault(require("path"));
if (!process.env.ELEVENLABS_API_KEY) {
    console.warn("[ElevenLabs] ELEVENLABS_API_KEY not set — voice features will be unavailable.");
}
exports.elevenlabs = new elevenlabs_1.ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY ?? "",
});
// Default voice: warm African female (override via ELEVENLABS_VOICE_ID env var)
// Recommended for Nanjila: set ELEVENLABS_VOICE_ID to a custom Kenyan female voice
// created in your ElevenLabs dashboard → Voice Lab → Instant Voice Clone
exports.ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "cgSgspJ2msm6clMCkdW9"; // Lily — warm, friendly
// Nanjila voice settings — African accent clarity + warmth
const NANJILA_VOICE_SETTINGS = {
    stability: 0.50, // natural variation — expressive, not robotic
    similarityBoost: 0.75, // stays true to the voice character
    style: 0.30, // stronger style presence for cultural warmth
    useSpeakerBoost: true,
};
const NANJILA_SPEED = 0.90; // slightly slower → clear, easy to follow
/**
 * generateVoiceFile — converts text → MP3 file in /tmp.
 * Returns the filename (e.g. "wa_voice_1712345678901.mp3").
 * Auto-deletes after 5 minutes.
 */
async function generateVoiceFile(text) {
    const client = new elevenlabs_1.ElevenLabsClient({
        apiKey: process.env.ELEVENLABS_API_KEY ?? "",
    });
    const voiceId = process.env.ELEVENLABS_VOICE_ID ?? "cgSgspJ2msm6clMCkdW9";
    const audioStream = await client.textToSpeech.convert(voiceId, {
        text,
        modelId: "eleven_multilingual_v2",
        outputFormat: "mp3_44100_128",
        voiceSettings: {
            ...NANJILA_VOICE_SETTINGS,
            speed: NANJILA_SPEED,
        },
    });
    const filename = `wa_voice_${Date.now()}.mp3`;
    const filepath = path_1.default.join("/tmp", filename);
    await new Promise((resolve, reject) => {
        const readable = stream_1.Readable.fromWeb(audioStream);
        const writer = fs_1.default.createWriteStream(filepath);
        readable.pipe(writer);
        writer.on("finish", resolve);
        writer.on("error", reject);
    });
    // Auto-clean after 5 minutes so /tmp doesn't fill up
    setTimeout(() => fs_1.default.unlink(filepath, () => { }), 5 * 60 * 1000);
    console.log(`[ElevenLabs] Voice file generated: ${filename} (voiceId=${voiceId})`);
    return filename;
}
