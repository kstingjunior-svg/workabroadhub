import { useUpgradeModal } from "@/contexts/upgrade-modal-context";
import { useToast } from "@/hooks/use-toast";

export type JobType = "visa" | "agency" | "portal";

export function useJobRedirect() {
  const { openUpgradeModal } = useUpgradeModal();
  const { toast } = useToast();

  const openJob = async (jobId: string, type: JobType) => {
    try {
      const res = await fetch(`/api/go/job/${encodeURIComponent(jobId)}?type=${type}`, {
        credentials: "include",
      });

      if (res.status === 401) {
        toast({
          title: "Sign in required",
          description: "Please sign in to access job links.",
          variant: "destructive",
        });
        return;
      }

      if (res.status === 403) {
        openUpgradeModal("jobs_locked");
        return;
      }

      if (!res.ok) {
        toast({
          title: "Link unavailable",
          description: "This job link could not be opened. Please try again.",
          variant: "destructive",
        });
        return;
      }

      const { url } = await res.json();
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
