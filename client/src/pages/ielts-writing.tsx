/**
 * IELTS Writing feedback tool — Phase 1 (2026-09).
 *
 * Gated by /ielts-prep unlock (checked server-side on submit — this page
 * also checks on mount so an unpaid user gets redirected to the paywall
 * instead of typing an essay first and hitting a 402 on submit).
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { fetchCsrfToken } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { ArrowLeft, Loader2, Sparkles, PenLine, AlertCircle } from "lucide-react";

interface GradeResult {
  overallBand: number | null;
  taskResponseBand: number | null;
  coherenceBand: number | null;
  lexicalBand: number | null;
  grammarBand: number | null;
  strengths: string[];
  improvements: string[];
  detailedFeedback: string;
}

function BandPill({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg border p-3 text-center">
      <div className="text-2xl font-bold">{value != null ? value.toFixed(1) : "—"}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

export default function IeltsWriting() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: access, isLoading: accessLoading } = useQuery<{ hasAccess: boolean }>({
    queryKey: ["/api/ielts/access"],
  });

  const [taskType, setTaskType] = useState<"task1" | "task2">("task2");
  const [prompt, setPrompt] = useState("");
  const [essay, setEssay] = useState("");
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [errMsg, setErrMsg] = useState("");

  const wordCount = essay.trim().split(/\s+/).filter(Boolean).length;
  const minWords = taskType === "task1" ? 150 : 250;

  useEffect(() => {
    if (!accessLoading && access && access.hasAccess === false) {
      navigate("/ielts-prep");
    }
  }, [access, accessLoading, navigate]);

  async function handleGrade() {
    setErrMsg("");
    if (!prompt.trim()) {
      toast({ title: "Add the task prompt", description: "Paste the question/prompt you were given so grading is fair.", variant: "destructive" });
      return;
    }
    if (wordCount < minWords) {
      toast({ title: "Essay looks short", description: `IELTS ${taskType === "task1" ? "Task 1" : "Task 2"} expects at least ${minWords} words. You have ${wordCount}.`, variant: "destructive" });
      return;
    }
    setGrading(true);
    setResult(null);
    try {
      const csrf = await fetchCsrfToken();
      const res = await fetch("/api/ielts/writing/grade", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ taskType, prompt: prompt.trim(), essay: essay.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.requiresUnlock) { navigate("/ielts-prep"); return; }
        throw new Error(data?.message ?? "Could not grade your essay.");
      }
      setResult(data.result);
    } catch (err: any) {
      setErrMsg(err?.message ?? "Something went wrong grading your essay.");
    } finally {
      setGrading(false);
    }
  }

  if (accessLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-amber-500" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:py-10">
      <Link href="/ielts-prep" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to IELTS Prep
      </Link>

      <div className="flex items-center gap-2 mb-1.5">
        <span className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
          <PenLine className="h-5 w-5" />
        </span>
        <Badge variant="outline">AI-graded</Badge>
      </div>
      <h1 className="text-2xl font-bold">Writing Feedback</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Paste your task prompt and your essay. You'll get band scores across the four official criteria plus specific feedback.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your submission</CardTitle>
          <CardDescription>Grading is an AI estimate, not an official IELTS result.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Task type</Label>
            <Select value={taskType} onValueChange={(v) => setTaskType(v as "task1" | "task2")}>
              <SelectTrigger className="w-48" data-testid="select-ielts-task-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="task1">Task 1 (Report/Letter, min. 150 words)</SelectItem>
                <SelectItem value="task2">Task 2 (Essay, min. 250 words)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ielts-prompt">Task prompt / question</Label>
            <Textarea
              id="ielts-prompt"
              placeholder="e.g. Some people think universities should focus on... Discuss both views and give your opinion."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              data-testid="textarea-ielts-prompt"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="ielts-essay">Your essay</Label>
              <span className={`text-xs ${wordCount < minWords ? "text-amber-600" : "text-muted-foreground"}`}>
                {wordCount} / {minWords}+ words
              </span>
            </div>
            <Textarea
              id="ielts-essay"
              placeholder="Paste your full essay here..."
              value={essay}
              onChange={(e) => setEssay(e.target.value)}
              rows={14}
              data-testid="textarea-ielts-essay"
            />
          </div>

          {errMsg && (
            <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-3 text-sm">
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <span>{errMsg}</span>
            </div>
          )}

          <Button
            onClick={handleGrade}
            disabled={grading}
            className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold"
            size="lg"
            data-testid="button-grade-essay"
          >
            {grading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {grading ? "Grading…" : "Get my band scores"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Your results
              <Badge className="bg-blue-600 text-white border-0">
                Overall Band {result.overallBand != null ? result.overallBand.toFixed(1) : "—"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <BandPill label="Task Response" value={result.taskResponseBand} />
              <BandPill label="Coherence & Cohesion" value={result.coherenceBand} />
              <BandPill label="Lexical Resource" value={result.lexicalBand} />
              <BandPill label="Grammar" value={result.grammarBand} />
            </div>

            {result.strengths.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm mb-1.5">What's working</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  {result.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            {result.improvements.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm mb-1.5">Focus on next</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                  {result.improvements.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            <div>
              <h4 className="font-semibold text-sm mb-1.5">Detailed feedback</h4>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{result.detailedFeedback}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
