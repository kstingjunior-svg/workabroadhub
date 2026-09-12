/**
 * IELTS Reading mock test — Phase 1 (2026-09).
 *
 * Route: /ielts-prep/reading/:testId
 * Fetches the passage+questions (answers stripped server-side), lets the
 * user answer inline, submits to the server for scoring (never trust a
 * client-computed score), and shows a full review.
 */
import { useParams } from "wouter";
import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { fetchCsrfToken } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, ClipboardCheck, CheckCircle2, XCircle, Clock } from "lucide-react";

interface ReadingQuestionPublic {
  id: number;
  type: "matching_heading" | "true_false_notgiven" | "multiple_choice";
  paragraphRef?: string;
  prompt: string;
  options?: string[];
}

interface ReadingTestPublic {
  id: string;
  title: string;
  estimatedMinutes: number;
  instructions: string;
  passage: { label: string; text: string }[];
  headingBank: { numeral: string; text: string }[];
  questions: ReadingQuestionPublic[];
}

interface SubmitResult {
  score: number;
  total: number;
  review: Array<{ id: number; yourAnswer: string | null; correctAnswer: string; isCorrect: boolean }>;
  scoringNote: string;
}

export default function IeltsReadingTest() {
  const params = useParams<{ testId: string }>();
  const testId = params.testId;
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: access, isLoading: accessLoading } = useQuery<{ hasAccess: boolean }>({
    queryKey: ["/api/ielts/access"],
  });

  const { data, isLoading, error } = useQuery<{ test: ReadingTestPublic }>({
    queryKey: [`/api/ielts/reading/tests/${testId}`],
    enabled: !!access?.hasAccess,
  });

  useEffect(() => {
    if (!accessLoading && access && access.hasAccess === false) {
      navigate("/ielts-prep");
    }
  }, [access, accessLoading, navigate]);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  function setAnswer(qId: number, value: string) {
    setAnswers((prev) => ({ ...prev, [String(qId)]: value }));
  }

  async function handleSubmit() {
    if (!data?.test) return;
    const unanswered = data.test.questions.filter((q) => !answers[String(q.id)]);
    if (unanswered.length > 0) {
      toast({ title: "Some questions are blank", description: `You have ${unanswered.length} unanswered question(s). You can still submit — blanks just count as incorrect.`, });
    }
    setSubmitting(true);
    try {
      const csrf = await fetchCsrfToken();
      const res = await fetch(`/api/ielts/reading/tests/${testId}/submit`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ answers }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json?.requiresUnlock) { navigate("/ielts-prep"); return; }
        throw new Error(json?.message ?? "Could not submit your test.");
      }
      setResult(json);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      toast({ title: "Submission failed", description: err?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  if (accessLoading || isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-purple-500" />
      </div>
    );
  }

  if (error || !data?.test) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-3">
        <p className="text-sm text-muted-foreground">Could not load this test.</p>
        <Link href="/ielts-prep" className="text-sm text-blue-600 hover:underline">Back to IELTS Prep</Link>
      </div>
    );
  }

  const test = data.test;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:py-10">
      <Link href="/ielts-prep" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to IELTS Prep
      </Link>

      <div className="flex items-center gap-2 mb-1.5">
        <span className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
          <ClipboardCheck className="h-5 w-5" />
        </span>
        <Badge variant="outline" className="flex items-center gap-1"><Clock className="h-3 w-3" /> ~{test.estimatedMinutes} min</Badge>
      </div>
      <h1 className="text-2xl font-bold">{test.title}</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">{test.instructions}</p>

      {result && (
        <Card className="mb-6 border-purple-200 dark:border-purple-800">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              You scored {result.score} / {result.total}
            </CardTitle>
            <CardDescription>{result.scoringNote}</CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Passage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {test.passage.map((p) => (
            <div key={p.label}>
              <span className="font-bold text-sm mr-2">{p.label}.</span>
              <span className="text-sm leading-relaxed text-muted-foreground">{p.text}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {test.headingBank?.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">List of Headings</CardTitle>
            <CardDescription>Used for the Matching Headings questions below.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1">
              {test.headingBank.map((h) => (
                <li key={h.numeral}><strong>{h.numeral}.</strong> {h.text}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {test.questions.map((q, idx) => {
          const review = result?.review.find((r) => r.id === q.id);
          return (
            <Card key={q.id} className={review ? (review.isCorrect ? "border-emerald-300 dark:border-emerald-700" : "border-red-300 dark:border-red-700") : undefined}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">
                    <span className="text-muted-foreground mr-1.5">{idx + 1}.</span>
                    {q.paragraphRef ? <span className="text-muted-foreground mr-1">(Paragraph {q.paragraphRef})</span> : null}
                    {q.prompt}
                  </p>
                  {review && (review.isCorrect
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    : <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  )}
                </div>

                {q.type === "matching_heading" && (
                  <RadioGroup
                    value={answers[String(q.id)] ?? ""}
                    onValueChange={(v) => setAnswer(q.id, v)}
                    disabled={!!result}
                    className="grid grid-cols-2 sm:grid-cols-4 gap-2"
                  >
                    {test.headingBank.map((h) => (
                      <div key={h.numeral} className="flex items-center gap-1.5">
                        <RadioGroupItem value={h.numeral} id={`q${q.id}-${h.numeral}`} />
                        <Label htmlFor={`q${q.id}-${h.numeral}`} className="text-xs font-normal cursor-pointer">{h.numeral}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                )}

                {q.type === "true_false_notgiven" && (
                  <RadioGroup
                    value={answers[String(q.id)] ?? ""}
                    onValueChange={(v) => setAnswer(q.id, v)}
                    disabled={!!result}
                    className="flex flex-wrap gap-4"
                  >
                    {["TRUE", "FALSE", "NOT GIVEN"].map((opt) => (
                      <div key={opt} className="flex items-center gap-1.5">
                        <RadioGroupItem value={opt} id={`q${q.id}-${opt}`} />
                        <Label htmlFor={`q${q.id}-${opt}`} className="text-sm font-normal cursor-pointer">{opt}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                )}

                {q.type === "multiple_choice" && q.options && (
                  <RadioGroup
                    value={answers[String(q.id)] ?? ""}
                    onValueChange={(v) => setAnswer(q.id, v)}
                    disabled={!!result}
                    className="space-y-1.5"
                  >
                    {q.options.map((opt) => {
                      const letter = opt.trim().charAt(0);
                      return (
                        <div key={opt} className="flex items-start gap-1.5">
                          <RadioGroupItem value={letter} id={`q${q.id}-${letter}`} className="mt-0.5" />
                          <Label htmlFor={`q${q.id}-${letter}`} className="text-sm font-normal cursor-pointer">{opt}</Label>
                        </div>
                      );
                    })}
                  </RadioGroup>
                )}

                {review && !review.isCorrect && (
                  <p className="text-xs text-muted-foreground">Correct answer: <strong>{review.correctAnswer}</strong></p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!result && (
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full sm:w-auto mt-6 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold"
          size="lg"
          data-testid="button-submit-reading-test"
        >
          {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          {submitting ? "Scoring…" : "Submit test"}
        </Button>
      )}
    </div>
  );
}
