import { describe, expect, it } from "vitest";
import { findReadyPreviewEndpoint } from "./app-preview-readiness";

const endpoint = {
  id: "endpoint-1",
  sessionGroupId: "group-1",
  appConfigId: "app",
  processConfigId: "dev",
  status: "enabled",
  url: "https://preview.test",
};

describe("findReadyPreviewEndpoint", () => {
  it("keeps the skeleton visible while forwarding is off", () => {
    expect(
      findReadyPreviewEndpoint("group-1", [{ ...endpoint, status: "disabled" }]),
    ).toBeUndefined();
  });

  it("returns the endpoint once forwarding is enabled, with no process of its own", () => {
    expect(findReadyPreviewEndpoint("group-1", [endpoint])).toBe(endpoint);
  });

  it("does not match an endpoint without a URL", () => {
    expect(findReadyPreviewEndpoint("group-1", [{ ...endpoint, url: null }])).toBeUndefined();
  });

  it("does not match an endpoint from another session group", () => {
    expect(findReadyPreviewEndpoint("group-2", [endpoint])).toBeUndefined();
  });
});
