export interface Platform {
  apiUrl: string;
  clientSource: string;
  authMode: "cookie" | "bearer";
  storage: {
    getItem(key: string): string | null | Promise<string | null>;
    setItem(key: string, value: string): void | Promise<void>;
    removeItem(key: string): void | Promise<void>;
  };
  secureStorage: {
    getToken(): Promise<string | null>;
    setToken(token: string): Promise<void>;
    clearToken(): Promise<void>;
  };
  fetch: typeof fetch;
  createWebSocket: (url: string, protocols?: string[]) => WebSocket;
}

let platform: Platform | null = null;

export function setPlatform(impl: Platform): void {
  platform = impl;
}

export function getPlatform(): Platform {
  if (!platform) {
    throw new Error(
      "@trace/client-core: Platform not set. Call setPlatform() during app bootstrap before using client-core APIs.",
    );
  }
  return platform;
}
