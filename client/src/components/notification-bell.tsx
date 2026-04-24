import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CheckCheck,
  Package,
  Info,
  CheckCircle,
  AlertTriangle,
  Loader2,
  X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { UserNotification } from "@shared/schema";

function relativeTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function TypeIcon({ type }: { type: string }) {
  switch (type) {
    case "order_update":
      return <Package className="h-4 w-4 text-blue-500 shrink-0" />;
    case "success":
      return <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />;
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />;
    default:
      return <Info className="h-4 w-4 text-purple-500 shrink-0" />;
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery<UserNotification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  const unread = notifications.filter(n => !n.isRead).length;

  const markOne = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const markAll = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/mark-all-read"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const handleOpen = (next: boolean) => {
    setOpen(next);
    if (next && unread > 0) {
      markAll.mutate();
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative p-2 hover:bg-white/10 rounded-lg transition-colors"
          aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
          data-testid="button-notifications"
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin opacity-70" />
          ) : (
            <Bell className={cn("h-5 w-5", open && "text-white")} />
          )}
          {unread > 0 && (
            <span
              className="absolute top-1 right-1 h-4 w-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center"
              aria-hidden="true"
              data-testid="badge-unread-count"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-0 shadow-xl rounded-xl overflow-hidden"
        data-testid="panel-notifications"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Notifications</span>
            {unread > 0 && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5 py-0">
                {unread} new
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {notifications.some(n => !n.isRead) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="h-3 w-3 mr-1" />
                Mark all read
              </Button>
            )}
          </div>
        </div>

        {/* List */}
        <ScrollArea className="max-h-[380px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Bell className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm font-medium">No notifications yet</p>
              <p className="text-xs mt-0.5 opacity-60">We'll notify you of order updates here</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "flex gap-3 px-4 py-3 transition-colors hover:bg-muted/30",
                    !n.isRead && "bg-blue-50/60 dark:bg-blue-950/30"
                  )}
                  data-testid={`notification-item-${n.id}`}
                >
                  <div className="mt-0.5">
                    <TypeIcon type={n.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <p className={cn("text-sm leading-snug", !n.isRead && "font-semibold")}>
                        {n.title}
                      </p>
                      <div className="flex items-center gap-1 shrink-0 mt-0.5">
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {relativeTime(n.createdAt)}
                        </span>
                        {!n.isRead && (
                          <button
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => markOne.mutate(n.id)}
                            aria-label="Dismiss"
                            data-testid={`button-dismiss-notif-${n.id}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                      {n.message}
                    </p>
                    {!n.isRead && (
                      <span className="inline-flex items-center mt-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500 mr-1" />
                        <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">New</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="px-4 py-2 border-t bg-muted/20 text-center">
            <span className="text-[10px] text-muted-foreground">
              Updates every 30s · {notifications.length} total notification{notifications.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
