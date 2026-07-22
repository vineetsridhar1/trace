import { describe, expect, it } from "vitest";
import {
  findReadyPreviewEndpoint,
  isLivePreviewRuntimeAvailable,
} from "./app-preview-readiness";

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

describe("isLivePreviewRuntimeAvailable", () => {
  it("only uses live endpoints while their runtime can serve traffic", () => {
    expect(isLivePreviewRuntimeAvailable("connected")).toBe(true);
    expect(isLivePreviewRuntimeAvailable("degraded")).toBe(true);
    expect(isLivePreviewRuntimeAvailable("disconnected")).toBe(false);
    expect(isLivePreviewRuntimeAvailable("deprovisioned")).toBe(false);
    expect(isLivePreviewRuntimeAvailable("provisioning")).toBe(false);
  });
});
