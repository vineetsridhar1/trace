import { generateUUID } from "@trace/client-core";
import { createMMKV } from "react-native-mmkv";

const storage = createMMKV({ id: "trace" });

const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";
const CONNECTION_MODE_KEY = "trace_connection_mode";
const HOSTED_API_URL_KEY = "trace_hosted_api_url";
const LOCAL_API_URL_KEY = "trace_local_api_url";
const INSTALL_ID_KEY = "trace_local_install_id";

export type ConnectionMode = "hosted" | "paired_local";

function normalizeApiUrl(input: string): string {
  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("Host URL must start with http:// or https://");
  }
  return trimmed.replace(/\/+$/, "");
}

export function getHostedApiUrl(): string {
  const override = storage.getString(HOSTED_API_URL_KEY);
  return (override ?? DEFAULT_API_URL).trim().replace(/\/+$/, "");
}

export function hasHostedApiUrlConfigured(): boolean {
  return /^https?:\/\//.test(getHostedApiUrl());
}

export function getPairedLocalApiUrl(): string | null {
  const value = storage.getString(LOCAL_API_URL_KEY);
  return value ? value.replace(/\/+$/, "") : null;
}

export function getConnectionMode(): ConnectionMode {
  return storage.getString(CONNECTION_MODE_KEY) === "paired_local" ? "paired_local" : "hosted";
}

export function getActiveApiUrl(): string {
  if (getConnectionMode() === "paired_local") {
    return getPairedLocalApiUrl() ?? getHostedApiUrl();
  }
  return getHostedApiUrl();
}

export function getGraphqlUrls(): { httpUrl: string; wsUrl: string } {
  const apiUrl = getActiveApiUrl();
  const wsBase = apiUrl
    ? apiUrl.replace(/^https?:/, apiUrl.startsWith("https://") ? "wss:" : "ws:")
    : "";
  return {
    httpUrl: apiUrl ? `${apiUrl}/graphql` : "",
    wsUrl: wsBase ? `${wsBase}/ws` : "",
  };
}

export function activateHostedConnection(baseUrl?: string): void {
  if (baseUrl?.trim()) {
    storage.set(HOSTED_API_URL_KEY, normalizeApiUrl(baseUrl));
  }
  storage.set(CONNECTION_MODE_KEY, "hosted");
}

export function activatePairedLocalConnection(baseUrl: string): string {
  const normalized = normalizeApiUrl(baseUrl);
  storage.set(LOCAL_API_URL_KEY, normalized);
  storage.set(CONNECTION_MODE_KEY, "paired_local");
  return normalized;
}

export function getOrCreateLocalInstallId(): string {
  const existing = storage.getString(INSTALL_ID_KEY);
  if (existing) return existing;
  const next = generateUUID();
  storage.set(INSTALL_ID_KEY, next);
  return next;
}
