import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";

export function NetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      setTimeout(() => setShowReconnected(false), 3000);
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!isOnline) {
    return (
      <div 
        className="fixed top-0 left-0 right-0 bg-destructive text-destructive-foreground py-2 px-4 text-center text-sm z-50 flex items-center justify-center gap-2"
        data-testid="network-offline-banner"
        role="alert"
        aria-live="assertive"
      >
        <WifiOff className="h-4 w-4" aria-hidden="true" />
        <span>No internet connection. Some features may not work.</span>
      </div>
    );
  }

  if (showReconnected) {
    return (
      <div 
        className="fixed top-0 left-0 right-0 bg-green-600 text-white py-2 px-4 text-center text-sm z-50 flex items-center justify-center gap-2 animate-in slide-in-from-top duration-300"
        data-testid="network-reconnected-banner"
        role="status"
        aria-live="polite"
      >
        <Wifi className="h-4 w-4" aria-hidden="true" />
        <span>Back online!</span>
      </div>
    );
  }

  return null;
}
