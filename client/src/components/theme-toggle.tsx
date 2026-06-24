/**
 * Theme toggle — dark/light with full persistence across navigation + refresh.
 *
 * 2026-06 BUGFIX (Tony's report): "when you change a page, it goes back to
 * light mode instead of staying in dark." Two real bugs were causing this:
 *
 *   1. useState was initialised to "light" — ignoring localStorage. The page
 *      always rendered in light mode for one frame, then flipped to dark in
 *      the useEffect. On every navigation, the toggle's button rendered
 *      "light" briefly even if the rest of the page was dark.
 *
 *   2. The initial dark class was applied INSIDE useEffect, which runs
 *      AFTER React commits the first render. So every page load showed a
 *      brief flash of light before snapping to dark.
 *
 * Both fixed here:
 *   - useState now uses a lazy initialiser that reads localStorage SYNC, so
 *     the first render is correct.
 *   - The actual <html> class is applied by a blocking <script> tag in
 *     index.html that runs BEFORE React mounts — see the theme-bootstrap
 *     block in client/index.html. That kills the flash entirely.
 *   - Toggle now properly sets AND removes the dark class (the old code
 *     only added it on init, never removed it on light-mode pageload).
 *   - Listens to the storage event so multi-tab toggles sync.
 */
import { useState, useEffect, useCallback } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";
const STORAGE_KEY = "theme";

/**
 * Read the current theme from localStorage or OS preference.
 * Safe to call from the useState lazy initialiser.
 */
function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Apply / un-apply the `dark` class on <html>. Cheap, idempotent. */
function applyThemeClass(theme: Theme): void {
  if (typeof document === "undefined") return;
  if (theme === "dark") document.documentElement.classList.add("dark");
  else                  document.documentElement.classList.remove("dark");
}

export function ThemeToggle() {
  // Lazy initialiser — runs ONCE, synchronously, before the first render.
  // So the toggle's UI matches the actual <html> dark class from the very
  // first paint. No flash, no wrong state on navigation.
  const [theme, setTheme] = useState<Theme>(() => readInitialTheme());
  const [isAnimating, setIsAnimating] = useState(false);

  // Re-sync the class on every theme change. Safety net — the blocking
  // script in index.html already set it correctly on first load, but if
  // anything else modifies <html>.dark we re-assert.
  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  // Cross-tab sync — if the user toggles theme in tab A, tab B updates too.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      const next = e.newValue === "dark" ? "dark" : "light";
      setTheme(next);
      applyThemeClass(next);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggleTheme = useCallback(() => {
    setIsAnimating(true);
    setTheme((prev) => {
      const next: Theme = prev === "light" ? "dark" : "light";
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
      applyThemeClass(next);
      return next;
    });
    setTimeout(() => setIsAnimating(false), 500);
  }, []);

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "relative w-14 h-8 rounded-full p-1 transition-all duration-500",
        theme === "light"
          ? "bg-gradient-to-r from-blue-400 to-cyan-300"
          : "bg-gradient-to-r from-indigo-800 to-purple-900"
      )}
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
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
