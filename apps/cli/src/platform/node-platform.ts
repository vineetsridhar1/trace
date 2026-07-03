import type { Platform } from "@trace/client-core";
import { WebSocket as NodeWebSocket } from "ws";
import {
  clearToken,
  getConfigValue,
  getToken,
  removeConfigValue,
  setConfigValue,
  setToken,
} from "../config.js";

export function createNodePlatform(options: { serverUrl: string }): Platform {
  return {
    apiUrl: options.serverUrl,
    clientSource: "cli",
    authMode: "bearer",
    storage: {
      getItem: (key) => getConfigValue(key),
      setItem: (key, value) => {
        setConfigValue(key, value);
      },
      removeItem: (key) => {
        removeConfigValue(key);
      },
    },
    secureStorage: {
      getToken: () => Promise.resolve(getToken()),
      setToken: (token) => {
        setToken(token);
        return Promise.resolve();
      },
      clearToken: () => {
        clearToken();
        return Promise.resolve();
      },
    },
    fetch: globalThis.fetch,
    createWebSocket: (url, protocols) => new NodeWebSocket(url, protocols) as unknown as WebSocket,
  };
}
