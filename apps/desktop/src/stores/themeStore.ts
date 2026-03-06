import { create } from 'zustand';

export type ThemeName = 'neutral' | 'tokyonight';

interface ThemeState {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

function applyTheme(theme: ThemeName) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('trace-theme', theme);
}

// Eagerly apply saved theme before React renders to prevent flash
const saved = (localStorage.getItem('trace-theme') as ThemeName) || 'neutral';
applyTheme(saved);

export const useThemeStore = create<ThemeState>((set) => ({
  theme: saved,
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
}));
