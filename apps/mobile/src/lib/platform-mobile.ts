import { setPlatform } from "@trace/client-core";
import * as SecureStore from "expo-secure-store";
import { createMMKV } from "react-native-mmkv";
import { getActiveApiUrl, hasHostedApiUrlConfigured } from "@/lib/connection-target";

const storage = createMMKV({ id: "trace" });
const TOKEN_KEY = "trace_token";

if (__DEV__ && !hasHostedApiUrlConfigured()) {
  console.warn(
    "[trace] EXPO_PUBLIC_API_URL is not set — hosted GitHub sign-in is disabled until you restart Metro " +
      "with `EXPO_PUBLIC_API_URL=http://<host>:4000`. Local QR pairing still works.",
  );
}

setPlatform({
  get apiUrl() {
    return getActiveApiUrl();
  },
  authMode: "bearer",
  storage: {
    getItem: (k) => storage.getString(k) ?? null,
    setItem: (k, v) => storage.set(k, v),
    removeItem: (k) => {
      storage.remove(k);
    },
  },
  secureStorage: {
    getToken: () => SecureStore.getItemAsync(TOKEN_KEY),
    setToken: (t) => SecureStore.setItemAsync(TOKEN_KEY, t),
    clearToken: () => SecureStore.deleteItemAsync(TOKEN_KEY),
  },
  fetch: global.fetch,
  createWebSocket: (url, protocols) => new WebSocket(url, protocols),
});
