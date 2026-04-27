import { getPlatform } from "@trace/client-core";

const LAST_PUSH_REGISTRATION_KEY = "trace_push_token";

export interface PushRegistration {
  token: string;
  userId: string | null;
  organizationId: string | null;
}

function parseRegistration(raw: string): PushRegistration | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Record<string, unknown>;
    return typeof value.token === "string"
      ? {
          token: value.token,
          userId: typeof value.userId === "string" ? value.userId : null,
          organizationId: typeof value.organizationId === "string" ? value.organizationId : null,
        }
      : null;
  } catch {
    return { token: raw, userId: null, organizationId: null };
  }
}

export async function readPushRegistration(): Promise<PushRegistration | null> {
  const raw = await getPlatform().storage.getItem(LAST_PUSH_REGISTRATION_KEY);
  return raw ? parseRegistration(raw) : null;
}

export async function writePushRegistration(registration: PushRegistration): Promise<void> {
  await getPlatform().storage.setItem(LAST_PUSH_REGISTRATION_KEY, JSON.stringify(registration));
}

export async function clearPushRegistration(): Promise<void> {
  await getPlatform().storage.removeItem(LAST_PUSH_REGISTRATION_KEY);
}
