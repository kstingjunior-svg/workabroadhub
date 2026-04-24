import { useLocation, Link } from "wouter";
import { Home, Wrench, Briefcase, User, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", icon: Home, label: "Home" },
  { href: "/tools", icon: Wrench, label: "Tools" },
  { href: "/services", icon: Briefcase, label: "Services" },
  { href: "/my-orders", icon: ShoppingBag, label: "Orders" },
  { href: "/profile", icon: User, label: "Profile" },
];

export function BottomNav() {
  const [location] = useLocation();

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg border-t border-gray-200 dark:border-gray-800 safe-area-bottom md:hidden" 
      style={{ zIndex: "var(--z-bottom-nav)" }}
      data-testid="bottom-nav"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-around h-16 px-2" role="menubar">
        {navItems.map((item) => {
          const isActive = location === item.href || 
            (item.href === "/dashboard" && location === "/");
          const Icon = item.icon;
          
          return (
            <Link key={item.href} href={item.href}>
              <button
                className={cn(
                  "flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-300 touch-target-min",
                  isActive 
                    ? "text-blue-600 dark:text-blue-400" 
                    : "text-gray-500 dark:text-gray-400 active:scale-95"
                )}
                data-testid={`nav-${item.label.toLowerCase()}`}
                role="menuitem"
                aria-current={isActive ? "page" : undefined}
                aria-label={`Navigate to ${item.label}`}
              >
                <div className={cn(
                  "relative p-2 rounded-xl transition-all duration-300",
                  isActive && "bg-blue-100 dark:bg-blue-900/50"
                )}>
                  <Icon className={cn(
                    "h-5 w-5 transition-transform duration-300",
                    isActive && "scale-110"
                  )} aria-hidden="true" />
                  {isActive && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-blue-600 dark:bg-blue-400 rounded-full" aria-hidden="true" />
                  )}
                </div>
                <span className={cn(
                  "text-[10px] font-medium mt-0.5 transition-all duration-300",
                  isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"
                )}>
                  {item.label}
                </span>
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
