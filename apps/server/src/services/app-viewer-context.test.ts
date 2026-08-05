import { describe, expect, it } from "vitest";
import { createAppViewerContextToken, verifyAppViewerContextToken } from "./app-viewer-context.js";

describe("app viewer context", () => {
  it("round trips an endpoint-scoped viewer identity", () => {
    const context = {
      tokenType: "app_viewer_context" as const,
      userId: "viewer-1",
      organizationId: "org-1",
      sessionGroupId: "app-1",
      endpointId: "endpoint-1",
    };

    expect(verifyAppViewerContextToken(createAppViewerContextToken(context))).toEqual(
      expect.objectContaining(context),
    );
  });

  it("rejects forged tokens", () => {
    expect(verifyAppViewerContextToken("not-a-token")).toBeNull();
  });
});
