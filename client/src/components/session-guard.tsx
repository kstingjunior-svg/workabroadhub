import { useInactivityTimer } from "@/hooks/use-inactivity-timer";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

/**
 * App-level inactivity guard.
 *
 * Mounted once in App.tsx. After 30 minutes of no mouse, keyboard,
 * click, or scroll activity it shows a non-blocking toast with a
 * one-click page-refresh action — replacing the original alert().
 *
 * Firebase presence cleanup is handled separately inside
 * useFirebasePresence, which runs the same timer for anonymous
 * visitors and removes them from the activeVisitors node.
 */
export function SessionGuard() {
  const { toast } = useToast();

  const handleIdle = () => {
    toast({
      title: "Session paused due to inactivity",
      description: "You've been inactive for 30 minutes. Refresh to continue browsing.",
      action: (
        <ToastAction
          altText="Refresh page"
          onClick={() => window.location.reload()}
          data-testid="btn-session-refresh"
        >
          Refresh now
        </ToastAction>
      ),
    });
  };

  useInactivityTimer({ onIdle: handleIdle });

  return null;
}
