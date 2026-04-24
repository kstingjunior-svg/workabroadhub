import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import nanjilaAvatarUrl from "@assets/generated_images/nanjila_avatar.png";
import { fetchCsrfToken } from "@/lib/queryClient";

const WHATSAPP_NUMBER = "14155238886";
const WAVE_HEIGHTS = [14, 24, 18, 28, 16, 22, 12];

type ChatMessage = {
  id: string;
  role: "user" | "nanjila";
  text: string;
  audioUrl?: string | null;
  jobMatches?: JobMatch[];
  fileName?: string;
  timestamp: Date;
};

type JobMatch = {
  id?: string;
  title: string;
  company: string;
  country: string;
  matchScore: number;
  matchReason: string;
  salary?: string | null;
};

function formatText(text: string): string {
  return text
    .replace(/\*([^*]+)\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");
}

// ── Browser Speech Synthesis fallback ────────────────────────────────────────
// Used when ElevenLabs audio is unavailable (quota, network, or cold start).
// Picks a warm female English voice and matches Nanjila's pacing.
function speakWithBrowser(
  text: string,
  onStart: () => void,
  onEnd: () => void,
): void {
  if (!("speechSynthesis" in window)) { onEnd(); return; }

  // Strip markdown/HTML so the TTS doesn't read asterisks aloud
  const clean = text
    .replace(/<[^>]*>/g, " ")
    .replace(/\*\*?([^*]+)\*\*?/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500); // browser TTS performance degrades beyond ~500 chars

  window.speechSynthesis.cancel(); // stop any previous speech

  const utt = new SpeechSynthesisUtterance(clean);
  utt.lang = "en-US";
  utt.pitch = 1.05;   // slightly higher — warmer female tone
  utt.rate = 0.95;    // slightly slower — clear and calm
  utt.volume = 1;

  // Prefer a known-female English voice; fall back to browser default
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v =>
    v.lang.startsWith("en") && (
      v.name.includes("Samantha") ||       // macOS
      v.name.includes("Google US English") ||
      v.name.includes("Microsoft Zira") || // Windows
      v.name.includes("Karen") ||          // macOS AU
      v.name.toLowerCase().includes("female")
    )
  );
  if (preferred) utt.voice = preferred;

  utt.onstart = onStart;
  utt.onend = onEnd;
  utt.onerror = onEnd;
  window.speechSynthesis.speak(utt);
}

// ── Message Bubble ───────────────────────────────────────────────────────────
function MessageBubble({
  msg,
  showAvatar,
  onPlayStateChange,
}: {
  msg: ChatMessage;
  showAvatar: boolean;
  onPlayStateChange?: (playing: boolean) => void;
}) {
  const isNanjila = msg.role === "nanjila";
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function toggleAudio() {
    if (playing) {
      // Stop whatever is currently playing
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      window.speechSynthesis?.cancel();
      setPlaying(false);
      onPlayStateChange?.(false);
      return;
    }

    if (msg.audioUrl) {
      // ElevenLabs audio available — prefer it
      if (!audioRef.current) {
        audioRef.current = new Audio(msg.audioUrl);
        audioRef.current.onended = () => { setPlaying(false); onPlayStateChange?.(false); };
      }
      audioRef.current.play().then(() => {
        setPlaying(true);
        onPlayStateChange?.(true);
      }).catch(() => {
        // Autoplay blocked — fall through to browser TTS
        speakWithBrowser(msg.text, () => { setPlaying(true); onPlayStateChange?.(true); }, () => { setPlaying(false); onPlayStateChange?.(false); });
      });
    } else {
      // No ElevenLabs audio — use browser speech synthesis
      speakWithBrowser(
        msg.text,
        () => { setPlaying(true); onPlayStateChange?.(true); },
        () => { setPlaying(false); onPlayStateChange?.(false); },
      );
    }
  }

  return (
    <div className={`flex gap-2 mb-3 ${isNanjila ? "justify-start" : "justify-end"}`}>
      {isNanjila && (
        <div className="flex-shrink-0 mt-auto">
          {showAvatar ? (
            <img
              src={nanjilaAvatarUrl}
              alt="Nanjila"
              className="w-7 h-7 rounded-full object-cover"
            />
          ) : (
            <div className="w-7" />
          )}
        </div>
      )}
      <div className={`max-w-[82%] flex flex-col gap-1 ${isNanjila ? "items-start" : "items-end"}`}>
        <div
          className={`px-3 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isNanjila
              ? "bg-white text-gray-800 rounded-tl-sm shadow-sm border border-gray-100"
              : "text-white rounded-tr-sm"
          }`}
          style={!isNanjila ? { background: "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)" } : {}}
          dangerouslySetInnerHTML={{ __html: formatText(msg.text) }}
        />
        {msg.fileName && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-teal-50 border border-teal-100 rounded-xl text-xs text-teal-700">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-teal-500 flex-shrink-0">
              <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
            </svg>
            {msg.fileName}
          </div>
        )}
        {msg.jobMatches && msg.jobMatches.length > 0 && (
          <div className="flex flex-col gap-1.5 w-full mt-1">
            {msg.jobMatches.map((j, i) => {
              const s = Math.min(j.matchScore, 100);
              const isLow = s < 40;
              const isMid = s >= 40 && s < 70;
              const barColor = isLow
                ? "linear-gradient(90deg,#f87171,#ef4444)"
                : isMid
                ? "linear-gradient(90deg,#fb923c,#f59e0b)"
                : "linear-gradient(90deg,#4ade80,#22d3ee)";
              const scoreColor = isLow ? "#dc2626" : isMid ? "#d97706" : "#16a34a";
              const cardBorder = isLow ? "#fecaca" : isMid ? "#fed7aa" : "#a7f3d0";
              const cardBg = isLow
                ? "linear-gradient(135deg,#fff5f5,#fff1f1)"
                : isMid
                ? "linear-gradient(135deg,#fffbeb,#fff7ed)"
                : "linear-gradient(135deg,#f0fdf4,#ecfeff)";
              return (
                <div
                  key={i}
                  className="rounded-xl px-3 py-2 text-xs border"
                  style={{ background: cardBg, borderColor: cardBorder }}
                >
                  <div className="font-semibold text-gray-800">{j.title}</div>
                  <div className="text-gray-500">{j.company} · {j.country}</div>
                  <div className="flex items-center gap-1 mt-1">
                    <div className="h-1.5 rounded-full flex-1 bg-gray-200 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${s}%`, background: barColor, transition: "width 0.5s ease" }}
                      />
                    </div>
                    <span className="font-bold" style={{ color: scoreColor }}>{s}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {/* Audio controls — shown for all Nanjila messages */}
        {isNanjila && (
          <button
            onClick={toggleAudio}
            className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-800 transition-colors px-1 mt-0.5"
            data-testid={`audio-play-${msg.id}`}
          >
            {playing ? (
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
            {playing ? "Pause" : "🎧 Listen again"}
          </button>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-2 mb-3 justify-start">
      <img
        src={nanjilaAvatarUrl}
        alt="Nanjila"
        className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-auto"
      />
      <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-teal-400"
            style={{ animation: "nanjilaTyping 1.2s infinite", animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Animated speaking waves (used in header while voice plays) ───────────────
function SpeakingWaves({ active }: { active: boolean }) {
  return (
    <div
      className={`flex items-end gap-0.5 transition-all duration-500 ${active ? "opacity-100" : "opacity-30"}`}
      aria-hidden="true"
    >
      {WAVE_HEIGHTS.map((h, i) => (
        <div
          key={i}
          className="rounded-full"
          style={{
            width: 3,
            height: active ? h : 6,
            background: active
              ? "linear-gradient(180deg, #4ade80 0%, #22d3ee 100%)"
              : "rgba(255,255,255,0.5)",
            animation: active ? "nanjilaWave 0.8s ease-in-out infinite alternate" : "none",
            animationDelay: `${i * 0.1}s`,
            transition: "height 0.3s ease",
          }}
        />
      ))}
    </div>
  );
}

// ── Main Widget ───────────────────────────────────────────────────────────────
export default function NanjilaChatWidget() {
  const [open, setOpen] = useState(false);
  const [bouncing, setBouncing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [greetingLoading, setGreetingLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [location] = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasGreeted = useRef(false);
  const greetingAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { setOpen(false); }, [location]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, greetingLoading]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (open && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // ── Voice greeting on first open ────────────────────────────────────────────
  useEffect(() => {
    if (!open || hasGreeted.current) return;
    hasGreeted.current = true;
    setGreetingLoading(true);

    const newSessionId = `web_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setSessionId(newSessionId);

    (async () => {
      try {
        const csrfToken = await fetchCsrfToken();
        const fd = new FormData();
        fd.append("sessionId", newSessionId);
        // no message → backend returns greeting + audio
        const res = await fetch("/api/nanjila/chat", {
          method: "POST",
          headers: csrfToken ? { "X-CSRF-Token": csrfToken } : {},
          body: fd,
          credentials: "include",
        });
        const data = await res.json();

        const greetingMsg: ChatMessage = {
          id: "greeting",
          role: "nanjila",
          text: data.text || "Hello! I'm Nanjila from WorkAbroad Hub. How can I help you today?",
          audioUrl: data.audioUrl || null,
          timestamp: new Date(),
        };

        setGreetingLoading(false);
        setMessages([greetingMsg]);

        // Auto-play voice immediately — ElevenLabs first, browser speech fallback
        if (data.audioUrl) {
          try {
            const audio = new Audio(data.audioUrl);
            greetingAudioRef.current = audio;
            audio.onplay = () => setIsSpeaking(true);
            audio.onended = () => setIsSpeaking(false);
            audio.onpause = () => setIsSpeaking(false);
            audio.onerror = () => setIsSpeaking(false);
            await audio.play();
          } catch {
            // Autoplay blocked — try browser TTS
            speakWithBrowser(greetingMsg.text, () => setIsSpeaking(true), () => setIsSpeaking(false));
          }
        } else {
          // No ElevenLabs audio — use browser speech synthesis
          speakWithBrowser(greetingMsg.text, () => setIsSpeaking(true), () => setIsSpeaking(false));
        }
      } catch {
        setGreetingLoading(false);
        setMessages([{
          id: "greeting",
          role: "nanjila",
          text: "Hello! I'm Nanjila from WorkAbroad Hub. 😊\n\nHow can I help you today?",
          timestamp: new Date(),
        }]);
      }
    })();

    return () => {
      // Stop greeting audio if widget is closed
      if (greetingAudioRef.current) {
        greetingAudioRef.current.pause();
        greetingAudioRef.current = null;
      }
    };
  }, [open]);

  // Stop all audio when chat is closed
  useEffect(() => {
    if (!open) {
      if (greetingAudioRef.current) {
        greetingAudioRef.current.pause();
        greetingAudioRef.current = null;
      }
      window.speechSynthesis?.cancel();
      setIsSpeaking(false);
    }
  }, [open]);

  // ── Send message ────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string, file?: File) => {
    if (!text.trim() && !file) return;
    if (loading) return;

    // Stop any ongoing greeting audio
    if (greetingAudioRef.current) {
      greetingAudioRef.current.pause();
      greetingAudioRef.current = null;
      setIsSpeaking(false);
    }

    if (text.trim()) {
      setMessages(prev => [...prev, {
        id: `u_${Date.now()}`,
        role: "user",
        text: text.trim(),
        timestamp: new Date(),
      }]);
    }
    if (file) {
      setMessages(prev => [...prev, {
        id: `f_${Date.now()}`,
        role: "user",
        text: text.trim() || "📎 CV uploaded — please analyze it",
        fileName: file.name,
        timestamp: new Date(),
      }]);
    }
    setInput("");
    setLoading(true);

    try {
      const csrfToken = await fetchCsrfToken();
      const formData = new FormData();
      formData.append("sessionId", sessionId);
      if (text.trim()) formData.append("message", text.trim());
      if (file) formData.append("cv", file);

      const res = await fetch("/api/nanjila/chat", {
        method: "POST",
        headers: csrfToken ? { "X-CSRF-Token": csrfToken } : {},
        body: formData,
        credentials: "include",
      });
      const data = await res.json();

      setMessages(prev => [...prev, {
        id: `n_${Date.now()}`,
        role: "nanjila",
        text: data.text || "Samahani, kuna tatizo kidogo. Tafadhali jaribu tena! 🙏",
        audioUrl: data.audioUrl || null,
        jobMatches: data.jobMatches || undefined,
        timestamp: new Date(),
      }]);

      // Auto-play Nanjila's voice reply — ElevenLabs first, browser speech fallback
      if (greetingAudioRef.current) {
        greetingAudioRef.current.pause();
        greetingAudioRef.current = null;
      }
      if (data.audioUrl) {
        try {
          const audio = new Audio(data.audioUrl);
          greetingAudioRef.current = audio;
          audio.onplay = () => setIsSpeaking(true);
          audio.onended = () => { setIsSpeaking(false); greetingAudioRef.current = null; };
          audio.onpause = () => setIsSpeaking(false);
          audio.onerror = () => { setIsSpeaking(false); greetingAudioRef.current = null; };
          await audio.play();
        } catch {
          // Autoplay blocked — try browser TTS
          speakWithBrowser(data.text, () => setIsSpeaking(true), () => setIsSpeaking(false));
        }
      } else {
        // No ElevenLabs audio — use browser speech synthesis
        speakWithBrowser(data.text, () => setIsSpeaking(true), () => setIsSpeaking(false));
      }
    } catch {
      setMessages(prev => [...prev, {
        id: `e_${Date.now()}`,
        role: "nanjila",
        text: "Oops — something went wrong. Please try again. 🙏",
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [sessionId, loading]);

  function handleFabClick() {
    setBouncing(true);
    setTimeout(() => setBouncing(false), 350);
    setOpen(v => !v);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    sendMessage(input, file);
    e.target.value = "";
  }

  const waLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Hi Nanjila, I need help with WorkAbroad Hub...")}`;

  return (
    <div
      ref={containerRef}
      className="fixed bottom-8 right-8 z-[999] flex flex-col items-end"
      data-testid="nanjila-chat-widget"
    >
      {open && (
        <div
          className="mb-4 flex flex-col rounded-[20px] overflow-hidden bg-[#F0F2F5]"
          style={{
            width: 360,
            height: 520,
            boxShadow: "0 12px 48px rgba(0,0,0,0.20)",
            animation: "nanjilaSlideUp 0.25s ease-out",
          }}
          data-testid="nanjila-chat-window"
        >
          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div
            className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
            style={{
              background: isSpeaking
                ? "linear-gradient(135deg, #0d3d2e 0%, #134e38 100%)"
                : "linear-gradient(135deg, #1A2530 0%, #2A3A4A 100%)",
              transition: "background 0.6s ease",
            }}
          >
            {/* Avatar with speaking pulse */}
            <div className="relative flex-shrink-0">
              <img
                src={nanjilaAvatarUrl}
                alt="Nanjila"
                className="w-10 h-10 rounded-full object-cover"
                style={{
                  border: isSpeaking ? "2.5px solid #4ade80" : "2.5px solid #25D366",
                  boxShadow: isSpeaking ? "0 0 0 4px rgba(74,222,128,0.25)" : "none",
                  transition: "box-shadow 0.4s ease, border-color 0.4s ease",
                }}
              />
              <span
                className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2"
                style={{
                  background: isSpeaking ? "#4ade80" : "#4CAF50",
                  borderColor: isSpeaking ? "#0d3d2e" : "#1A2530",
                  transition: "background 0.4s ease",
                }}
              />
            </div>

            {/* Name + status */}
            <div className="flex-1 min-w-0">
              <h4 className="text-white font-semibold text-sm leading-snug">Nanjila</h4>
              <p
                className="text-xs font-medium transition-all duration-300"
                style={{ color: isSpeaking ? "#86efac" : "rgba(255,255,255,0.65)" }}
              >
                {isSpeaking ? "🎙 Speaking…" : greetingLoading ? "Connecting…" : "AI Career Assistant · Online"}
              </p>
            </div>

            {/* Speaking waves in header */}
            <div className="mr-2">
              <SpeakingWaves active={isSpeaking} />
            </div>

            {/* Close */}
            <button
              onClick={() => setOpen(false)}
              className="text-white/60 hover:text-white transition-colors flex-shrink-0"
              data-testid="nanjila-close-btn"
              aria-label="Close chat"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>

          {/* ── Messages area ────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0">
            {/* Greeting loading state */}
            {greetingLoading && (
              <div className="flex gap-2 mb-3 justify-start">
                <img
                  src={nanjilaAvatarUrl}
                  alt="Nanjila"
                  className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-auto"
                />
                <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                  <div className="flex items-end gap-0.5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="rounded-full"
                        style={{
                          width: 3,
                          height: 12,
                          background: "linear-gradient(180deg, #4ade80 0%, #22d3ee 100%)",
                          animation: "nanjilaWave 0.8s ease-in-out infinite alternate",
                          animationDelay: `${i * 0.1}s`,
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-gray-400 italic">Nanjila is saying hello…</span>
                </div>
              </div>
            )}

            {messages.map((msg, idx) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                showAvatar={
                  msg.role === "nanjila" &&
                  (idx === 0 || messages[idx - 1]?.role !== "nanjila")
                }
                onPlayStateChange={setIsSpeaking}
              />
            ))}
            {loading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* ── Input area ───────────────────────────────────────────────────── */}
          <div className="flex-shrink-0 border-t border-gray-200 bg-white px-3 py-2">
            <div className="flex items-end gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-shrink-0 text-gray-400 hover:text-teal-600 transition-colors mb-1.5"
                title="Upload CV (PDF or Word)"
                data-testid="nanjila-attach-btn"
                disabled={loading || greetingLoading}
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/>
                </svg>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFileChange}
                className="hidden"
                data-testid="nanjila-file-input"
              />
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={greetingLoading ? "Nanjila is saying hello…" : "Ask me anything… or upload your CV 📎"}
                rows={1}
                disabled={loading || greetingLoading}
                className="flex-1 resize-none bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-teal-400 focus:border-teal-400 max-h-24 overflow-y-auto"
                style={{ lineHeight: "1.4" }}
                data-testid="nanjila-message-input"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || greetingLoading || !input.trim()}
                className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white transition-all mb-0.5 disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)" }}
                data-testid="nanjila-send-btn"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[10px] text-gray-400">Shift+Enter for new line</span>
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] text-[#25D366] hover:text-[#128C7E] transition-colors"
                data-testid="nanjila-whatsapp-link"
              >
                <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current">
                  <path d="M12 2C6.48 2 2 6.48 2 12c0 1.88.53 3.63 1.44 5.12L2 22l5.12-1.44C8.37 21.47 10.12 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z" />
                </svg>
                Also on WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── FAB ─────────────────────────────────────────────────────────────── */}
      <div className="relative" style={{ width: 72, height: 72 }}>
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            margin: -10,
            background: isSpeaking
              ? "radial-gradient(circle, rgba(74,222,128,0.45) 0%, rgba(34,211,238,0.2) 50%, transparent 75%)"
              : "radial-gradient(circle, rgba(37,211,102,0.35) 0%, rgba(18,140,126,0.15) 50%, transparent 75%)",
            zIndex: 0,
            transition: "background 0.5s ease",
            animation: isSpeaking ? "nanjilaGlow 1s ease-in-out infinite alternate" : "none",
          }}
          aria-hidden="true"
        />
        <button
          onClick={handleFabClick}
          className={`absolute inset-0 rounded-full overflow-hidden border-none outline-none cursor-pointer ${bouncing ? "nanjila-bounce" : "nanjila-fab"}`}
          style={{
            background: open
              ? "linear-gradient(135deg, #1A2530 0%, #2A3A4A 100%)"
              : "linear-gradient(145deg, #128C7E 0%, #25D366 100%)",
            boxShadow: isSpeaking
              ? "0 8px 28px rgba(74,222,128,0.6)"
              : "0 8px 24px rgba(37,211,102,0.4)",
            zIndex: 1,
            transition: "box-shadow 0.4s ease",
          }}
          aria-label={open ? "Close Nanjila chat" : "Chat with Nanjila AI"}
          data-testid="nanjila-chat-button"
        >
          {open ? (
            <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white mx-auto">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          ) : (
            <img src={nanjilaAvatarUrl} alt="Chat with Nanjila" className="w-full h-full object-cover" />
          )}
        </button>
        {!open && (
          <span
            className="nanjila-status-dot absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-white"
            style={{ background: "#4CAF50", zIndex: 2 }}
            aria-hidden="true"
          />
        )}
      </div>

      <style>{`
        @keyframes nanjilaSlideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes nanjilaTyping {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes nanjilaWave {
          0%   { transform: scaleY(0.4); }
          100% { transform: scaleY(1); }
        }
        @keyframes nanjilaGlow {
          from { opacity: 0.8; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
