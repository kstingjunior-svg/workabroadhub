// ─────────────────────────────────────────────────────────────────────────────
// Community — real-time chat rooms for Kenyans applying abroad.
//
// FOUNDER ASK: a place where users chat with each other about jobs, CVs,
// experiences applying — but with NO phone numbers, NO emails, NO M-Pesa
// numbers allowed. Auto-mod strips PII on send.
//
// Posting:
//   - Pro / Monthly / Trial users: unlimited.
//   - Free users who've referred ≥1 paying friend: 3 posts/day.
//   - Everyone else: read-only with "Go Pro to post" CTA.
//
// Real-time: subscribes to the relevant Socket.IO room namespace and
// streams new messages as they're posted by other users.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { io as socketIO, Socket } from "socket.io-client";
import { fetchCsrfToken } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Send, Users, ArrowLeft, Flag, Lock, Crown, AlertCircle,
  Globe, CheckCircle2, ShieldCheck,
} from "lucide-react";

interface Room {
  slug: string;
  name: string;
  flag: string;
  description: string;
  messageCount: number;
  lastMessageAt: string | null;
}

interface ChatMessage {
  firstName?: string | null;
  id: number;
  roomSlug: string;
  userId: string;
  body: string;
  originalBody: string;
  stripCount: number;
  hidden: boolean;
  reportedCount: number;
  createdAt: string;
}

interface Eligibility {
  canPost: boolean;
  reason?: "not_signed_in" | "no_quota" | "rate_limited";
  quotaRemaining?: number;
  tier: "pro" | "referrer" | "none";
}

// Lightweight client-side PII preview that warns BEFORE the user clicks
// send. Server-side filter is the source of truth — this is just so they
// know what's about to get stripped.
function previewSanitize(body: string): { stripCount: number; warnings: string[] } {
  const warnings: string[] = [];
  let stripCount = 0;
  if (/(\+?254|\b0[17])\s?\d{2,3}\s?\d{3}\s?\d{3}/.test(body)) {
    warnings.push("phone number");
    stripCount++;
  }
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(body)) {
    warnings.push("email");
    stripCount++;
  }
  if (/\b(paybill|till|buy\s*goods)[\s#:]*\d{4,7}\b/i.test(body)) {
    warnings.push("M-Pesa number");
    stripCount++;
  }
  return { stripCount, warnings };
}

function timeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 30) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

function userAvatarColor(userId: string): string {
  // Stable color per user from id hash.
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  const hues = ["bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500", "bg-fuchsia-500", "bg-orange-500"];
  return hues[h % hues.length];
}

// 2026-06: was returning first 2 chars of the user UUID (e.g. "0F" for an
// admin) — looked random and impersonal. Now uses the user's firstName
// when available, falling back to the UUID prefix only when they haven't
// set a name yet.
function userInitials(userId: string, firstName?: string | null): string {
  if (firstName && firstName.trim().length > 0) {
    const parts = firstName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return firstName.trim().slice(0, 2).toUpperCase();
  }
  return userId.slice(0, 2).toUpperCase();
}

// Display name shown above each message bubble. "Friend" is the fallback
// for legacy messages from users whose firstName is null (deleted users
// or users who never set their name).
function userDisplayName(firstName?: string | null): string {
  const trimmed = (firstName ?? "").trim();
  return trimmed.length > 0 ? trimmed : "Friend";
}

export default function Community() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeSlug, setActiveSlug] = useState<string>("general");
  const [composer, setComposer] = useState("");
  const [posting, setPosting] = useState(false);
  const [liveMessages, setLiveMessages] = useState<Record<string, ChatMessage[]>>({});
  const socketRef = useRef<Socket | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);

  // ── Data queries ──────────────────────────────────────────────────────────

  const { data: roomsData } = useQuery<{ rooms: Room[] }>({
    queryKey: ["/api/chat/rooms"],
    staleTime: 30_000,
  });
  const rooms = roomsData?.rooms ?? [];

  const { data: messagesData, refetch: refetchMessages } = useQuery<{ messages: ChatMessage[] }>({
    queryKey: ["/api/chat/rooms", activeSlug, "messages"],
    queryFn: async () => {
      const res = await fetch(`/api/chat/rooms/${activeSlug}/messages`, { credentials: "include" });
      if (!res.ok) throw new Error("messages_failed");
      return res.json();
    },
    staleTime: 0,
  });

  const { data: eligibility } = useQuery<Eligibility>({
    queryKey: ["/api/chat/eligibility"],
    queryFn: async () => {
      const res = await fetch("/api/chat/eligibility", { credentials: "include" });
      if (!res.ok) throw new Error("elig_failed");
      return res.json();
    },
    staleTime: 30_000,
  });

  // Merge initial fetch + live messages for active room.
  const messages = useMemo(() => {
    const initial = messagesData?.messages ?? [];
    const live = liveMessages[activeSlug] ?? [];
    // De-dupe by id, prefer live over initial.
    const map = new Map<number, ChatMessage>();
    for (const m of initial) map.set(m.id, m);
    for (const m of live) map.set(m.id, m);
    return Array.from(map.values()).sort((a, b) => a.id - b.id);
  }, [messagesData, liveMessages, activeSlug]);

  // ── Socket.IO real-time subscription ──────────────────────────────────────

  useEffect(() => {
    // Singleton socket per page lifetime.
    if (!socketRef.current) {
      socketRef.current = socketIO(window.location.origin, {
        path: "/socket.io",
        transports: ["websocket", "polling"],
      });
      socketRef.current.on("chat:message", (msg: ChatMessage) => {
        setLiveMessages((prev) => {
          const list = prev[msg.roomSlug] ?? [];
          // Cap each room's live buffer at 200 messages.
          const next = [...list, msg].slice(-200);
          return { ...prev, [msg.roomSlug]: next };
        });
      });
    }
    return () => {
      // We deliberately don't disconnect on unmount to keep the socket
      // alive across room switches. Disconnect only when the page itself
      // is unmounted (page nav). React strict-mode double-render is safe
      // because the singleton check above is idempotent.
    };
  }, []);

  // Join the active room's Socket.IO channel + clear that room's live buffer
  // so it doesn't double-merge with the freshly fetched initial data.
  useEffect(() => {
    const s = socketRef.current;
    if (!s) return;
    s.emit("chat:join", activeSlug);
    setLiveMessages((prev) => ({ ...prev, [activeSlug]: [] }));
    refetchMessages();
    return () => {
      s.emit("chat:leave", activeSlug);
    };
  }, [activeSlug, refetchMessages]);

  // Auto-scroll to bottom on new message.
  useEffect(() => {
    if (!feedRef.current) return;
    feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages]);

  // ── Composer ──────────────────────────────────────────────────────────────

  const preview = previewSanitize(composer);

  async function handleSend() {
    const body = composer.trim();
    if (body.length < 2 || posting) return;
    setPosting(true);
    try {
      // 2026-06: include CSRF token — the server's validateCsrf middleware
      // rejects any POST to /api/* that's missing X-CSRF-Token. Forgetting
      // this was the root cause of the 'Couldn't post' 403 spam.
      const csrfToken = await fetchCsrfToken();
      const res = await fetch(`/api/chat/rooms/${activeSlug}/messages`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 2026-06: show the real server error message so we can diagnose
        // without Render dashboard access. Previously every unknown error
        // showed "Try again in a moment" which gave us no signal.
        const rawMsg = typeof data?.message === "string" ? data.message : "";
        const friendly =
          rawMsg === "rate_limited" ? "Wait a few seconds between messages." :
          rawMsg === "no_quota" ? "You're out of free posts today. Go Pro or refer a friend." :
          rawMsg === "not_signed_in" ? "Sign in to post." :
          rawMsg === "invalid_room" ? "That room no longer exists." :
          rawMsg === "empty_message" ? "Type at least 2 characters." :
          rawMsg === "db_insert_failed" ? `Database write failed (status ${res.status}). Tell support: db_insert_failed.` :
          rawMsg
            ? `Server said: ${rawMsg} (HTTP ${res.status}). Tell support this message.`
            : `Unknown error (HTTP ${res.status}). Tell support this number.`;
        toast({
          title: "Couldn't post",
          description: friendly,
        });
        return;
      }
      setComposer("");
      // Optimistically merge — server will also broadcast via socket.
      const msg = data.message as ChatMessage;
      setLiveMessages((prev) => {
        const list = prev[activeSlug] ?? [];
        return { ...prev, [activeSlug]: [...list, msg].slice(-200) };
      });
      if (msg.stripCount > 0) {
        toast({
          title: "We stripped some info",
          description: "Phone numbers, emails and M-Pesa numbers are removed automatically.",
        });
      }
    } catch {
      toast({ title: "Network error", description: "Check your connection and try again." });
    } finally {
      setPosting(false);
    }
  }

  async function handleReport(messageId: number) {
    try {
      const csrfToken = await fetchCsrfToken();
      const res = await fetch(`/api/chat/messages/${messageId}/report`, {
        method: "POST",
        credentials: "include",
        headers: csrfToken ? { "X-CSRF-Token": csrfToken } : {},
      });
      if (res.ok) {
        toast({ title: "Reported", description: "We'll review it shortly." });
      }
    } catch { /* silent */ }
  }

  const activeRoom = rooms.find((r) => r.slug === activeSlug);
  const canPost = !!eligibility?.canPost;
  const tier = eligibility?.tier ?? "none";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 bg-gradient-to-r from-indigo-700 to-violet-700 text-white px-3 py-3 shadow-md">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/15" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <Users className="h-5 w-5" />
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-bold leading-tight">Community</h1>
            <p className="text-[11px] text-indigo-200 leading-tight">
              Talk to other Kenyans applying abroad · No phones, emails or M-Pesa numbers
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-5xl w-full mx-auto flex flex-col sm:flex-row gap-3 p-3">

        {/* Room sidebar */}
        <aside className="sm:w-56 shrink-0">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 flex items-center gap-2">
              <Globe className="h-3.5 w-3.5 text-gray-500" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400">Rooms</h2>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {rooms.map((r) => {
                const isActive = r.slug === activeSlug;
                return (
                  <button
                    key={r.slug}
                    onClick={() => setActiveSlug(r.slug)}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors ${
                      isActive
                        ? "bg-indigo-50 dark:bg-indigo-950/40 border-l-4 border-indigo-600"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800/40 border-l-4 border-transparent"
                    }`}
                    data-testid={`room-${r.slug}`}
                  >
                    <span className="text-xl shrink-0">{r.flag}</span>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-semibold leading-tight truncate ${isActive ? "text-indigo-900 dark:text-indigo-200" : ""}`}>
                        {r.name}
                      </div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
                        {r.messageCount} {r.messageCount === 1 ? "msg" : "msgs"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Main feed */}
        <main className="flex-1 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col min-h-[60vh]">
          {/* Room title strip */}
          {activeRoom && (
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
              <span className="text-2xl">{activeRoom.flag}</span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold leading-tight">{activeRoom.name}</h2>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight truncate">
                  {activeRoom.description}
                </p>
              </div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400 inline-flex items-center gap-1 shrink-0">
                <ShieldCheck className="h-3 w-3 text-emerald-600" />
                Moderated
              </div>
            </div>
          )}

          {/* Messages */}
          <div ref={feedRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3" data-testid="messages-feed">
            {messages.length === 0 ? (
              <div className="text-center py-10 text-sm text-gray-500 dark:text-gray-400">
                No messages yet. Be the first to start a conversation in #{activeRoom?.name ?? activeSlug}.
              </div>
            ) : (
              messages.map((m) => {
                const mine = user?.id === m.userId;
                return (
                  <div key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`} data-testid={`message-${m.id}`}>
                    <div
                      className={`shrink-0 w-8 h-8 rounded-full ${userAvatarColor(m.userId)} text-white text-[10px] font-bold flex items-center justify-center`}
                      title={userDisplayName(m.firstName)}
                    >
                      {userInitials(m.userId, m.firstName)}
                    </div>
                    <div className={`max-w-[80%] min-w-0 ${mine ? "items-end" : "items-start"} flex flex-col`}>
                      {/* 2026-06: show poster's first name above the bubble.
                          "You" for the signed-in viewer, "Friend" fallback
                          for users who haven't set firstName yet. */}
                      <div className={`text-[11px] font-semibold mb-0.5 px-1 ${
                        mine
                          ? "text-indigo-600 dark:text-indigo-300"
                          : "text-gray-700 dark:text-gray-300"
                      }`}>
                        {mine ? "You" : userDisplayName(m.firstName)}
                      </div>
                      <div className={`rounded-2xl px-3 py-2 text-sm leading-snug whitespace-pre-wrap break-words ${
                        mine
                          ? "bg-indigo-600 text-white rounded-tr-sm"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-sm"
                      }`}>
                        {m.body}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500 dark:text-gray-400 px-1">
                        <span>{timeAgo(m.createdAt)}</span>
                        {!mine && (
                          <button
                            onClick={() => handleReport(m.id)}
                            className="hover:text-red-600 inline-flex items-center gap-0.5"
                            data-testid={`report-${m.id}`}
                            aria-label="Report message"
                          >
                            <Flag className="h-3 w-3" />
                            report
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-gray-200 dark:border-gray-700 p-3 bg-gray-50/50 dark:bg-gray-800/30">
            {!user ? (
              <div className="text-sm text-center py-3">
                <Link href="/login" className="text-indigo-700 dark:text-indigo-300 underline font-semibold">
                  Sign in to join the conversation →
                </Link>
              </div>
            ) : !canPost ? (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 p-3 text-sm text-amber-900 dark:text-amber-200">
                <div className="flex items-start gap-2">
                  <Lock className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-semibold leading-snug mb-1">
                      You can read everything, but posting needs an active plan
                    </p>
                    <p className="text-xs leading-snug mb-2">
                      Any paid tier (KES 99 trial, KES 1,000 monthly, or KES 4,500 yearly) unlocks posting. Or refer a friend — once they pay, you get 3 free posts per day.
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <Link href="/pricing">
                        <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white text-xs" data-testid="cta-upgrade">
                          <Crown className="h-3 w-3 mr-1" />
                          Go Pro · KES 1,000/mo
                        </Button>
                      </Link>
                      <Link href="/referrals">
                        <Button size="sm" variant="outline" className="text-xs" data-testid="cta-refer">
                          Refer a friend
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                {/* PII preview warning — visible BEFORE send. */}
                {preview.stripCount > 0 && (
                  <div className="mb-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 px-3 py-2 text-[11px] text-red-800 dark:text-red-200 flex items-start gap-2">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      We'll remove the <strong>{preview.warnings.join(", ")}</strong> when you send. Don't share contact details — use the platform's WhatsApp consultation instead.
                    </span>
                  </div>
                )}
                <div className="flex gap-2 items-end">
                  <textarea
                    value={composer}
                    onChange={(e) => setComposer(e.target.value.slice(0, 800))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={`Message #${activeRoom?.name ?? activeSlug}…`}
                    rows={1}
                    className="flex-1 resize-none rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 min-h-[40px] max-h-32"
                    data-testid="composer-input"
                  />
                  <Button
                    onClick={handleSend}
                    disabled={posting || composer.trim().length < 2}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0"
                    data-testid="composer-send"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
  );
}
