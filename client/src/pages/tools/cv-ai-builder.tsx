// ─────────────────────────────────────────────────────────────────────────────
// /tools/cv-ai-builder — client for POST /api/cv-ai/generate.
//
// Sends CV (uploaded file OR pasted text) plus optional JD/region/industry
// to the six-pass CV pipeline and displays the result. Never fakes a score:
// if the score-gate couldn't hit +15, the banner turns honest ("your CV was
// already strong — try expert review") instead of hiding it.
//
// Uses only primitives already in the codebase (Button/Card/Input/Textarea/
// Label + Tailwind + lucide-react + fetchCsrfToken from queryClient). No
// new deps.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, type ChangeEvent, type DragEvent } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { fetchCsrfToken } from "@/lib/queryClient";
import {
  Upload, FileText, Loader2, Sparkles, ArrowUp, ArrowDown, Copy, Download,
  AlertCircle, CheckCircle2, Info, Wand2,
} from "lucide-react";

type Region = "KE" | "UK" | "CA" | "AU" | "UAE" | "US" | "EU";

interface GenerateResponse {
  ok: true;
  hitTarget: boolean;
  improvement: number;
  inputScore: number;
  outputScore: number;
  retries: number;
  cvMarkdown: string;
  elapsedMs: number;
  message: string;
}

interface WrongDocResponse {
  message: string;
  detected: string | null;
  wrongDocument: true;
}

export default function CvAiBuilderPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Inputs
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvText, setCvText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [region, setRegion] = useState<Region>("KE");
  const [industry, setIndustry] = useState("");

  // Flow state
  const [stage, setStage] = useState<"idle" | "loading" | "done" | "error" | "wrong-doc">("idle");
  const [progress, setProgress] = useState<string>("");
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [wrongDoc, setWrongDoc] = useState<WrongDocResponse | null>(null);
  const [errMsg, setErrMsg] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const canSubmit =
    stage !== "loading" && (cvFile || cvText.trim().length >= 150);

  // ── File handlers ─────────────────────────────────────────────────────
  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setCvFile(f);
  }
  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    const ok = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!ok.includes(f.type)) {
      toast({ title: "Only PDF or Word (.docx)", description: "That file type isn't supported.", variant: "destructive" });
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 5 MB. Try re-exporting from Word.", variant: "destructive" });
      return;
    }
    setCvFile(f);
  }
  function handleDragOver(e: DragEvent<HTMLDivElement>) { e.preventDefault(); setIsDragOver(true); }
  function handleDragLeave(e: DragEvent<HTMLDivElement>) { e.preventDefault(); setIsDragOver(false); }

  // ── Submit ────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!canSubmit) return;
    setStage("loading");
    setResult(null);
    setWrongDoc(null);
    setErrMsg("");

    // Rolling progress hint — the pipeline is 20-30s on happy path.
    const hints = [
      "Reading your CV…",
      "Analysing structure and achievements…",
      "Composing your rewrite…",
      "Scoring against ATS engine…",
      "Making sure it beats your input by ≥15 points…",
    ];
    let hi = 0;
    setProgress(hints[0]!);
    const progressTimer = setInterval(() => {
      hi = Math.min(hi + 1, hints.length - 1);
      setProgress(hints[hi]!);
    }, 6000);

    try {
      const csrf = await fetchCsrfToken();
      let res: Response;

      if (cvFile) {
        const fd = new FormData();
        fd.append("cv", cvFile);
        if (jobDescription.trim().length >= 40) fd.append("jobDescription", jobDescription.trim());
        fd.append("region", region);
        if (industry.trim()) fd.append("industry", industry.trim());
        res = await fetch("/api/cv-ai/generate", {
          method: "POST",
          credentials: "include",
          headers: { "X-CSRF-Token": csrf },
          body: fd,
        });
      } else {
        res = await fetch("/api/cv-ai/generate", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify({
            cvText,
            jobDescription: jobDescription.trim().length >= 40 ? jobDescription.trim() : undefined,
            region,
            industry: industry.trim() || undefined,
          }),
        });
      }

      // Detect HTML timeout pages cleanly (Render edge sometimes returns HTML on slow upstream).
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        throw new Error(`Server returned HTTP ${res.status}. This usually means the AI service is slow right now — try again in a moment.`);
      }

      const body = await res.json();

      if (res.status === 422 && body?.wrongDocument) {
        setWrongDoc(body as WrongDocResponse);
        setStage("wrong-doc");
        return;
      }
      if (!res.ok) {
        throw new Error(body?.message ?? "Something went wrong. Please try again.");
      }

      setResult(body as GenerateResponse);
      setStage("done");
    } catch (err: any) {
      setErrMsg(err?.message ?? "Something went wrong. Please try again.");
      setStage("error");
    } finally {
      clearInterval(progressTimer);
    }
  }

  function reset() {
    setStage("idle");
    setResult(null);
    setWrongDoc(null);
    setErrMsg("");
    setProgress("");
  }

  // ── Result actions ────────────────────────────────────────────────────
  function copyResult() {
    if (!result) return;
    navigator.clipboard.writeText(result.cvMarkdown).then(
      () => toast({ title: "Copied", description: "CV markdown copied to clipboard." }),
      () => toast({ title: "Copy failed", description: "Select the text and copy manually.", variant: "destructive" }),
    );
  }
  function downloadResult() {
    if (!result) return;
    const blob = new Blob([result.cvMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cv-rewritten.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-6 flex items-center gap-3">
          <button
            onClick={() => navigate("/tools")}
            className="text-sm text-muted-foreground hover:text-foreground"
            data-testid="link-back-tools"
          >
            ← Tools
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Wand2 className="h-6 w-6 text-primary" />
              CV Builder & Revamp
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              A smarter, more human rewrite of your CV — measurably stronger against ATS, or your money's not on the line.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* ─── STAGE: IDLE — the input form ────────────────────────── */}
        {stage === "idle" && (
          <>
            {/* Upload */}
            <Card>
              <CardContent className="p-6 space-y-4">
                <div>
                  <Label className="text-base font-semibold">1. Give us your CV</Label>
                  <p className="text-xs text-muted-foreground mt-1">Upload a PDF or Word file, or paste the text below.</p>
                </div>

                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                    isDragOver ? "border-primary bg-primary/5" : "border-border"
                  }`}
                  data-testid="cv-drop-zone"
                >
                  {cvFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <FileText className="h-6 w-6 text-primary" />
                      <div className="text-left">
                        <div className="font-medium text-sm">{cvFile.name}</div>
                        <div className="text-xs text-muted-foreground">{(cvFile.size / 1024).toFixed(0)} KB</div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setCvFile(null)}>Remove</Button>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm">
                        Drag a file here, or{" "}
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="text-primary font-medium hover:underline"
                          data-testid="button-browse-cv"
                        >
                          browse
                        </button>
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">PDF or DOCX · max 5 MB</p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        onChange={handleFileChange}
                        className="hidden"
                        data-testid="input-cv-file"
                      />
                    </>
                  )}
                </div>

                <div className="text-center text-xs text-muted-foreground">— or —</div>

                <div>
                  <Label htmlFor="cvText" className="text-sm">Paste your CV text</Label>
                  <Textarea
                    id="cvText"
                    value={cvText}
                    onChange={(e) => setCvText(e.target.value)}
                    placeholder="Paste the full contents of your existing CV here…"
                    rows={8}
                    className="mt-1 font-mono text-xs"
                    data-testid="input-cv-text"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {cvText.trim().length < 150
                      ? `${cvText.trim().length} / 150 min characters`
                      : `${cvText.trim().length} characters — looks good.`}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Optional tailoring */}
            <Card>
              <CardContent className="p-6 space-y-4">
                <div>
                  <Label className="text-base font-semibold">2. Tailor to a specific role (optional)</Label>
                  <p className="text-xs text-muted-foreground mt-1">Paste a job description and we'll tune language, keywords, and structure to match.</p>
                </div>

                <Textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Paste the full job description here (or leave blank for a general rewrite)…"
                  rows={5}
                  className="text-xs"
                  data-testid="input-jd-text"
                />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="region" className="text-sm">Region</Label>
                    <select
                      id="region"
                      value={region}
                      onChange={(e) => setRegion(e.target.value as Region)}
                      className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      data-testid="select-region"
                    >
                      <option value="KE">Kenya</option>
                      <option value="UK">United Kingdom</option>
                      <option value="CA">Canada</option>
                      <option value="AU">Australia</option>
                      <option value="UAE">UAE</option>
                      <option value="US">United States</option>
                      <option value="EU">Europe</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="industry" className="text-sm">Industry (optional)</Label>
                    <Input
                      id="industry"
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value.slice(0, 60))}
                      placeholder="e.g. software, healthcare"
                      className="mt-1"
                      data-testid="input-industry"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              size="lg"
              className="w-full"
              data-testid="button-generate-cv"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Rewrite my CV
            </Button>
          </>
        )}

        {/* ─── STAGE: LOADING ─────────────────────────────────────── */}
        {stage === "loading" && (
          <Card>
            <CardContent className="p-12 text-center space-y-4">
              <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" />
              <div>
                <h2 className="text-lg font-semibold">{progress}</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  Six passes running — this usually takes 20 – 30 seconds. Don't refresh.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── STAGE: WRONG DOCUMENT ──────────────────────────────── */}
        {stage === "wrong-doc" && wrongDoc && (
          <Card className="border-amber-300 dark:border-amber-800">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-6 w-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h2 className="font-bold text-amber-900 dark:text-amber-200">This doesn't look like a CV</h2>
                  <p className="text-sm text-amber-800 dark:text-amber-300 mt-1">
                    {wrongDoc.message}
                    {wrongDoc.detected ? <> We think this might be a <strong>{wrongDoc.detected}</strong>.</> : null}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={reset} data-testid="button-try-again-wrong-doc">Try a different file</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── STAGE: ERROR ───────────────────────────────────────── */}
        {stage === "error" && (
          <Card className="border-red-300 dark:border-red-800">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div>
                  <h2 className="font-bold text-red-900 dark:text-red-200">Something went wrong</h2>
                  <p className="text-sm text-red-800 dark:text-red-300 mt-1">{errMsg}</p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={reset} data-testid="button-try-again-error">Try again</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── STAGE: DONE ────────────────────────────────────────── */}
        {stage === "done" && result && (
          <>
            {/* Score-delta banner — the trust promise, visualised. */}
            <Card
              className={
                result.hitTarget
                  ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30"
                  : "border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30"
              }
            >
              <CardContent className="p-6 space-y-3">
                <div className="flex items-start gap-3">
                  {result.hitTarget ? (
                    <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="h-6 w-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <h2 className="font-bold text-lg">{result.message}</h2>

                    <div className="mt-3 flex items-center gap-6">
                      <div className="text-center">
                        <div className="text-xs uppercase text-muted-foreground">Before</div>
                        <div className="text-3xl font-bold" data-testid="text-input-score">{result.inputScore}</div>
                      </div>
                      <div className="flex flex-col items-center text-muted-foreground">
                        <ArrowUp className="h-5 w-5" />
                        <Badge
                          className={
                            result.improvement > 0
                              ? "bg-emerald-600 text-white border-0"
                              : "bg-slate-500 text-white border-0"
                          }
                          data-testid="badge-improvement"
                        >
                          {result.improvement > 0 ? "+" : ""}{result.improvement} pts
                        </Badge>
                      </div>
                      <div className="text-center">
                        <div className="text-xs uppercase text-muted-foreground">After</div>
                        <div className="text-3xl font-bold text-primary" data-testid="text-output-score">{result.outputScore}</div>
                      </div>
                      {result.retries > 0 && (
                        <div className="text-xs text-muted-foreground italic ml-auto">
                          {result.retries} retry pass{result.retries === 1 ? "" : "es"}
                        </div>
                      )}
                    </div>

                    {!result.hitTarget && (
                      <p className="text-xs text-amber-800 dark:text-amber-300 mt-4">
                        We aim for a ≥15-point ATS lift. When your source CV is already strong,
                        an expert human review does more than any AI rewrite can.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Result — the CV itself */}
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Your rewritten CV</Label>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={copyResult} data-testid="button-copy-result">
                      <Copy className="h-4 w-4 mr-1" /> Copy
                    </Button>
                    <Button variant="outline" size="sm" onClick={downloadResult} data-testid="button-download-result">
                      <Download className="h-4 w-4 mr-1" /> Download .md
                    </Button>
                  </div>
                </div>
                <pre
                  className="whitespace-pre-wrap font-sans text-sm p-4 rounded-lg bg-muted/50 border border-border max-h-[600px] overflow-auto"
                  data-testid="text-result-markdown"
                >
                  {result.cvMarkdown}
                </pre>
              </CardContent>
            </Card>

            <div className="flex justify-center">
              <Button variant="outline" onClick={reset} data-testid="button-start-over">
                Start over with a different CV
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
