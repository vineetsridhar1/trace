import { setPlatform } from "@trace/client-core";

const TOKEN_KEY = "trace_token";

setPlatform({
  apiUrl: import.meta.env.VITE_API_URL ?? "",
  storage: {
    getItem: (k) => localStorage.getItem(k),
    setItem: (k, v) => localStorage.setItem(k, v),
    removeItem: (k) => localStorage.removeItem(k),
  },
  secureStorage: {
    getToken: async () => localStorage.getItem(TOKEN_KEY),
    setToken: async (t) => localStorage.setItem(TOKEN_KEY, t),
    clearToken: async () => localStorage.removeItem(TOKEN_KEY),
  },
  fetch: window.fetch.bind(window),
  createWebSocket: (url, protocols) => new WebSocket(url, protocols),
});
