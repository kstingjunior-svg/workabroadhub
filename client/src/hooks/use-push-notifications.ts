import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: vapidKey } = useQuery<{ publicKey: string }>({
    queryKey: ["/api/push/vapid-key"],
    retry: false,
  });

  const { data: status } = useQuery<{ subscribed: boolean; subscriptionCount: number }>({
    queryKey: ["/api/push/status"],
    retry: false,
  });

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);
    
    if (supported) {
      setPermission(Notification.permission);
      
      navigator.serviceWorker.register('/sw.js')
        .then(reg => {
          setRegistration(reg);
        })
        .catch(err => {
          console.error('Service worker registration failed:', err);
        });
    }
  }, []);

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      if (!registration || !vapidKey?.publicKey) {
        throw new Error("Push notifications not available");
      }

      let currentPermission = Notification.permission;
      if (currentPermission === "default") {
        currentPermission = await Notification.requestPermission();
        setPermission(currentPermission);
      }

      if (currentPermission !== "granted") {
        throw new Error("Notification permission denied");
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey.publicKey)
      });

      const subscriptionJson = subscription.toJSON();
      
      await apiRequest("POST", "/api/push/subscribe", {
        endpoint: subscriptionJson.endpoint,
        keys: subscriptionJson.keys
      });

      return subscription;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/push/status"] });
      toast({
        title: "Notifications Enabled",
        description: "You'll receive notifications for new job postings and updates.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Subscription Failed",
        description: error.message || "Could not enable notifications",
        variant: "destructive",
      });
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async () => {
      if (!registration) {
        throw new Error("Service worker not registered");
      }

      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        await apiRequest("POST", "/api/push/unsubscribe", { endpoint: subscription.endpoint });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/push/status"] });
      toast({
        title: "Notifications Disabled",
        description: "You will no longer receive push notifications.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Unsubscribe Failed",
        description: error.message || "Could not disable notifications",
        variant: "destructive",
      });
    },
  });

  const subscribe = useCallback(() => {
    subscribeMutation.mutate();
  }, [subscribeMutation]);

  const unsubscribe = useCallback(() => {
    unsubscribeMutation.mutate();
  }, [unsubscribeMutation]);

  return {
    isSupported,
    permission,
    isSubscribed: status?.subscribed || false,
    isLoading: subscribeMutation.isPending || unsubscribeMutation.isPending,
    subscribe,
    unsubscribe,
  };
}
