import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Bell, Send, Users, History, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import AdminLayout from "@/components/admin-layout";

interface PushStats {
  subscriberCount: number;
  totalNotificationsSent: number;
  recentNotifications: Array<{
    id: string;
    title: string;
    body: string;
    sentAt: string | null;
    recipientCount: number | null;
    status: string;
  }>;
}

export default function AdminPushNotifications() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: stats, isLoading, isError } = useQuery<PushStats>({
    queryKey: ["/api/admin/push/stats"],
  });

  const broadcastMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/push/broadcast", {
        title,
        body,
        url: url || undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/push/stats"] });
      toast({
        title: "Notification Sent",
        description: `Successfully sent to ${data.sent} subscribers`,
      });
      setTitle("");
      setBody("");
      setUrl("");
    },
    onError: (error: Error) => {
      toast({
        title: "Send Failed",
        description: error.message || "Could not send notification",
        variant: "destructive",
      });
    },
  });

  const handleSend = () => {
    if (!title.trim() || !body.trim()) {
      toast({
        title: "Missing Fields",
        description: "Please enter a title and message",
        variant: "destructive",
      });
      return;
    }
    broadcastMutation.mutate();
  };

  if (isLoading) {
    return (
      <AdminLayout title="Push Notifications">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid md:grid-cols-3 gap-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (isError) {
    return (
      <AdminLayout title="Push Notifications">
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-destructive mb-4">Failed to load push notification stats</p>
          <Button onClick={() => window.location.reload()} data-testid="button-retry">
            Try Again
          </Button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Push Notifications">
      <div className="space-y-6">
        <p className="text-muted-foreground" data-testid="text-page-description">
          Send notifications to subscribed users about job postings and updates
        </p>

        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-subscriber-count">{stats?.subscriberCount || 0}</p>
                  <p className="text-sm text-muted-foreground">Active Subscribers</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <Send className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-sent-count">{stats?.totalNotificationsSent || 0}</p>
                  <p className="text-sm text-muted-foreground">Notifications Sent</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <Bell className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-status">Active</p>
                  <p className="text-sm text-muted-foreground">Notification Status</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Send New Notification
              </CardTitle>
              <CardDescription>
                Broadcast a notification to all subscribed users
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="New Job Alert: Software Developer"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  data-testid="input-notification-title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="body">Message</Label>
                <Textarea
                  id="body"
                  placeholder="Check out new software developer positions in Australia..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={3}
                  data-testid="input-notification-body"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="url">Link (optional)</Label>
                <Input
                  id="url"
                  placeholder="/country/australia"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  data-testid="input-notification-url"
                />
                <p className="text-xs text-muted-foreground">
                  Where users will be directed when they click the notification
                </p>
              </div>

              <Button
                onClick={handleSend}
                disabled={broadcastMutation.isPending || !title.trim() || !body.trim()}
                className="w-full"
                data-testid="button-send-notification"
              >
                {broadcastMutation.isPending ? (
                  "Sending..."
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send to {stats?.subscriberCount || 0} Subscribers
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Recent Notifications
              </CardTitle>
              <CardDescription>
                History of sent notifications
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stats?.recentNotifications && stats.recentNotifications.length > 0 ? (
                <div className="space-y-3" data-testid="list-notifications">
                  {stats.recentNotifications.map((notification) => (
                    <div key={notification.id} className="p-3 rounded-lg border" data-testid={`notification-${notification.id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium truncate">{notification.title}</h4>
                          <p className="text-sm text-muted-foreground line-clamp-2">{notification.body}</p>
                        </div>
                        <Badge variant={notification.status === "sent" ? "default" : "secondary"}>
                          {notification.status === "sent" ? (
                            <CheckCircle className="h-3 w-3 mr-1" />
                          ) : null}
                          {notification.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        {notification.sentAt && (
                          <span>{format(new Date(notification.sentAt), "MMM d, yyyy HH:mm")}</span>
                        )}
                        {notification.recipientCount !== null && (
                          <span>{notification.recipientCount} recipients</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8" data-testid="text-no-notifications">
                  No notifications sent yet
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
