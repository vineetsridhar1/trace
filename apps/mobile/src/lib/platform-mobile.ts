import { setPlatform } from "@trace/client-core";
import * as SecureStore from "expo-secure-store";
import { createMMKV } from "react-native-mmkv";

const storage = createMMKV({ id: "trace" });
const TOKEN_KEY = "trace_token";

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "";
if (__DEV__ && !apiUrl) {
  console.warn(
    "[trace] EXPO_PUBLIC_API_URL is not set — network calls will produce invalid relative URLs. " +
      "Start Metro with `EXPO_PUBLIC_API_URL=http://<lan-ip>:4000 pnpm --filter @trace/mobile start`.",
  );
}

setPlatform({
  apiUrl,
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
