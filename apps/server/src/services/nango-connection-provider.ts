import { createHmac, timingSafeEqual } from "crypto";
import { ValidationError } from "../lib/errors.js";

const DEFAULT_NANGO_BASE_URL = "https://api.nango.dev";
const DEFAULT_NANGO_TIMEOUT_MS = 30_000;
const DEFAULT_NANGO_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

type NangoConnectSessionResponse = {
  data?: {
    connect_link?: unknown;
    expires_at?: unknown;
  };
};

export type NangoProxyResponse = {
  status: number;
  contentType: string | null;
  body: Buffer;
};

function nangoBaseUrl(): string {
  return (process.env.NANGO_BASE_URL?.trim() || DEFAULT_NANGO_BASE_URL).replace(/\/$/, "");
}

function nangoSecretKey(): string {
  const value = process.env.NANGO_SECRET_KEY?.trim();
  if (!value) throw new ValidationError("Nango is not configured");
  return value;
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function nangoRequestSignal(): AbortSignal {
  return AbortSignal.timeout(
    positiveIntegerEnv("NANGO_REQUEST_TIMEOUT_MS", DEFAULT_NANGO_TIMEOUT_MS),
  );
}

async function readBoundedBody(response: Response): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const maxBytes = positiveIntegerEnv("NANGO_MAX_RESPONSE_BYTES", DEFAULT_NANGO_MAX_RESPONSE_BYTES);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    const chunk = Buffer.from(next.value);
    total += chunk.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Nango response exceeded the configured size limit");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function nangoError(response: Response): Promise<Error> {
  const text = await response.text().catch(() => "");
  let message = text;
  try {
    const body = JSON.parse(text) as unknown;
    if (body && typeof body === "object" && "error" in body) {
      const error = body.error;
      if (typeof error === "string") message = error;
      if (error && typeof error === "object" && "message" in error) {
        const nested = error.message;
        if (typeof nested === "string") message = nested;
      }
    }
  } catch {
    // Nango occasionally returns plain text errors.
  }
  return new Error(`Nango request failed (${response.status})${message ? `: ${message}` : ""}`);
}

export class NangoConnectionProvider {
  isConfigured(): boolean {
    return Boolean(process.env.NANGO_SECRET_KEY?.trim());
  }

  async createConnectSession(input: {
    organizationId: string;
    userId: string;
    userEmail: string;
    userName: string;
    providerConfigKey: string;
    displayName: string;
    kind: "personal" | "service";
  }): Promise<{ connectLink: string; expiresAt: Date }> {
    const response = await fetch(`${nangoBaseUrl()}/connect/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${nangoSecretKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        allowed_integrations: [input.providerConfigKey],
        tags: {
          end_user_id: input.userId,
          end_user_email: input.userEmail,
          end_user_display_name: input.userName,
          organization_id: input.organizationId,
          trace_connection_kind: input.kind,
          trace_display_name: input.displayName,
        },
      }),
      signal: nangoRequestSignal(),
    });
    if (!response.ok) throw await nangoError(response);
    const body = (await response.json()) as NangoConnectSessionResponse;
    const connectLink = body.data?.connect_link;
    const expiresAt = body.data?.expires_at;
    if (typeof connectLink !== "string" || typeof expiresAt !== "string") {
      throw new Error("Nango returned an invalid connect session");
    }
    const parsedExpiry = new Date(expiresAt);
    if (Number.isNaN(parsedExpiry.getTime())) {
      throw new Error("Nango returned an invalid connect session expiry");
    }
    return { connectLink, expiresAt: parsedExpiry };
  }

  async deleteConnection(connectionId: string, providerConfigKey: string): Promise<void> {
    const url = new URL(`${nangoBaseUrl()}/connections/${encodeURIComponent(connectionId)}`);
    url.searchParams.set("provider_config_key", providerConfigKey);
    const response = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${nangoSecretKey()}` },
      signal: nangoRequestSignal(),
    });
    if (!response.ok && response.status !== 404) throw await nangoError(response);
  }

  async proxy(input: {
    connectionId: string;
    providerConfigKey: string;
    method: string;
    path: string;
    query: string | null;
    contentType: string | null;
    body: Buffer;
  }): Promise<NangoProxyResponse> {
    const url = new URL(`${nangoBaseUrl()}/proxy${input.path}`);
    if (input.query) url.search = input.query;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${nangoSecretKey()}`,
      "Connection-Id": input.connectionId,
      "Provider-Config-Key": input.providerConfigKey,
      Retries: "2",
    };
    if (input.contentType) headers["Content-Type"] = input.contentType;
    const response = await fetch(url, {
      method: input.method,
      headers,
      body:
        input.method === "GET" || input.method === "HEAD" || input.body.byteLength === 0
          ? undefined
          : Uint8Array.from(input.body).buffer,
      signal: nangoRequestSignal(),
    });
    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      body: await readBoundedBody(response),
    };
  }

  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean {
    const signingKey = process.env.NANGO_WEBHOOK_SIGNING_KEY?.trim();
    if (!signingKey || !signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
    const expected = createHmac("sha256", signingKey).update(rawBody).digest();
    const received = Buffer.from(signature, "hex");
    return received.length === expected.length && timingSafeEqual(received, expected);
  }
}

export const nangoConnectionProvider = new NangoConnectionProvider();
