import { useToast } from "@/hooks/use-toast";
import { useFeatureGate } from "@/hooks/use-feature-gate";

export type JobType = "visa" | "agency" | "portal";

/**
 * Opens a job's external link. The SERVER decides access (GET /api/go/job/:id);
 * a 401/402/403-upgrade reply turns into the contextual prompt for
 * "premium job links" via the central feature gate. Called only from a tap.
 */
export function useJobRedirect() {
  const { toast } = useToast();
  const gate = useFeatureGate();

  const openJob = async (jobId: string, type: JobType) => {
    try {
      const res = await fetch(`/api/go/job/${encodeURIComponent(jobId)}?type=${type}`, {
        credentials: "include",
      });
      const body = await res.clone().json().catch(() => null);

      if (res.status === 403 && !body?.code && !body?.upgradeRequired) {
        // Legacy 403 from /api/go/job means "plan required".
        gate.prompt("premium_job_links", body);
        return;
      }
      if (gate.handleResponse("premium_job_links", res.status, body)) return;

      if (!res.ok) {
        toast({
          title: "Link unavailable",
          description: "This job link could not be opened. Please try again.",
          variant: "destructive",
        });
        return;
      }

      const url = body?.url;
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch {
      toast({
        title: "Connection error",
        description: "Unable to open job link. Check your connection and try again.",
        variant: "destructive",
      });
    }
  };

  return { openJob };
}
