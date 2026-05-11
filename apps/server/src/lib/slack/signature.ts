import { createHmac, timingSafeEqual } from "crypto";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export function verifySlackSignature(input: {
  signingSecret: string;
  rawBody: string;
  timestamp: string | undefined;
  signature: string | undefined;
}): boolean {
  const { signingSecret, rawBody, timestamp, signature } = input;
  if (!timestamp || !signature) return false;

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(Date.now() - tsNum * 1000) > FIVE_MINUTES_MS) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const expected = "v0=" + createHmac("sha256", signingSecret).update(base).digest("hex");

  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
