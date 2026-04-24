import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import {
  Send,
  Loader2,
  Bot,
  User,
  ChevronRight,
  Sparkles,
  Shield,
  AlertTriangle,
  Globe,
  FileText,
  ArrowRight,
  Lock,
  MessageSquare,
  RotateCcw,
  Star,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface UsageStatus {
  questionsUsed: number;
  dailyLimit: number;
  remaining: number;
  planId: string;
  unlimited: boolean;
}

// ─── Quick prompts shown when chat is empty ───────────────────────────────────
const QUICK_PROMPTS = [
  "What are the requirements for a Canada work visa from Kenya?",
  "How does the UK Skilled Worker Visa sponsorship process work?",
  "What is the H-1B visa and how do I qualify?",
  "Which country is easiest to immigrate to from Kenya?",
  "What is the Germany Job Seeker Visa?",
  "What is my best visa option if I have a nursing degree?",
];

// ─── PRO eligibility checker form ─────────────────────────────────────────────
const COUNTRIES_LIST = ["Canada", "UK", "USA", "Germany", "UAE", "Australia", "Netherlands", "Ireland"];

function EligibilityChecker({ onSubmit, isLoading }: { onSubmit: (q: string) => void; isLoading: boolean }) {
  const [age, setAge] = useState("");
  const [education, setEducation] = useState("");
  const [experience, setExperience] = useState("");
  const [country, setCountry] = useState("");

  function handleSubmit() {
    if (!age || !education || !experience) return;
    const question = `Check my visa eligibility: I am ${age} years old, my highest education is ${education}, I have ${experience} years of work experience in my field${country ? `, and I am most interested in moving to ${country}` : ""}. What are my best visa options and recommended next steps?`;
    onSubmit(question);
  }

  return (
    <Card className="border-purple-200 bg-purple-50 dark:bg-purple-950/30 dark:border-purple-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-purple-700 dark:text-purple-400 flex items-center gap-2 text-base">
          <Sparkles className="h-5 w-5" />
          PRO: Personalised Eligibility Check
        </CardTitle>
        <p className="text-sm text-purple-600 dark:text-purple-300">
          Enter your profile and the AI will recommend the best visa routes for you.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">Age</label>
            <input
              type="number"
              min="18"
              max="70"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="e.g. 28"
              className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
              data-testid="input-eligibility-age"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">Years of Experience</label>
            <input
              type="number"
              min="0"
              max="40"
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              placeholder="e.g. 5"
              className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
              data-testid="input-eligibility-experience"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">Highest Education Level</label>
          <select
            value={education}
            onChange={(e) => setEducation(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
            data-testid="select-eligibility-education"
          >
            <option value="">Select education level</option>
            <option value="Secondary (KCSE)">Secondary (KCSE)</option>
            <option value="Diploma / Certificate">Diploma / Certificate</option>
            <option value="Bachelor's Degree">Bachelor's Degree</option>
            <option value="Postgraduate Diploma">Postgraduate Diploma</option>
            <option value="Master's Degree">Master's Degree</option>
            <option value="PhD / Doctorate">PhD / Doctorate</option>
            <option value="Professional Certification (e.g. CPA, ACCA, CFA)">Professional Certification</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">Target Country (optional)</label>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
            data-testid="select-eligibility-country"
          >
            <option value="">No preference — suggest best</option>
            {COUNTRIES_LIST.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <Button
          onClick={handleSubmit}
          disabled={!age || !education || !experience || isLoading}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white"
          data-testid="button-eligibility-check"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
          Check My Eligibility
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
      }`}>
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className={`flex-1 max-w-[85%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-blue-600 text-white rounded-tr-sm"
            : "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-tl-sm shadow-sm"
        }`}>
          {message.content}
        </div>
        <span className="text-xs text-gray-400 px-1">
          {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function VisaAssistantPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockMessage, setBlockMessage] = useState("");

  // ── Fetch usage status ────────────────────────────────────────────────────
  const { data: usage, isLoading: usageLoading } = useQuery<UsageStatus>({
    queryKey: ["/api/visa-assistant/usage"],
    enabled: !!user,
  });

  // ── Send message mutation ─────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: async (question: string) => {
      const res = await apiRequest("POST", "/api/visa-assistant", { question });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.limitReached) {
        setIsBlocked(true);
        setBlockMessage(data.message || "Daily limit reached.");
        return;
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.response, timestamp: new Date() },
      ]);
      queryClient.invalidateQueries({ queryKey: ["/api/visa-assistant/usage"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to get a response. Please try again.", variant: "destructive" });
    },
  });

  // ── Auto-scroll to bottom ─────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sendMutation.isPending]);

  // ── Submit handler ────────────────────────────────────────────────────────
  function handleSend(question?: string) {
    const q = (question ?? input).trim();
    if (!q || sendMutation.isPending) return;
    if (!user) {
      toast({ title: "Login required", description: "Please log in to use the Visa Assistant.", variant: "destructive" });
      return;
    }
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: q, timestamp: new Date() }]);
    sendMutation.mutate(q);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleNewChat() {
    setMessages([]);
    setIsBlocked(false);
    setBlockMessage("");
  }

  const isPro = usage?.planId === "pro";
  const isBasic = usage?.planId === "basic";
  const isPaid = isPro || isBasic;
  const remaining = usage?.remaining ?? 0;
  const limitReached = !!user && !usageLoading && !usage?.unlimited && remaining <= 0;

  return (
    <>
      <title>AI Visa Assistant | WorkAbroad Hub</title>
      <meta name="description" content="Ask our AI Visa Assistant any immigration or work visa question. Free daily questions, unlimited for Pro users. Covering Canada, UK, USA, Germany, UAE and more." />
      <meta name="robots" content="index, follow" />

      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white">
          <div className="max-w-4xl mx-auto px-4 py-6">
            <nav className="flex items-center gap-2 text-blue-200 text-sm mb-4" aria-label="Breadcrumb">
              <Link href="/"><span className="hover:text-white cursor-pointer">Home</span></Link>
              <ChevronRight className="h-3 w-3" />
              <span className="text-white font-medium">Visa Assistant</span>
            </nav>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2.5 rounded-xl">
                  <Bot className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold flex items-center gap-2">
                    AI Visa Assistant
                    {isPro && <Badge className="bg-yellow-400 text-yellow-900 text-xs font-bold">PRO</Badge>}
                    {isBasic && <Badge className="bg-blue-400 text-blue-900 text-xs font-bold">BASIC</Badge>}
                  </h1>
                  <p className="text-blue-200 text-sm">Ask any visa or immigration question</p>
                </div>
              </div>

              {/* Usage counter */}
              {user && !usageLoading && (
                <div className="text-right">
                  {usage?.unlimited ? (
                    <div className="text-green-300 text-sm font-medium flex items-center gap-1">
                      <Sparkles className="h-4 w-4" /> Unlimited
                    </div>
                  ) : (
                    <div>
                      <div
                        className={`text-sm font-bold ${remaining <= 1 ? "text-red-300" : "text-blue-100"}`}
                        data-testid="text-questions-remaining"
                      >
                        {remaining} question{remaining !== 1 ? "s" : ""} left today
                      </div>
                      <div className="text-xs text-blue-300">{usage?.questionsUsed ?? 0} / {usage?.dailyLimit ?? 3} used</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Disclaimer strip ───────────────────────────────── */}
        <div className="bg-amber-50 border-b border-amber-200 py-2">
          <div className="max-w-4xl mx-auto px-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <p className="text-xs text-amber-800">
              <strong>Disclaimer:</strong> This is general guidance and not official immigration or legal advice.
              Always verify with the official government website for your target country.
            </p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto w-full px-4 py-4 flex-1 flex flex-col gap-4">

          {/* ── Not logged in gate ─────────────────────────────── */}
          {!user && (
            <div className="flex-1 flex items-center justify-center">
              <Card className="max-w-md w-full text-center border-blue-200">
                <CardContent className="p-8">
                  <Lock className="h-12 w-12 text-blue-300 mx-auto mb-4" />
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Sign In to Use the Visa Assistant</h2>
                  <p className="text-gray-500 mb-6 text-sm">
                    Free accounts get 3 AI questions per day. Basic gets 20. Pro gets unlimited questions.
                  </p>
                  <a href="/api/login">
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white w-full" data-testid="button-login-visa-assistant">
                      Sign In Free <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </a>
                  <p className="text-xs text-gray-400 mt-3">No credit card required for free account</p>
                </CardContent>
              </Card>
            </div>
          )}

          {user && (
            <>
              {/* ── PRO Eligibility Checker ──────────────────── */}
              {isPro && (
                <EligibilityChecker onSubmit={handleSend} isLoading={sendMutation.isPending} />
              )}

              {/* ── Chat window ──────────────────────────────── */}
              <Card className="flex-1 flex flex-col border shadow-sm min-h-[400px]">
                <div className="flex items-center justify-between px-4 py-3 border-b">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {messages.length > 0 ? `${messages.filter(m => m.role === "user").length} question${messages.filter(m => m.role === "user").length !== 1 ? "s" : ""}` : "Start chatting"}
                    </span>
                  </div>
                  {messages.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={handleNewChat} data-testid="button-new-chat">
                      <RotateCcw className="h-4 w-4 mr-1" /> New Chat
                    </Button>
                  )}
                </div>

                {/* Messages area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px] max-h-[500px]">

                  {/* Empty state — quick prompts */}
                  {messages.length === 0 && !limitReached && (
                    <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-6">
                      <div className="bg-blue-100 dark:bg-blue-900/30 p-4 rounded-full">
                        <Globe className="h-8 w-8 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Ask me anything about visas</h3>
                        <p className="text-sm text-gray-500">Try one of these questions or type your own below</p>
                      </div>
                      <div className="grid gap-2 w-full max-w-md">
                        {QUICK_PROMPTS.slice(0, isPro ? 6 : 4).map((prompt) => (
                          <button
                            key={prompt}
                            onClick={() => handleSend(prompt)}
                            disabled={sendMutation.isPending}
                            className="text-left text-sm px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors disabled:opacity-50"
                            data-testid={`button-quick-prompt-${QUICK_PROMPTS.indexOf(prompt)}`}
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Messages */}
                  {messages.map((msg, i) => (
                    <MessageBubble key={i} message={msg} />
                  ))}

                  {/* Loading indicator */}
                  {sendMutation.isPending && (
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-gray-600" />
                      </div>
                      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                        <div className="flex gap-1.5 items-center h-5">
                          <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Limit reached message inside chat */}
                  {isBlocked && (
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                        <Lock className="h-4 w-4 text-red-600" />
                      </div>
                      <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl rounded-tl-sm px-4 py-3">
                        <p className="text-sm text-red-700 dark:text-red-300 font-medium mb-2">{blockMessage}</p>
                        <Link href="/pricing">
                          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-upgrade-chat">
                            Upgrade Now <ArrowRight className="ml-1 h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Input area */}
                <div className="border-t p-4">
                  {/* Monetization hook after last assistant message */}
                  {messages.length >= 2 && messages[messages.length - 1]?.role === "assistant" && !isBlocked && (
                    <div className="flex items-center justify-between mb-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800">
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        💼 Would you like professional help improving your chances?
                      </p>
                      <Link href="/services">
                        <Button size="sm" variant="outline" className="text-xs border-blue-300 text-blue-700 hover:bg-blue-100 ml-2 flex-shrink-0" data-testid="button-monetize-hook">
                          View Services <ArrowRight className="ml-1 h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  )}

                  {limitReached && !isBlocked ? (
                    <div className="text-center py-3">
                      <p className="text-sm text-gray-500 mb-2" data-testid="text-limit-reached">
                        You have reached your free limit for today. Upgrade to continue.
                      </p>
                      <Link href="/pricing">
                        <Button className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-upgrade-bottom">
                          Upgrade Now <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  ) : !isBlocked ? (
                    <div className="flex gap-2 items-end">
                      <Textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask about visa requirements, application steps, costs..."
                        className="flex-1 resize-none min-h-[52px] max-h-[140px] rounded-xl"
                        rows={2}
                        disabled={sendMutation.isPending}
                        data-testid="input-visa-question"
                      />
                      <Button
                        onClick={() => handleSend()}
                        disabled={!input.trim() || sendMutation.isPending}
                        className="bg-blue-600 hover:bg-blue-700 text-white h-[52px] w-[52px] p-0 rounded-xl flex-shrink-0"
                        data-testid="button-send-message"
                        aria-label="Send message"
                      >
                        {sendMutation.isPending
                          ? <Loader2 className="h-5 w-5 animate-spin" />
                          : <Send className="h-5 w-5" />}
                      </Button>
                    </div>
                  ) : null}

                  <p className="text-xs text-gray-400 text-center mt-2">
                    Press Enter to send · Shift+Enter for new line
                  </p>
                </div>
              </Card>

              {/* ── Plan upgrade callout (non-pro) ────────────── */}
              {!isPro && (
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { plan: "FREE", limit: "3/day", icon: Globe, color: "gray" },
                    { plan: "BASIC", limit: "20/day", icon: Star, color: "blue", href: "/pricing" },
                    { plan: "PRO", limit: "Unlimited + Eligibility Check", icon: Sparkles, color: "purple", href: "/pricing" },
                  ].map((p) => (
                    <Card
                      key={p.plan}
                      className={`text-center p-4 ${p.plan === usage?.planId?.toUpperCase() ? "border-blue-400 ring-1 ring-blue-400" : ""} ${p.href ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
                      onClick={() => p.href && (window.location.href = p.href)}
                      data-testid={`card-plan-${p.plan.toLowerCase()}`}
                    >
                      <p.icon className={`h-5 w-5 mx-auto mb-1 ${p.color === "purple" ? "text-purple-600" : p.color === "blue" ? "text-blue-600" : "text-gray-500"}`} />
                      <p className="text-xs font-bold text-gray-900 dark:text-white">{p.plan}</p>
                      <p className="text-xs text-gray-500">{p.limit}</p>
                      {p.href && (
                        <Button size="sm" className="mt-2 w-full text-xs" variant="outline" data-testid={`button-plan-upgrade-${p.plan.toLowerCase()}`}>
                          Upgrade
                        </Button>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Helpful links ─────────────────────────────────── */}
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { href: "/visa-guides", label: "Visa & Immigration Guides", sub: "Country-by-country detailed guides", icon: Globe },
              { href: "/tools/job-scam-checker", label: "Job Scam Checker", sub: "Verify a suspicious overseas job offer", icon: Shield },
              { href: "/services", label: "Professional CV Rewrite", sub: "Country-specific CV from our experts", icon: FileText },
              { href: "/green-card", label: "USA Green Card Guide", sub: "DV Lottery — 55,000 visas yearly", icon: Globe },
            ].map((link) => (
              <Link key={link.href} href={link.href}>
                <div
                  className="flex items-center gap-3 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer"
                  data-testid={`link-related-${link.href.replace(/\//g, "-")}`}
                >
                  <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg flex-shrink-0">
                    <link.icon className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white text-sm">{link.label}</p>
                    <p className="text-xs text-gray-500 truncate">{link.sub}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400 flex-shrink-0 ml-auto" />
                </div>
              </Link>
            ))}
          </div>

        </div>
      </div>
    </>
  );
}
