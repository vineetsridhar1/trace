/**
 * UUIDv4 generator that works in non-secure contexts.
 * `crypto.randomUUID` is only available in secure contexts (HTTPS/localhost),
 * but `crypto.getRandomValues` works over plain HTTP, so we build the UUID
 * ourselves when `randomUUID` isn't exposed.
 */
export function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    // Non-cryptographic fallback. Only acceptable because these IDs are
    // optimistic client-side temp IDs that get replaced by server-issued IDs.
    // Do NOT use this helper for tokens, secrets, or anything security-sensitive.
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }

  // Set the version (4) and variant (10xx) bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i++) hex.push(bytes[i].toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}
