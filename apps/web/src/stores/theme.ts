import { create } from "zustand";

export type ThemePreference = "dark" | "light";

export const THEME_STORAGE_KEY = "trace:theme";
export const DEFAULT_THEME: ThemePreference = "dark";

const THEME_COLOR_DARK = "#0A0A0B";
const THEME_COLOR_LIGHT = "#F4F4F5";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "dark" || value === "light";
}

export function readStoredTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(value)) return value;
  } catch {
    // Ignore storage access failures (private mode, sandboxed iframes).
  }
  return DEFAULT_THEME;
}

export function applyTheme(theme: ThemePreference): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", theme === "dark" ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
  }
}

interface ThemeState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: readStoredTheme(),
  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Preference still applies for the current session if storage is unavailable.
    }
    applyTheme(theme);
    set({ theme });
  },
}));

applyTheme(readStoredTheme());
