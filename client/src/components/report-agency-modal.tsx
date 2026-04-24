import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Flag, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { reportAgency, REPORT_REASONS } from "@/lib/firebase-agency-reports";
import { useFirebasePresence } from "@/hooks/use-firebase-presence";

interface ReportAgencyModalProps {
  open: boolean;
  onClose: () => void;
  licenseNumber: string;
  agencyName: string;
}

export function ReportAgencyModal({ open, onClose, licenseNumber, agencyName }: ReportAgencyModalProps) {
  const { toast } = useToast();
  const { myVisitorId } = useFirebasePresence();
  const [selectedReason, setSelectedReason] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    if (!selectedReason) return;
    setSubmitting(true);
    try {
      await reportAgency(licenseNumber, selectedReason, myVisitorId ?? "anonymous", agencyName);
      setSubmitted(true);
      toast({
        title: "Report submitted",
        description: "Thank you. Our team will review this agency within 24–48 hours.",
      });
    } catch {
      toast({ title: "Submission failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setSelectedReason("");
    setSubmitted(false);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Flag className="h-5 w-5" />
            Report Agency
          </DialogTitle>
        </DialogHeader>

        {submitted ? (
          <div className="py-6 text-center space-y-3">
            <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto" />
            <p className="font-semibold text-gray-800 dark:text-gray-100">Report Received</p>
            <p className="text-sm text-muted-foreground">
              We've logged your report against <strong>{agencyName}</strong>. Our compliance team
              will review it within 24–48 hours.
            </p>
            <Button variant="outline" onClick={handleClose} className="mt-2" data-testid="button-close-report-modal">
              Close
            </Button>
          </div>
        ) : (
          <>
            <div className="py-1 space-y-4">
              <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-amber-800 dark:text-amber-300">
                  Reporting <strong>{agencyName}</strong>
                  {" "}(License: <span className="font-mono text-xs">{licenseNumber}</span>).
                  False reports may result in your access being revoked.
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2.5">
                  Select the reason for your report:
                </p>
                <div className="space-y-2">
                  {REPORT_REASONS.map((reason) => (
                    <button
                      key={reason}
                      onClick={() => setSelectedReason(reason)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                        selectedReason === reason
                          ? "border-red-400 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 font-medium"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300"
                      }`}
                      data-testid={`reason-option-${reason.replace(/\s+/g, "-").toLowerCase()}`}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose} disabled={submitting} data-testid="button-cancel-report">
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!selectedReason || submitting}
                className="bg-red-600 hover:bg-red-700 text-white gap-2"
                data-testid="button-submit-report"
              >
                <Flag className="h-3.5 w-3.5" />
                {submitting ? "Submitting…" : "Submit Report"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
