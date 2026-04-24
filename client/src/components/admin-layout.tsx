import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Globe,
  FileText,
  AlertTriangle,
  Settings,
  LogOut,
  Building2,
  Calendar,
  Star,
  Package,
  Bell,
  ShieldCheck,
  Gift,
  Lock,
  MessageSquare,
  BarChart3,
  Database,
  ArrowLeft,
  ClipboardCheck,
  Clock,
  Landmark,
  Scan,
  RotateCcw,
  DollarSign,
  Activity,
  Briefcase,
  Trophy,
  Flag,
  AlertOctagon,
  Unlink,
} from "lucide-react";

interface AdminLayoutProps {
  children: React.ReactNode;
  title: string;
  showBackButton?: boolean;
}

const navItems = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/home", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/supabase-stats", label: "Supabase Stats", icon: Database },
  { href: "/admin/revenue", label: "Revenue", icon: DollarSign },
  { href: "/admin/revenue-live", label: "Revenue Live 🔥", icon: DollarSign },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/unmatched-payments", label: "Unmatched Payments", icon: Unlink },
  { href: "/admin/referrals", label: "Referrals", icon: Gift },
  { href: "/admin/consultations", label: "Consultations", icon: MessageSquare },
  { href: "/admin/success-stories", label: "Success Stories", icon: Trophy },
  { href: "/admin/reported-agencies", label: "Reported Agencies", icon: Flag },
  { href: "/admin/bookings", label: "Bookings", icon: Calendar },
  { href: "/admin/agency-ratings", label: "Agency Ratings", icon: Star },
  { href: "/admin/portal-health", label: "Portal Health", icon: Activity },
  { href: "/admin/countries", label: "Countries", icon: Globe },
  { href: "/admin/services", label: "Services", icon: FileText },
  { href: "/admin/service-orders", label: "Service Orders", icon: Package },
  { href: "/admin/job-applications", label: "Job Applications", icon: Briefcase },
  { href: "/admin/alerts", label: "Scam Alerts", icon: AlertTriangle },
  { href: "/admin/agencies", label: "NEA Agencies", icon: Building2 },
  { href: "/admin/agency-claims", label: "Agency Claims", icon: ShieldCheck },
  { href: "/admin/agency-addons", label: "Agency Add-Ons", icon: Star },
  { href: "/admin/license-expiry", label: "License Expiry", icon: ClipboardCheck },
  { href: "/admin/license-reminders", label: "License Reminders", icon: Clock },
  { href: "/admin/expiry-heatmap", label: "Expiry Heat Map", icon: Calendar },
  { href: "/admin/push-notifications", label: "Push Notifications", icon: Bell },
  { href: "/admin/sms-whatsapp", label: "SMS & WhatsApp", icon: MessageSquare },
  { href: "/admin/trust-dashboard", label: "Trust Dashboard", icon: ShieldCheck },
  { href: "/admin/review-dashboard", label: "Review Dashboard", icon: FileText },
  { href: "/admin/government-integrations", label: "Gov Integrations", icon: Landmark },
  { href: "/admin/agency-scores", label: "Agency Scores", icon: ShieldCheck },
  { href: "/admin/fraud-detection", label: "Fraud Detection", icon: ShieldCheck },
  { href: "/admin/scam-reports", label: "Scam Reports", icon: ShieldCheck },
  { href: "/admin/compliance-monitor", label: "Compliance Monitor", icon: Scan },
  { href: "/admin/security", label: "Security Monitor", icon: ShieldCheck },
  { href: "/admin/refunds", label: "Refund Dashboard", icon: RotateCcw },
  { href: "/admin/plans", label: "Plan & Pricing", icon: DollarSign },
  { href: "/admin/logs", label: "Activity Logs", icon: Activity },
  { href: "/admin/error-monitor", label: "Error Monitor 🚨", icon: AlertOctagon },
];

export default function AdminLayout({ children, title }: AdminLayoutProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  // Check admin access by attempting to fetch admin stats
  const { error: adminError, isLoading: isCheckingAdmin } = useQuery({
    queryKey: ["/api/admin/stats"],
    retry: 1, // Retry once for transient errors
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  // Show loading while checking admin access
  if (isCheckingAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-center">
          <Skeleton className="h-8 w-8 rounded-full mx-auto mb-4" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  // Check if error is access-related (401/403) vs other errors
  const errorMessage = (adminError as any)?.message || "";
  const isUnauthorized = adminError && (
    errorMessage.includes("401") ||
    errorMessage.includes("Unauthorized")
  );
  const isForbidden = adminError && (
    errorMessage.includes("403") ||
    errorMessage.includes("Admin access required")
  );

  // Check for server/network errors (500, timeout, network error)
  const isServerError = adminError && !isUnauthorized && !isForbidden;

  // 401 = session expired / not logged in → prompt re-login
  if (isUnauthorized) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center max-w-md w-full shadow-lg">
          <div className="w-16 h-16 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center mx-auto mb-4">
            <Lock className="h-8 w-8 text-yellow-500" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Session Expired</h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            Your session has expired. Please sign in again to access the admin panel.
          </p>
          <a href="/api/login" className="block w-full">
            <Button className="w-full" data-testid="button-relogin">
              Sign In Again
            </Button>
          </a>
        </div>
      </div>
    );
  }

  // 403 = authenticated but not admin
  if (isForbidden) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center max-w-md w-full shadow-lg">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
            <Lock className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            You do not have permission to access the admin panel.
          </p>
          <Link href="/">
            <Button className="w-full" data-testid="button-go-home">
              Go to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Show temporary error for server/network issues
  if (isServerError) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center max-w-md w-full shadow-lg">
          <div className="w-16 h-16 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="h-8 w-8 text-yellow-500" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Service Temporarily Unavailable</h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            Unable to connect to admin services. Please try again in a moment.
          </p>
          <Button 
            onClick={() => window.location.reload()} 
            className="w-full"
            data-testid="button-retry"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex min-h-screen w-full">
        <Sidebar aria-label="Admin navigation">
          <SidebarHeader className="border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Settings className="h-6 w-6" aria-hidden="true" />
              <span className="font-semibold text-lg">Admin Panel</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu role="navigation" aria-label="Admin menu">
                  {navItems.map((item) => {
                    const isActive =
                      location === item.href ||
                      (item.href !== "/admin" && location.startsWith(item.href));
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          data-testid={`nav-${item.label.toLowerCase().replace(" ", "-")}`}
                          aria-current={isActive ? "page" : undefined}
                        >
                          <Link href={item.href} aria-label={item.label}>
                            <item.icon className="h-4 w-4" aria-hidden="true" />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="border-t p-4 space-y-2">
            <Link href="/">
              <Button variant="outline" className="w-full justify-start touch-target-min" data-testid="button-main-site" aria-label="Go to main site">
                <Globe className="h-4 w-4 mr-2" aria-hidden="true" />
                Main Site
              </Button>
            </Link>
            <Button
              variant="ghost"
              className="w-full justify-start text-muted-foreground touch-target-min"
              onClick={() => logout()}
              data-testid="button-logout"
              aria-label="Log out of admin panel"
            >
              <LogOut className="h-4 w-4 mr-2" aria-hidden="true" />
              Logout
            </Button>
          </SidebarFooter>
        </Sidebar>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b" role="banner">
            <div className="flex items-center justify-between h-14 px-4 gap-4">
              <div className="flex items-center gap-3">
                <SidebarTrigger data-testid="button-sidebar-toggle" aria-label="Toggle sidebar navigation" />
                <Link href="/dashboard">
                  <Button variant="ghost" size="sm" className="gap-1 touch-target-min" data-testid="button-go-back" aria-label="Go back to user dashboard">
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">Go Back</span>
                  </Button>
                </Link>
                <h1 className="text-lg font-semibold truncate">{title}</h1>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground hidden sm:block" aria-label="Logged in as">
                  {user?.email || user?.firstName || "Admin"}
                </span>
              </div>
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6 overflow-auto" role="main" aria-label={title}>{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
