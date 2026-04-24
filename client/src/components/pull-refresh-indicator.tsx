import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PullRefreshIndicatorProps {
  pullProgress: number;
  isRefreshing: boolean;
  isPulling: boolean;
}

export function PullRefreshIndicator({ 
  pullProgress, 
  isRefreshing, 
  isPulling 
}: PullRefreshIndicatorProps) {
  if (!isPulling && !isRefreshing) return null;

  return (
    <div 
      className={cn(
        "fixed top-0 left-0 right-0 z-50 flex items-center justify-center transition-all duration-300",
        isRefreshing ? "h-16 bg-blue-500" : "bg-transparent"
      )}
      style={{ 
        height: isRefreshing ? 64 : pullProgress * 80,
        opacity: Math.min(pullProgress * 2, 1)
      }}
    >
      <div 
        className={cn(
          "w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center transition-all duration-300",
          isRefreshing && "animate-spin"
        )}
        style={{
          transform: `rotate(${pullProgress * 360}deg) scale(${0.5 + pullProgress * 0.5})`,
        }}
      >
        <RefreshCw className={cn(
          "h-5 w-5 text-blue-500",
          pullProgress >= 1 && "text-green-500"
        )} />
      </div>
    </div>
  );
}
