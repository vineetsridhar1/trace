import { describe, expect, it } from "vitest";
import {
  PREVIEW_CREDENTIAL_RETRY_MS,
  previewCredentialRenewAt,
} from "./preview-credential-renewal";

describe("previewCredentialRenewAt", () => {
  it("renews a valid credential one minute before expiration", () => {
    const now = Date.parse("2030-01-01T00:00:00.000Z");

    expect(previewCredentialRenewAt("2030-01-01T00:05:00.000Z", now)).toBe(now + 4 * 60_000);
  });

  it("renews immediately when the credential is already near expiration", () => {
    const now = Date.parse("2030-01-01T00:00:00.000Z");

    expect(previewCredentialRenewAt("2030-01-01T00:00:30.000Z", now)).toBe(now);
  });

  it("backs off malformed expiration values", () => {
    const now = Date.parse("2030-01-01T00:00:00.000Z");

    expect(previewCredentialRenewAt("invalid", now)).toBe(now + PREVIEW_CREDENTIAL_RETRY_MS);
  });
});
