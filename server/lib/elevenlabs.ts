// @ts-nocheck
import { ElevenLabsClient } from "elevenlabs";
import fs from "fs";
import { Readable } from "stream";
import path from "path";

if (!process.env.ELEVENLABS_API_KEY) {
  console.warn("[ElevenLabs] ELEVENLABS_API_KEY not set — voice features will be unavailable.");
}

export const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY ?? "",
});

// Default voice: warm African female (override via ELEVENLABS_VOICE_ID env var)
// Recommended for Nanjila: set ELEVENLABS_VOICE_ID to a custom Kenyan female voice
// created in your ElevenLabs dashboard → Voice Lab → Instant Voice Clone
export const ELEVENLABS_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID ?? "cgSgspJ2msm6clMCkdW9"; // Lily — warm, friendly

// Nanjila voice settings — African accent clarity + warmth
const NANJILA_VOICE_SETTINGS = {
  stability: 0.50,       // natural variation — expressive, not robotic
  similarityBoost: 0.75, // stays true to the voice character
  style: 0.30,           // stronger style presence for cultural warmth
  useSpeakerBoost: true,
};

const NANJILA_SPEED = 0.90; // slightly slower → clear, easy to follow

/**
 * generateVoiceFile — converts text → MP3 file in /tmp.
 * Returns the filename (e.g. "wa_voice_1712345678901.mp3").
 * Auto-deletes after 5 minutes.
 */
export async function generateVoiceFile(text: string): Promise<string> {
  const client = new ElevenLabsClient({
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
    } as any,
  });

  const filename = `wa_voice_${Date.now()}.mp3`;
  const filepath = path.join("/tmp", filename);

  await new Promise<void>((resolve, reject) => {
    const readable = Readable.fromWeb(audioStream as any);
    const writer = fs.createWriteStream(filepath);
    readable.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });

  // Auto-clean after 5 minutes so /tmp doesn't fill up
  setTimeout(() => fs.unlink(filepath, () => {}), 5 * 60 * 1000);

  console.log(`[ElevenLabs] Voice file generated: ${filename} (voiceId=${voiceId})`);
  return filename;
}
