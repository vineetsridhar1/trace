import { asJsonObject, type JsonObject } from "./json.js";

function nonEmptyStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export function attachmentKeysFromPayload(payload: unknown): string[] {
  const data = asJsonObject(payload);
  if (!data) return [];

  const attachmentKeys = nonEmptyStringArray(data.attachmentKeys);
  if (attachmentKeys.length > 0) return attachmentKeys;

  return nonEmptyStringArray(data.imageKeys);
}

export function hasAttachmentKeys(payload: unknown): boolean {
  return attachmentKeysFromPayload(payload).length > 0;
}

function hasVisibleText(payload: JsonObject | undefined, field: string): boolean {
  const value = payload?.[field];
  return typeof value === "string" && value.trim() !== "";
}

export function hasVisibleUserSessionContent(eventType: string, payload: unknown): boolean {
  const data = asJsonObject(payload);

  if (eventType === "session_started") {
    return hasVisibleText(data, "prompt") || hasAttachmentKeys(data);
  }

  if (eventType === "message_sent") {
    return hasVisibleText(data, "text") || hasAttachmentKeys(data);
  }

  return false;
}
