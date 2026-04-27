import { setPlatform } from "@trace/client-core";

setPlatform({
  apiUrl: import.meta.env.VITE_API_URL ?? "",
  authMode: "cookie",
  storage: {
    getItem: (key: string) => localStorage.getItem(key),
    setItem: (key: string, value: string) => localStorage.setItem(key, value),
    removeItem: (key: string) => localStorage.removeItem(key),
  },
  secureStorage: {
    getToken: async () => null,
    setToken: async () => {},
    clearToken: async () => {},
  },
  fetch: window.fetch.bind(window),
  createWebSocket: (url: string, protocols?: string[]) => new WebSocket(url, protocols),
});
