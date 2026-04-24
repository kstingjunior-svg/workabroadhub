import { useState, useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      setTheme("dark");
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleTheme = () => {
    setIsAnimating(true);
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    setTimeout(() => setIsAnimating(false), 500);
  };

  return (
    <button 
      onClick={toggleTheme} 
      className={cn(
        "relative w-14 h-8 rounded-full p-1 transition-all duration-500",
        theme === "light" 
          ? "bg-gradient-to-r from-blue-400 to-cyan-300" 
          : "bg-gradient-to-r from-indigo-800 to-purple-900"
      )}
      data-testid="button-theme-toggle"
    >
      <div 
        className={cn(
          "absolute top-1 w-6 h-6 rounded-full shadow-md flex items-center justify-center transition-all duration-500",
          theme === "light" 
            ? "left-1 bg-yellow-300" 
            : "left-7 bg-slate-200",
          isAnimating && "scale-90"
        )}
      >
        {theme === "light" ? (
          <Sun className="h-4 w-4 text-yellow-600" />
        ) : (
          <Moon className="h-4 w-4 text-indigo-600" />
        )}
      </div>
      
      {theme === "dark" && (
        <>
          <span className="absolute top-1.5 left-2 w-1 h-1 bg-white rounded-full opacity-60" />
          <span className="absolute top-3 left-4 w-0.5 h-0.5 bg-white rounded-full opacity-40" />
          <span className="absolute bottom-2 left-3 w-0.5 h-0.5 bg-white rounded-full opacity-50" />
        </>
      )}
    </button>
  );
}
