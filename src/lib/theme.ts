// Light/dark theme, persisted per-user in localStorage and applied to <html>.
// Applied from a useEffect in __root.tsx so it runs on every page (including the
// login screens), not only inside the app shell.

export type Theme = "light" | "dark" | "system";

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
}

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  return (localStorage.getItem("thursd-theme") as Theme) ?? "system";
}

export function saveTheme(theme: Theme) {
  localStorage.setItem("thursd-theme", theme);
  applyTheme(theme);
}

export function applyStoredTheme() {
  applyTheme(getStoredTheme());
}
