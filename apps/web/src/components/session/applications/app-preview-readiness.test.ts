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
  it("keeps the skeleton visible while the app process is starting", () => {
    expect(
      findReadyPreviewEndpoint("group-1", [endpoint], [{ ...endpoint, status: "starting" }]),
    ).toBeUndefined();
  });

  it("returns the endpoint once its app process is running", () => {
    expect(
      findReadyPreviewEndpoint("group-1", [endpoint], [{ ...endpoint, status: "running" }]),
    ).toBe(endpoint);
  });

  it("does not match a running process from another app", () => {
    expect(
      findReadyPreviewEndpoint(
        "group-1",
        [endpoint],
        [{ ...endpoint, processConfigId: "worker", status: "running" }],
      ),
    ).toBeUndefined();
  });
});
