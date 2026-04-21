/**
 * Centralized access to mobile env vars. `EXPO_PUBLIC_*` is inlined at
 * bundle time, so these are static after the JS bundle ships.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

export const WS_URL = API_URL
  ? API_URL.replace(/^https?:/, API_URL.startsWith("https") ? "wss:" : "ws:")
  : "";

export const HTTP_GRAPHQL_URL = API_URL ? `${API_URL}/graphql` : "";
export const WS_GRAPHQL_URL = WS_URL ? `${WS_URL}/ws` : "";

export function isApiUrlConfigured(): boolean {
  return /^https?:\/\//.test(API_URL);
}
