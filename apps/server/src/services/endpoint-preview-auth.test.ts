import { describe, expect, it } from "vitest";
import {
  createEndpointPreviewToken,
  endpointPreviewCookieHeader,
  endpointPreviewTokenFromCookie,
  verifyEndpointPreviewToken,
} from "./endpoint-preview-auth.js";

describe("endpoint preview auth", () => {
  it("round-trips a short-lived endpoint-scoped credential through its cookie", () => {
    const credential = createEndpointPreviewToken({
      userId: "user-1",
      organizationId: "org-1",
      endpointId: "endpoint-1",
    });
    const cookie = endpointPreviewCookieHeader(credential.token, credential.expiresAt);
    const token = endpointPreviewTokenFromCookie(cookie);

    expect(token).toBe(credential.token);
    expect(verifyEndpointPreviewToken(token ?? "")).toMatchObject({
      userId: "user-1",
      organizationId: "org-1",
      endpointId: "endpoint-1",
    });
  });

  it("rejects malformed credentials", () => {
    expect(verifyEndpointPreviewToken("not-a-token")).toBeNull();
  });
});
