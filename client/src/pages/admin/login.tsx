import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Lock, LogIn, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function AdminLogin() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // If user is logged in, try to establish admin session
    if (user && !isLoading) {
      handleAdminSession();
    }
  }, [user, isLoading]);

  const handleAdminSession = async () => {
    setIsLoggingIn(true);
    try {
      const response = await apiRequest("POST", "/api/admin/login");
      const data = await response.json();
      
      if (data.success) {
        setLocation("/admin");
      } else {
        toast({
          title: "Access Denied",
          description: "You do not have admin permissions.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      if (error?.message?.includes("403")) {
        toast({
          title: "Access Denied",
          description: "You do not have admin permissions.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Login Failed",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  if (isLoading || isLoggingIn) {
    return (
      <section className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-900" />
          <p className="mt-4 text-gray-600 dark:text-gray-300">Verifying access...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-lg max-w-md w-full text-center">
        <div className="bg-blue-900 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
          <Lock className="h-8 w-8 text-white" />
        </div>
        
        <h1 className="text-2xl font-bold mb-2">Admin Portal</h1>
        <p className="text-gray-600 dark:text-gray-300 text-sm mb-6">
          Sign in with your admin account to access the management dashboard.
        </p>
        
        <Button 
          onClick={handleLogin}
          className="w-full bg-blue-900 hover:bg-blue-800"
          data-testid="button-admin-login"
        >
          <LogIn className="h-4 w-4 mr-2" />
          Sign in with Replit
        </Button>

        <p className="text-xs text-gray-500 dark:text-gray-400 mt-6">
          Only authorized administrators can access this area.
        </p>
      </div>
    </section>
  );
}
