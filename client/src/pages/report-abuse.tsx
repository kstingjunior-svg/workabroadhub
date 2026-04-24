import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, AlertTriangle, Send } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";

const REPORT_TYPES = [
  "Suspicious Job Listing",
  "Fraudulent Agency",
  "Scam/Fraud",
  "Harassment",
  "Misleading Content",
  "Other",
];

export default function ReportAbuse() {
  const { toast } = useToast();
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/reports/abuse", {
        type,
        description,
        contactEmail: contactEmail || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Report Submitted",
        description: "Thank you for helping keep our community safe. We will review your report promptly.",
      });
      setType("");
      setDescription("");
      setContactEmail("");
    },
    onError: (error: Error) => {
      toast({
        title: "Submission Failed",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const isValid = type && description.length >= 20;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    mutation.mutate();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="WorkAbroad Hub" className="h-8 w-8 rounded-lg object-cover" />
              <span className="font-semibold text-lg">WorkAbroad Hub</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="space-y-8">
          <div className="text-center space-y-4">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="text-3xl font-serif font-bold" data-testid="text-page-title">Report Abuse or Scam</h1>
            <p className="text-muted-foreground">
              Help us keep the community safe by reporting suspicious activities, scams, or fraudulent agencies.
            </p>
          </div>

          <Card>
            <CardContent className="p-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="report-type">
                    Report Type
                  </label>
                  <Select value={type} onValueChange={setType} data-testid="select-report-type">
                    <SelectTrigger id="report-type" data-testid="select-trigger-report-type">
                      <SelectValue placeholder="Select a report type" />
                    </SelectTrigger>
                    <SelectContent>
                      {REPORT_TYPES.map((rt) => (
                        <SelectItem key={rt} value={rt} data-testid={`select-item-${rt.toLowerCase().replace(/[\s/]+/g, "-")}`}>
                          {rt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="report-description">
                    Description
                  </label>
                  <Textarea
                    id="report-description"
                    data-testid="textarea-description"
                    placeholder="Please describe the issue in detail (minimum 20 characters)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="min-h-[120px]"
                    required
                    minLength={20}
                  />
                  {description.length > 0 && description.length < 20 && (
                    <p className="text-xs text-destructive" data-testid="text-description-error">
                      Description must be at least 20 characters ({20 - description.length} more needed)
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="contact-email">
                    Contact Email (optional)
                  </label>
                  <Input
                    id="contact-email"
                    data-testid="input-contact-email"
                    type="email"
                    placeholder="your@email.com (for follow-up)"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Provide your email if you would like us to follow up on your report.
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={!isValid || mutation.isPending}
                  data-testid="button-submit-report"
                  className="w-full"
                >
                  {mutation.isPending ? (
                    "Submitting..."
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Submit Report
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
